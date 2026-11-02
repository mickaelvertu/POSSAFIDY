import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db, runOnlineTransaction } from "../firebase";
import type { AppUser, Employee } from "../types";
import { type PresentationCheck, validateFindings } from "./employeePresentation";
export type DirectoryEmployee = Pick<Employee, "id" | "first_name" | "last_name" | "store_id" | "is_active" | "position">;
export function directoryEmployee(e: Employee): DirectoryEmployee { return { id: e.id, first_name: e.first_name, last_name: e.last_name, store_id: e.store_id || "", is_active: e.is_active && !e.linked_archive_id, position: e.position }; }
export async function syncPresentationDirectory(employees: Employee[]) {
  for (let i = 0; i < employees.length; i += 400) {
    const batch = writeBatch(db);
    employees.slice(i, i + 400).forEach(e => batch.set(doc(db, "employeeDirectory", e.id), directoryEmployee(e)));
    await batch.commit();
  }
}
export async function loadPresentationData(admin: boolean, storeIds: string[]) {
  async function read(name: string) {
    const snapshots = await Promise.all(admin ? [getDocs(collection(db, name))] : storeIds.map(id => getDocs(query(collection(db, name), where("store_id", "==", id)))));
    return snapshots.flatMap(s => s.docs.map(d => d.data()));
  }
  const [employees, checks] = await Promise.all([read("employeeDirectory"), read("employeePresentationChecks")]);
  return { employees: employees as DirectoryEmployee[], checks: checks as PresentationCheck[] };
}
export async function savePresentationCheck(check: PresentationCheck, user: AppUser, review = false) {
  if (check.status !== "DRAFT") validateFindings(check.findings);
  await runOnlineTransaction(async tx => {
    const ref = doc(db, "employeePresentationChecks", check.id);
    const snapshot = await tx.get(ref);
    const previous = snapshot.data() as PresentationCheck | undefined;
    if (review) {
      if (!previous || previous.status !== "SUBMITTED" || previous.created_by === user.id) throw new Error("Un autre administrateur doit examiner ce contrôle en attente.");
      if (check.status === "CORRECTION" && !check.review_note.trim()) throw new Error("Indiquez la correction demandée.");
    } else if (previous && (!["DRAFT", "CORRECTION"].includes(previous.status) || previous.created_by !== user.id || previous.updated_at !== check.updated_at)) throw new Error("Ce contrôle a changé. Rechargez le module.");
    const now = Date.now();
    const next = review ? { ...previous!, status: check.status, review_note: check.review_note, reviewed_by: user.id, reviewed_at: now, updated_at: now } : { ...check, review_note: "", reviewed_by: "", reviewed_at: 0, updated_at: now };
    tx.set(ref, next);
    tx.set(doc(collection(db, "auditLogs")), { user_id: user.id, user_name: user.displayName, store_id: check.store_id, device_id: "web", action: `EMPLOYEE_PRESENTATION_${check.status}`, entity_type: "EMPLOYEE_PRESENTATION", entity_id: check.id, created_at: now });
  });
}
