import { collection, doc, getDocs, query, runTransaction, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { AuditLog, Expense } from "../types";

const EXPENSES_COLLECTION = "expenses";

function omitUndefined<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)) as T;
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

export async function validateExpense(expense: Expense, userId: string, auditLog: AuditLog, isSuperAdmin = false): Promise<Expense> {
  return runTransaction(db, async transaction => {
    const ref = doc(db, EXPENSES_COLLECTION, expense.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().status !== "DRAFT") throw new Error("Cette dépense n'est plus un brouillon.");
    if (!isSuperAdmin && snapshot.data().created_by !== userId) throw new Error("Vous pouvez uniquement valider vos propres dépenses.");
    const updated = { ...snapshot.data(), status: "VALIDATED", validated_by: userId, validated_at: Date.now() } as Expense;
    transaction.update(ref, { status: updated.status, validated_by: updated.validated_by, validated_at: updated.validated_at });
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined({ ...auditLog, old_value: snapshot.data(), new_value: updated }));
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
    "payee", "payment_method", "payment_status", "reference", "notes"
  ];
  return runTransaction(db, async transaction => {
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
