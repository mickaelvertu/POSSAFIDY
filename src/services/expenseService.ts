import { collection, doc, getDocs, query, setDoc, where, writeBatch } from "firebase/firestore";
import { db, runOnlineTransaction } from "../firebase";
import { AuditLog, Expense, SalaryAdvance } from "../types";

const EXPENSES_COLLECTION = "expenses";

// Firestore rejects undefined at any depth (including nested audit snapshots), so strip it recursively.
function omitUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(omitUndefined) as T;
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .map(([key, fieldValue]) => [key, omitUndefined(fieldValue)])
  ) as T;
}

export async function loadExpenses(storeIds?: string[], userId?: string): Promise<Expense[]> {
  const rows = storeIds === undefined
    ? (await getDocs(collection(db, EXPENSES_COLLECTION))).docs.map(item => item.data() as Expense)
    : (await Promise.all(storeIds.map(storeId =>
        getDocs(query(collection(db, EXPENSES_COLLECTION), where("store_id", "==", storeId)))
      ))).flatMap(snapshot => snapshot.docs.map(item => item.data() as Expense));
  if (userId && storeIds !== undefined) {
    rows.push(...(await getDocs(query(collection(db, EXPENSES_COLLECTION), where("created_by", "==", userId)))).docs.map(item => item.data() as Expense));
  }
  return [...new Map(rows.map(item => [item.id, item])).values()]
    .sort((left, right) => right.expense_date - left.expense_date);
}

export async function validateExpense(
  expense: Expense,
  userId: string,
  auditLog: AuditLog,
  isSuperAdmin = false,
  isAdmin = false,
  salaryAdvance?: SalaryAdvance,
  salaryAdvanceAuditLog?: AuditLog
): Promise<Expense> {
  return runOnlineTransaction(async transaction => {
    const ref = doc(db, EXPENSES_COLLECTION, expense.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().status !== "DRAFT") throw new Error("Cette dépense n'est plus un brouillon.");
    if (!isSuperAdmin && snapshot.data().created_by !== userId) throw new Error("Vous pouvez uniquement valider vos propres dépenses.");
    const current = snapshot.data() as Expense;
    if (current.category === "SALARY_ADVANCE") {
      if (!isAdmin || !salaryAdvance || !salaryAdvanceAuditLog) {
        throw new Error("Seul un administrateur peut valider une avance sur salaire.");
      }
      if (
        current.payment_status !== "PAID" ||
        !current.employee_id ||
        current.salary_advance_id !== `advance-${current.id}` ||
        current.salary_advance_id !== salaryAdvance.id ||
        salaryAdvance.expense_id !== current.id ||
        salaryAdvance.employee_id !== current.employee_id ||
        salaryAdvance.amount !== current.amount ||
        salaryAdvance.advance_date !== current.expense_date ||
        salaryAdvance.payment_method !== current.payment_method ||
        salaryAdvance.reason !== current.description ||
        salaryAdvance.status !== "OUTSTANDING" ||
        salaryAdvance.created_by !== userId
      ) {
        throw new Error("Les données de l'avance ne correspondent plus au brouillon de dépense.");
      }
      const employeeRef = doc(db, "employees", current.employee_id);
      const advanceRef = doc(db, "salaryAdvances", salaryAdvance.id);
      const [employeeSnapshot, advanceSnapshot] = await Promise.all([
        transaction.get(employeeRef),
        transaction.get(advanceRef)
      ]);
      if (!employeeSnapshot.exists() || !employeeSnapshot.data().is_active) {
        throw new Error("L'employé sélectionné est introuvable ou inactif.");
      }
      if (advanceSnapshot.exists()) {
        throw new Error("Une avance existe déjà pour cette dépense.");
      }
      const employee = employeeSnapshot.data();
      const employeeName = `${employee.first_name} ${employee.last_name}`;
      if (current.employee_name !== employeeName || salaryAdvance.employee_name !== employeeName) {
        throw new Error("L'employé associé à cette avance a changé. Rechargez la dépense.");
      }
    } else if (salaryAdvance || salaryAdvanceAuditLog) {
      throw new Error("Une avance ne peut être créée qu'à partir d'une dépense de type avance sur salaire.");
    }

    const validatedAt = Date.now();
    const updated = { ...current, status: "VALIDATED", validated_by: userId, validated_at: validatedAt } as Expense;
    transaction.update(ref, { status: updated.status, validated_by: updated.validated_by, validated_at: updated.validated_at });
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined({ ...auditLog, old_value: snapshot.data(), new_value: updated }));
    if (salaryAdvance && salaryAdvanceAuditLog) {
      transaction.set(doc(db, "salaryAdvances", salaryAdvance.id), omitUndefined(salaryAdvance));
      transaction.set(doc(db, "auditLogs", salaryAdvanceAuditLog.id), omitUndefined({
        ...salaryAdvanceAuditLog,
        old_value: undefined,
        new_value: salaryAdvance
      }));
    }
    return updated;
  });
}

export async function updateDraftExpense(
  original: Expense,
  updated: Expense,
  userId: string,
  auditLog: AuditLog
): Promise<Expense> {
  if (
    original.status !== "DRAFT" ||
    updated.status !== "DRAFT" ||
    original.created_by !== userId ||
    updated.id !== original.id ||
    updated.expense_number !== original.expense_number ||
    updated.created_by !== original.created_by ||
    updated.created_at !== original.created_at
  ) {
    throw new Error("Seul le créateur peut modifier sa dépense tant qu'elle est en brouillon.");
  }

  const editableFields: Array<keyof Expense> = [
    "category", "description", "amount", "expense_date", "store_id", "store_name",
    "payee", "employee_id", "employee_name", "salary_advance_id",
    "payment_method", "payment_status", "reference", "notes"
  ];
  return runOnlineTransaction(async transaction => {
    const expenseRef = doc(db, EXPENSES_COLLECTION, original.id);
    const snapshot = await transaction.get(expenseRef);
    if (!snapshot.exists()) throw new Error("Cette dépense n'existe plus.");
    const current = snapshot.data() as Expense;
    if (
      current.status !== "DRAFT" ||
      current.created_by !== userId ||
      editableFields.some(field => JSON.stringify(current[field]) !== JSON.stringify(original[field]))
    ) {
      throw new Error("La dépense a changé depuis son ouverture. Rechargez les données avant de la modifier.");
    }

    transaction.set(expenseRef, omitUndefined(updated));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined({
      ...auditLog,
      old_value: current,
      new_value: updated
    }));
    return updated;
  });
}

export async function deleteExpense(expense: Expense, auditLog: AuditLog): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, EXPENSES_COLLECTION, expense.id));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}

export async function saveExpense(expense: Expense, auditLog?: AuditLog): Promise<void> {
  if (!auditLog) {
    await setDoc(doc(db, EXPENSES_COLLECTION, expense.id), omitUndefined(expense));
    return;
  }
  const batch = writeBatch(db);
  batch.set(doc(db, EXPENSES_COLLECTION, expense.id), omitUndefined(expense));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}
