import { test } from "node:test";
import assert from "node:assert/strict";
import type { SalaryAdvance } from "../types";
import { excludeDeletedExpenseAdvances } from "./salaryAdvanceValidation";

test("deleted expense advances are excluded; live and standalone advances remain", () => {
  const rows = [
    { id: "live", expense_id: "expense-live", status: "OUTSTANDING", amount: 10 },
    { id: "deleted", expense_id: "expense-deleted", status: "OUTSTANDING", amount: 20 },
    { id: "historical", expense_id: "expense-deleted", status: "DEDUCTED", amount: 30 },
    { id: "standalone", status: "OUTSTANDING", amount: 40 }
  ] as SalaryAdvance[];
  const result = excludeDeletedExpenseAdvances(rows, new Set(["expense-live"]));
  assert.deepEqual(result.map(row => row.id), ["live", "standalone"]);
  assert.equal(result.reduce((sum, row) => sum + row.amount, 0), 50);
  assert.equal(rows.length, 4);
});
