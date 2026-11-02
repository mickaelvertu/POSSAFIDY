import type { SalaryAdvance } from "../types";

export function excludeDeletedExpenseAdvances(advances: SalaryAdvance[], existingExpenseIds: ReadonlySet<string>): SalaryAdvance[] {
  return advances.filter(advance => !advance.expense_id || existingExpenseIds.has(advance.expense_id));
}
