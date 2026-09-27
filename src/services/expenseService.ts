import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Expense } from "../types";

const EXPENSES_COLLECTION = "expenses";

function omitUndefined<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)) as T;
}

export async function loadExpenses(): Promise<Expense[]> {
  const snapshot = await getDocs(collection(db, EXPENSES_COLLECTION));
  return snapshot.docs
    .map(item => item.data() as Expense)
    .sort((left, right) => right.expense_date - left.expense_date);
}

export async function saveExpense(expense: Expense): Promise<void> {
  await setDoc(doc(db, EXPENSES_COLLECTION, expense.id), omitUndefined(expense));
}