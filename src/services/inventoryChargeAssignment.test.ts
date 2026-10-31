import { test } from "node:test";
import assert from "node:assert/strict";
import type { Employee, InventoryCount } from "../types";
import { assertInventoryPayrollCharges, inventoryChargeBelongsTo, pendingInventoryCharges } from "./inventoryChargeAssignment";

const employee = { id: "employee-a", user_id: "login-a" } as Employee;
const other = { id: "employee-b", user_id: "counter" } as Employee;
const charge = { id: "count", status: "VALIDATED", created_by: "counter", manager_signed_by: "manager", charged_employee_id: "employee-a", charged_to: "login-a", charged_to_name: "Aina", total_charged_amount: 1000 } as InventoryCount;

test("an explicit employee assignment takes priority over counter, manager and login aliases", () => {
  assert.equal(inventoryChargeBelongsTo(charge, employee), true);
  assert.equal(inventoryChargeBelongsTo(charge, other), false);
  assert.equal(inventoryChargeBelongsTo(charge, { id: "employee-other", user_id: "login-a" }), false);
  assert.deepEqual(pendingInventoryCharges([charge], employee).map(count => count.id), ["count"]);
  assert.deepEqual(pendingInventoryCharges([charge], other), []);
});

test("employees without accounts can receive charges and keep them after account linking", () => {
  const unlinked = { id: "employee-a" };
  assert.equal(inventoryChargeBelongsTo({ ...charge, charged_to: "employee-a" }, unlinked), true);
  assert.equal(inventoryChargeBelongsTo({ ...charge, charged_to: "employee-a" }, { ...unlinked, user_id: "new-login" }), true);
});

test("legacy charges follow the named responsible person rather than the person who counted", () => {
  const legacy = { ...charge, charged_employee_id: undefined, charged_to: "login-a" };
  assert.equal(inventoryChargeBelongsTo(legacy, employee), true);
  assert.equal(inventoryChargeBelongsTo(legacy, other), false);
  assert.equal(inventoryChargeBelongsTo({ ...legacy, charged_to: undefined, manager_signed_by: "login-a" }, employee), true);
});

test("payroll excludes settled, rejected and zero charges", () => {
  const rows = [charge, { ...charge, id: "settled", charge_settlement: {} }, { ...charge, id: "rejected", status: "REJECTED" }, { ...charge, id: "zero", total_charged_amount: 0 }] as InventoryCount[];
  assert.deepEqual(pendingInventoryCharges(rows, employee).map(count => count.id), ["count"]);
});

test("atomic payroll checks reject wrong employees, duplicate charges, changed totals and repeat deduction", () => {
  assert.doesNotThrow(() => assertInventoryPayrollCharges([charge], employee, 1000));
  assert.throws(() => assertInventoryPayrollCharges([charge], other, 1000), /autre employé/);
  assert.throws(() => assertInventoryPayrollCharges([charge, charge], employee, 2000), /plusieurs fois/);
  assert.throws(() => assertInventoryPayrollCharges([charge], employee, 900), /montant/);
  assert.throws(() => assertInventoryPayrollCharges([{ ...charge, charge_settlement: {} } as InventoryCount], employee, 1000), /déjà déduite/);
});
