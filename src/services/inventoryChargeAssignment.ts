import type { Employee, InventoryCount } from "../types";

export function inventoryChargeBelongsTo(count: InventoryCount, employee: Pick<Employee, "id" | "user_id">): boolean {
  if (count.charged_employee_id) return count.charged_employee_id === employee.id;
  const responsible = count.charged_to || count.manager_signed_by || count.created_by;
  return responsible === employee.id || Boolean(employee.user_id && responsible === employee.user_id);
}

export function pendingInventoryCharges(counts: InventoryCount[], employee: Pick<Employee, "id" | "user_id">): InventoryCount[] {
  return counts.filter(count => count.status === "VALIDATED" && !count.charge_settlement && (count.total_charged_amount || 0) > 0 && inventoryChargeBelongsTo(count, employee));
}

export function assertInventoryPayrollCharges(counts: InventoryCount[], employee: Pick<Employee, "id" | "user_id">, expected: number) {
  if (new Set(counts.map(count => count.id)).size !== counts.length) throw new Error("Une retenue d’inventaire apparaît plusieurs fois.");
  if (counts.some(count => count.status !== "VALIDATED" || count.charge_settlement || (count.total_charged_amount || 0) <= 0 || !inventoryChargeBelongsTo(count, employee))) {
    throw new Error("Une retenue est déjà déduite, invalide ou attribuée à un autre employé. Rechargez la paie.");
  }
  const total = counts.reduce((sum, count) => sum + (count.total_charged_amount || 0), 0);
  if (!Number.isFinite(expected) || Math.abs(total - expected) > 0.001) throw new Error("Le montant des retenues a changé. Rechargez la paie.");
}
