import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { AuditLog, Payslip, SalaryAdvance } from "../types";

const PAYROLL_COLLECTION = "payroll";
const ADVANCES_COLLECTION = "salaryAdvances";

function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

export async function loadMyPayslips(employeeIds: string[]): Promise<Payslip[]> {
  const snapshots = await Promise.all(employeeIds.map(id => getDocs(query(collection(db, PAYROLL_COLLECTION), where("employee_id", "==", id)))));
  return snapshots.flatMap(snapshot => snapshot.docs.map(item => item.data() as Payslip)).sort((left, right) => right.period.localeCompare(left.period));
}

export async function loadMySalaryAdvances(employeeIds: string[]): Promise<SalaryAdvance[]> {
  const snapshots = await Promise.all(employeeIds.map(id => getDocs(query(collection(db, ADVANCES_COLLECTION), where("employee_id", "==", id)))));
  return snapshots.flatMap(snapshot => snapshot.docs.map(item => item.data() as SalaryAdvance)).sort((left, right) => right.advance_date - left.advance_date);
}

export async function loadPayslips(): Promise<Payslip[]> {
  const snapshot = await getDocs(collection(db, PAYROLL_COLLECTION));
  return snapshot.docs
    .map(item => item.data() as Payslip)
    .sort((left, right) => right.period.localeCompare(left.period) || left.employee_name.localeCompare(right.employee_name, "fr"));
}

export async function loadSalaryAdvances(): Promise<SalaryAdvance[]> {
  const snapshot = await getDocs(collection(db, ADVANCES_COLLECTION));
  return snapshot.docs
    .map(item => item.data() as SalaryAdvance)
    .sort((left, right) => right.advance_date - left.advance_date);
}

export async function savePayslip(payslip: Payslip, auditLog: AuditLog, settledAdvances: SalaryAdvance[] = []): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, PAYROLL_COLLECTION, payslip.id), omitUndefined(payslip));
  settledAdvances.forEach(advance => batch.set(doc(db, ADVANCES_COLLECTION, advance.id), omitUndefined(advance)));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}

export async function saveSalaryAdvance(advance: SalaryAdvance, auditLog: AuditLog): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, ADVANCES_COLLECTION, advance.id), omitUndefined(advance));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}
