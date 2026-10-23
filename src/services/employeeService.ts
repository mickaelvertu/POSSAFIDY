import { collection, doc, getDocs, query, where, writeBatch, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import { AuditLog, Employee } from "../types";

function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

export async function loadMyEmployees(userId: string): Promise<Employee[]> {
  const snapshot = await getDocs(query(collection(db, "employees"), where("user_id", "==", userId)));
  return snapshot.docs.map(item => item.data() as Employee);
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

export async function linkEmployeeAccount(employeeId: string, userId: string, auditLog: AuditLog): Promise<void> {
  await runTransaction(db, async transaction => {
    const employeeRef = doc(db, "employees", employeeId);
    const userRef = doc(db, "users", userId);
    const [employee, user] = await Promise.all([transaction.get(employeeRef), transaction.get(userRef)]);
    if (!employee.exists() || !user.exists()) throw new Error("Employé ou compte introuvable.");
    if (employee.data().user_id && employee.data().user_id !== userId) throw new Error("Cet employé est déjà lié à un autre compte.");
    const linked = await getDocs(query(collection(db, "employees"), where("user_id", "==", userId)));
    const others = await Promise.all(linked.docs.filter(item => item.id !== employeeId).map(item => transaction.get(item.ref)));
    if (employee.data().linked_archive_id) throw new Error("Fiche archivee : utilisez la fiche principale.");
    for (const other of others) {
      if (!other.exists() || other.data().user_id !== userId) throw new Error("Les fiches ont change. Rechargez la page.");
    }
    for (const other of others) transaction.update(other.ref, { is_active: false, linked_archive_id: employeeId, updated_at: Date.now() });
    transaction.update(employeeRef, { user_id: userId, updated_at: Date.now() });
    transaction.update(userRef, { linked_employee_id: employeeId });
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
}
