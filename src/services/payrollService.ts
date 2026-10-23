import { collection, doc, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db, runOnlineTransaction } from "../firebase";
import { AuditLog, Payslip, SalaryAdvance } from "../types";
import { excludeDeletedExpenseAdvances } from "./salaryAdvanceValidation";

const PAYROLL_COLLECTION = "payroll";
const ADVANCES_COLLECTION = "salaryAdvances";

// Standalone advances have no source expense; linked advances require a live source.
async function withoutDeletedExpenses(advances: SalaryAdvance[]): Promise<SalaryAdvance[]> {
  const ids = [...new Set(advances.flatMap(advance => advance.expense_id ? [advance.expense_id] : []))];
  const sources = new Map(await Promise.all(ids.map(async id => [id, (await getDoc(doc(db, "expenses", id))).exists()] as const)));
  return excludeDeletedExpenseAdvances(advances, new Set([...sources].filter(([, exists]) => exists).map(([id]) => id)));
}

function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

export async function loadMyPayslips(employeeIds: string[]): Promise<Payslip[]> {
  const snapshots = await Promise.all(employeeIds.map(id => getDocs(query(collection(db, PAYROLL_COLLECTION), where("employee_id", "==", id)))));
  return snapshots.flatMap(snapshot => snapshot.docs.map(item => item.data() as Payslip)).sort((left, right) => right.period.localeCompare(left.period));
}

export async function loadMySalaryAdvances(employeeIds: string[]): Promise<SalaryAdvance[]> {
  const snapshots = await Promise.all(employeeIds.map(id => getDocs(query(collection(db, ADVANCES_COLLECTION), where("employee_id", "==", id)))));
  return withoutDeletedExpenses(snapshots.flatMap(snapshot => snapshot.docs.map(item => item.data() as SalaryAdvance)).sort((left, right) => right.advance_date - left.advance_date));
}

export async function loadPayslips(): Promise<Payslip[]> {
  const snapshot = await getDocs(collection(db, PAYROLL_COLLECTION));
  return snapshot.docs
    .map(item => item.data() as Payslip)
    .sort((left, right) => right.period.localeCompare(left.period) || left.employee_name.localeCompare(right.employee_name, "fr"));
}

export async function loadSalaryAdvances(): Promise<SalaryAdvance[]> {
  const snapshot = await getDocs(collection(db, ADVANCES_COLLECTION));
  return withoutDeletedExpenses(snapshot.docs
    .map(item => item.data() as SalaryAdvance)
    .sort((left, right) => right.advance_date - left.advance_date));
}

export async function savePayslip(payslip: Payslip, auditLog: AuditLog, settledAdvances: SalaryAdvance[] = []): Promise<void> {
  await runOnlineTransaction(async transaction => {
    for (const advance of settledAdvances) {
      const current = await transaction.get(doc(db, ADVANCES_COLLECTION, advance.id));
      if (!current.exists() || current.data().status !== "OUTSTANDING") throw new Error("Une avance a changé. Rechargez la paie.");
      const sourceId = current.data().expense_id;
      if (sourceId && !(await transaction.get(doc(db, "expenses", sourceId))).exists()) throw new Error("La dépense liée à une avance a été supprimée. Rechargez la paie.");
    }
    transaction.set(doc(db, PAYROLL_COLLECTION, payslip.id), omitUndefined(payslip));
    settledAdvances.forEach(advance => transaction.set(doc(db, ADVANCES_COLLECTION, advance.id), omitUndefined(advance)));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
}

export async function saveSalaryAdvance(advance: SalaryAdvance, auditLog: AuditLog): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, ADVANCES_COLLECTION, advance.id), omitUndefined(advance));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}
