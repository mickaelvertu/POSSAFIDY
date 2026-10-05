import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { AuditLog, Employee } from "../types";

function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

export async function loadEmployees(): Promise<Employee[]> {
  const snapshot = await getDocs(collection(db, "employees"));
  return snapshot.docs
    .map(item => item.data() as Employee)
    .sort((left, right) => left.last_name.localeCompare(right.last_name, "fr"));
}

export async function saveEmployee(employee: Employee, auditLog: AuditLog): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, "employees", employee.id), omitUndefined(employee));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}
