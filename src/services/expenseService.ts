import { collection, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from "firebase/firestore";
import { auth, db, runOnlineTransaction } from "../firebase";
import { AuditLog, Expense, SalaryAdvance } from "../types";
import { prepareExpenseRefund, prepareFundDebit } from "./treasuryService";

const EXPENSES_COLLECTION = "expenses";
export const STORE_EXPENSE_FUNDS = "__STORE__";

async function storePaymentFields(transaction: import("firebase/firestore").Transaction, expense: Expense, userId: string, timestamp: number) {
  if (!expense.store_id) throw new Error("Sélectionnez un magasin pour utiliser ses fonds.");
  const store = await transaction.get(doc(db, "stores", expense.store_id));
  if (!store.exists() || !store.data().is_active) throw new Error("Le magasin est introuvable ou inactif.");
  return { funding_source: "STORE" as const, paid_by_name: store.data().name as string, payment_recorded_by: userId, paid_at: timestamp };
}

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
  salaryAdvanceAuditLog?: AuditLog,
  treasuryFundId?: string
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
    if (isAdmin && current.payment_status === "PAID" && !treasuryFundId) {
      throw new Error("Choisissez votre fonds de trésorerie pour régler cette dépense.");
    }
    const storeFields = isAdmin && current.payment_status === "PAID" && treasuryFundId === STORE_EXPENSE_FUNDS
      ? await storePaymentFields(transaction, current, userId, validatedAt) : null;
    const debit = isAdmin && current.payment_status === "PAID" && !storeFields
      ? await prepareFundDebit(transaction, treasuryFundId!, userId, current.amount) : null;
    const paymentFields = debit ? {
      treasury_fund_id: treasuryFundId!, treasury_movement_id: `expense-${current.id}`,
      funding_source: "ADMIN_FUND" as const, payment_recorded_by: userId,
      paid_by: userId, paid_by_name: debit.fund.owner_name, paid_at: validatedAt
    } : storeFields || {};
    if (debit) debit.apply({ id: `expense-${current.id}`, kind: "EXPENSE", fund_id: treasuryFundId!,
      destination_fund_id: "", from_user: userId, to_user: "", amount: current.amount,
      reference: current.expense_number, purchase_id: "", expense_id: current.id, created_by: userId, created_at: validatedAt });
    const updated = { ...current, ...paymentFields, status: "VALIDATED", validated_by: userId, validated_at: validatedAt } as Expense;
    transaction.update(ref, { status: updated.status, validated_by: updated.validated_by, validated_at: updated.validated_at, ...paymentFields });
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
  const user = auth.currentUser;
  if (!user) throw new Error("Connexion requise.");
  const profile = await getDoc(doc(db, "users", user.uid));
  if (profile.data()?.role !== "SUPER_ADMIN") throw new Error("Suppression réservée au SUPER_ADMIN.");
  await runOnlineTransaction(async transaction => {
    const ref = doc(db, EXPENSES_COLLECTION, expense.id);
    const current = await transaction.get(ref);
    if (!current.exists()) throw new Error("Cette dépense n'existe plus.");
    const value = current.data() as Expense;
    if (value.status !== "DRAFT" && value.status !== "CANCELLED") throw new Error("Annulez cette dépense avant de la supprimer.");
    if (value.treasury_movement_id && !value.treasury_reversal_id) throw new Error("Le paiement doit être annulé avant la suppression.");
    transaction.delete(ref);
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined({ ...auditLog, old_value: current.data() }));
  });
}

export async function cancelExpense(expenseId: string, reason: string, userName: string, auditLog: AuditLog): Promise<Expense> {
  const userId = auth.currentUser?.uid;
  if (!userId || !reason.trim()) throw new Error("Indiquez le motif de l'annulation.");
  return runOnlineTransaction(async transaction => {
    const ref = doc(db, EXPENSES_COLLECTION, expenseId);
    const [snapshot, profile] = await Promise.all([transaction.get(ref), transaction.get(doc(db, "users", userId))]);
    if (!profile.exists() || profile.data().status !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(profile.data().role)) {
      throw new Error("Annulation réservée aux administrateurs actifs.");
    }
    if (!snapshot.exists()) throw new Error("Cette dépense n'existe plus.");
    const current = snapshot.data() as Expense;
    if (current.status === "CANCELLED") throw new Error("Cette dépense est déjà annulée.");
    const advanceRef = current.salary_advance_id ? doc(db, "salaryAdvances", current.salary_advance_id) : null;
    const advance = advanceRef ? await transaction.get(advanceRef) : null;
    if (advance?.exists() && (advance.data().status !== "OUTSTANDING" || (advance.data().amount_deducted ?? 0) !== 0 || advance.data().payslip_id)) {
      throw new Error("Cette avance est déjà liée à une retenue sur salaire. Corrigez la paie avant de l'annuler.");
    }
    const refund = current.treasury_movement_id ? await prepareExpenseRefund(transaction, current) : null;
    const now = Date.now();
    const reversalId = `expense-refund-${current.id}`;
    const fields = { status: "CANCELLED" as const, cancelled_by: userId, cancelled_by_name: userName,
      cancelled_at: now, cancellation_reason: reason.trim(), ...(refund ? { treasury_reversal_id: reversalId } : {}) };
    if (refund) refund.apply({ id: reversalId, kind: "EXPENSE_REFUND", fund_id: "", destination_fund_id: refund.fund.id,
      from_user: "", to_user: refund.fund.owner_id, amount: current.amount, reference: `${current.expense_number} / ${reason.trim()}`,
      purchase_id: "", expense_id: current.id, created_by: userId, created_at: now });
    const updated = { ...current, ...fields };
    transaction.update(ref, fields);
    if (advanceRef && advance?.exists()) transaction.delete(advanceRef);
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined({ ...auditLog, old_value: current, new_value: updated }));
    return updated;
  });
}

export async function payValidatedExpense(expenseId: string, fundId: string, userId: string, auditLog: AuditLog): Promise<Expense> {
  return runOnlineTransaction(async transaction => {
    const ref = doc(db, EXPENSES_COLLECTION, expenseId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Dépense introuvable.");
    const current = snapshot.data() as Expense;
    if (current.status !== "VALIDATED" || current.payment_status !== "PENDING" || current.treasury_movement_id) {
      throw new Error("Cette dépense n'est plus en attente de paiement.");
    }
    const now = Date.now();
    const storeFields = fundId === STORE_EXPENSE_FUNDS ? await storePaymentFields(transaction, current, userId, now) : null;
    const debit = storeFields ? null : await prepareFundDebit(transaction, fundId, userId, current.amount);
    const id = `expense-${expenseId}`;
    const paymentFields = { payment_status: "PAID" as const, ...(storeFields || { treasury_fund_id: fundId,
      treasury_movement_id: id, funding_source: "ADMIN_FUND" as const, payment_recorded_by: userId, paid_by: userId, paid_by_name: debit!.fund.owner_name, paid_at: now }) };
    if (debit) debit.apply({ id, kind: "EXPENSE", fund_id: fundId, destination_fund_id: "", from_user: userId,
      to_user: "", amount: current.amount, reference: current.expense_number, purchase_id: "", expense_id: expenseId,
      created_by: userId, created_at: now });
    const updated = { ...current, ...paymentFields };
    transaction.update(ref, paymentFields);
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined({ ...auditLog, old_value: current, new_value: updated }));
    return updated;
  });
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
