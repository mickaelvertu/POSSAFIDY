import test from "node:test";
import assert from "node:assert/strict";
import type { Payslip, SalaryAdvance } from "../types";
import { advanceBalance, deductAdvance, validateAdvanceDeductions } from "./advanceDeduction";

const advance = { id: "a", employee_id: "employee", amount: 100000, status: "OUTSTANDING" } as SalaryAdvance;
const payslip = (amount: number, before = 100000) => ({ id: "pay", employee_id: "employee", updated_at: 1,
  advances_deducted: amount, advance_ids: ["a"],
  advance_deductions: [{ advance_id: "a", amount, balance_before: before, balance_after: before - amount }]
} as Payslip);

test("partial deductions preserve the original amount and carry the balance to later payslips", () => {
  const first = deductAdvance(advance, 30000, "pay", 1);
  assert.equal(first.amount, 100000);
  assert.equal(first.status, "OUTSTANDING");
  assert.equal(advanceBalance(first), 70000);
  validateAdvanceDeductions(payslip(30000), [advance], [first]);
  const second = deductAdvance(first, 70000, "pay-next", 2);
  assert.equal(second.status, "DEDUCTED");
  assert.equal(second.amount_deducted, 100000);
  assert.equal(advanceBalance(second), 0);
});

test("legacy settled advances have no remaining balance", () => {
  assert.equal(advanceBalance({ ...advance, status: "DEDUCTED" }), 0);
  assert.equal(advanceBalance(advance), 100000);
});

test("invalid deductions and stale balances are rejected", () => {
  for (const amount of [-1, 0, 100001, NaN, Infinity]) assert.throws(() => deductAdvance(advance, amount, "pay", 1));
  const updated = deductAdvance(advance, 30000, "pay", 1);
  assert.throws(() => validateAdvanceDeductions(payslip(30000), [{ ...advance, amount_deducted: 20000 }], [updated]));
  assert.throws(() => validateAdvanceDeductions(payslip(30000), [{ ...advance, employee_id: "other" }], [updated]));
  assert.throws(() => validateAdvanceDeductions({ ...payslip(30000), advances_deducted: 40000 }, [advance], [updated]));
  assert.throws(() => validateAdvanceDeductions({ ...payslip(30000), advance_ids: [] }, [advance], [updated]));
  assert.throws(() => validateAdvanceDeductions(payslip(30000), [advance], [{ ...updated, amount_deducted: 100000 }]));
});

test("zero deductions leave unselected advances untouched", () => {
  validateAdvanceDeductions({ advances_deducted: 0, advance_ids: [], advance_deductions: [] } as unknown as Payslip, [], []);
});

test("each advance can have a different partial deduction on the same payslip", () => {
  const other = { ...advance, id: "b", amount: 50000 };
  const slip = { ...payslip(30000), advances_deducted: 40000, advance_ids: ["a", "b"],
    advance_deductions: [...payslip(30000).advance_deductions!, { advance_id: "b", amount: 10000, balance_before: 50000, balance_after: 40000 }]
  };
  validateAdvanceDeductions(slip, [advance, other], [deductAdvance(advance, 30000, "pay", 1), deductAdvance(other, 10000, "pay", 1)]);
});
