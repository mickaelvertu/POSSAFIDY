import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { Expense } from "../types";

const EXPENSES_COLLECTION = "expenses";

function omitUndefined<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)) as T;
}

export async function loadExpenses(storeIds?: string[]): Promise<Expense[]> {
  const rows = storeIds === undefined
    ? (await getDocs(collection(db, EXPENSES_COLLECTION))).docs.map(item => item.data() as Expense)
    : (await Promise.all(storeIds.map(storeId =>
        getDocs(query(collection(db, EXPENSES_COLLECTION), where("store_id", "==", storeId)))
      ))).flatMap(snapshot => snapshot.docs.map(item => item.data() as Expense));
  return [...new Map(rows.map(item => [item.id, item])).values()]
    .sort((left, right) => right.expense_date - left.expense_date);
}

export async function saveExpense(expense: Expense): Promise<void> {
  await setDoc(doc(db, EXPENSES_COLLECTION, expense.id), omitUndefined(expense));
}
