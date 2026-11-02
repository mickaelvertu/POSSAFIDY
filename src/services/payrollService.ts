import { collection, doc, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db, runOnlineTransaction } from "../firebase";
import { AuditLog, Employee, InventoryCount, InventoryChargeSettlement, Payslip, SalaryAdvance } from "../types";
import { excludeDeletedExpenseAdvances } from "./salaryAdvanceValidation";
import { assertInventoryPayrollCharges } from "./inventoryChargeAssignment";
import { firestoreValuesEqual } from "./saleComparison";

const PAYROLL_COLLECTION = "payroll";
const ADVANCES_COLLECTION = "salaryAdvances";

// Standalone advances have no source expense; linked advances require a live source.
async function withoutDeletedExpenses(advances: SalaryAdvance[]): Promise<SalaryAdvance[]> {
  const ids = [...new Set(advances.flatMap(advance => advance.expense_id ? [advance.expense_id] : []))];
  const sources = new Map(await Promise.all(ids.map(async id => [id, (await getDoc(doc(db, "expenses", id))).exists()] as const)));
  return excludeDeletedExpenseAdvances(advances, new Set([...sources].filter(([, exists]) => exists).map(([id]) => id)));
}

function omitUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(omitUndefined) as T;
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined).map(([key, field]) => [key, omitUndefined(field)])) as T;
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

export async function savePayslip(
  payslip: Payslip, auditLog: AuditLog, settledAdvances: SalaryAdvance[] = [],
  inventory?: { counts: InventoryCount[]; settlement: InventoryChargeSettlement; auditLog: AuditLog },
  isNew?: boolean
): Promise<InventoryCount[]> {
  let updatedCounts: InventoryCount[] = [];
  await runOnlineTransaction(async transaction => {
    updatedCounts = [];
    const payslipRef = doc(db, PAYROLL_COLLECTION, payslip.id);
    const existing = await transaction.get(payslipRef);
    if (isNew === true && existing.exists()) throw new Error("Cette fiche de paie existe déjà. Rechargez la liste.");
    if (isNew === false && !existing.exists()) throw new Error("Cette fiche de paie n’existe plus.");
    if (existing.exists()) {
      const previous = existing.data() as Payslip;
      if (previous.employee_id !== payslip.employee_id) throw new Error("L’employé d’une fiche de paie enregistrée ne peut pas être changé.");
      if ((previous.inventory_charges_deducted || 0) !== (payslip.inventory_charges_deducted || 0) ||
        !firestoreValuesEqual(previous.inventory_count_ids || [], payslip.inventory_count_ids || [])) {
        throw new Error("Les retenues d’inventaire déjà enregistrées ne peuvent pas être modifiées sur la fiche de paie.");
      }
    }
    const expectedNet = payslip.base_salary + payslip.bonuses - payslip.deductions - (payslip.advances_deducted || 0) - (payslip.inventory_charges_deducted || 0);
    if (!Number.isFinite(expectedNet) || expectedNet < 0 || Math.abs(expectedNet - payslip.net_salary) > 0.001) throw new Error("Le salaire net ne correspond pas aux retenues et aux avances.");
    for (const advance of settledAdvances) {
      const current = await transaction.get(doc(db, ADVANCES_COLLECTION, advance.id));
      if (!current.exists() || current.data().status !== "OUTSTANDING") throw new Error("Une avance a changé. Rechargez la paie.");
      const sourceId = current.data().expense_id;
      if (sourceId && !(await transaction.get(doc(db, "expenses", sourceId))).exists()) throw new Error("La dépense liée à une avance a été supprimée. Rechargez la paie.");
    }
    if (!existing.exists() || inventory?.counts.length) {
      const employeeSnapshot = await transaction.get(doc(db, "employees", payslip.employee_id));
      if (!employeeSnapshot.exists()) throw new Error("La fiche employé n’existe plus.");
      const employee = { ...employeeSnapshot.data(), id: payslip.employee_id } as Employee;
      const selected = inventory?.counts || [];
      const expectedIds = [...(payslip.inventory_count_ids || [])].sort();
      if (!firestoreValuesEqual([...selected.map(count => count.id)].sort(), expectedIds)) throw new Error("Les inventaires à déduire ne correspondent pas à cette paie.");
      const countSnapshots = await Promise.all(selected.map(count => transaction.get(doc(db, "inventoryCounts", count.id))));
      const liveCounts = countSnapshots.map(snapshot => {
        if (!snapshot.exists()) throw new Error("Un inventaire à déduire n’existe plus.");
        return snapshot.data() as InventoryCount;
      });
      assertInventoryPayrollCharges(liveCounts, employee, payslip.inventory_charges_deducted || 0);
      if (selected.length && (!inventory || inventory.settlement.method !== "PAYSLIP" || inventory.settlement.payslip_id !== payslip.id)) throw new Error("La référence de paie de la retenue est invalide.");
      if (inventory) updatedCounts = liveCounts.map(count => ({ ...count, charge_settlement: inventory.settlement, updated_at: inventory.settlement.settled_at }));
    }
    transaction.set(payslipRef, omitUndefined(payslip));
    settledAdvances.forEach(advance => transaction.set(doc(db, ADVANCES_COLLECTION, advance.id), omitUndefined(advance)));
    updatedCounts.forEach(count => transaction.update(doc(db, "inventoryCounts", count.id), omitUndefined({ charge_settlement: count.charge_settlement, updated_at: count.updated_at })));
    if (inventory && updatedCounts.length) transaction.set(doc(db, "auditLogs", inventory.auditLog.id), omitUndefined(inventory.auditLog));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
  return updatedCounts;
}

export async function saveSalaryAdvance(advance: SalaryAdvance, auditLog: AuditLog): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, ADVANCES_COLLECTION, advance.id), omitUndefined(advance));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}
