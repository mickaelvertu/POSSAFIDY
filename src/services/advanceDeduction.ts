import type { Payslip, SalaryAdvance } from "../types";

export function advanceBalance(advance: SalaryAdvance): number {
  return advance.status === "DEDUCTED" ? 0 : advance.amount - (advance.amount_deducted || 0);
}

export function deductAdvance(advance: SalaryAdvance, amount: number, payslipId: string, timestamp: number): SalaryAdvance {
  if (advance.status !== "OUTSTANDING" || !Number.isFinite(amount) || amount <= 0 || amount > advanceBalance(advance)) {
    throw new Error("Le montant à déduire doit être positif et ne peut pas dépasser le solde de l’avance.");
  }
  const amount_deducted = (advance.amount_deducted || 0) + amount;
  return { ...advance, amount_deducted, status: amount_deducted === advance.amount ? "DEDUCTED" : "OUTSTANDING", payslip_id: payslipId, updated_at: timestamp };
}

export function validateAdvanceDeductions(payslip: Payslip, current: SalaryAdvance[], updated: SalaryAdvance[]): void {
  const lines = payslip.advance_deductions || [];
  if (new Set(lines.map(line => line.advance_id)).size !== lines.length ||
    lines.length !== updated.length || current.length !== updated.length ||
    JSON.stringify(lines.map(line => line.advance_id).sort()) !== JSON.stringify([...(payslip.advance_ids || [])].sort()) ||
    Math.abs(lines.reduce((sum, line) => sum + line.amount, 0) - (payslip.advances_deducted || 0)) > 0.001) {
    throw new Error("Le détail des avances ne correspond pas à la retenue de cette paie.");
  }
  for (const line of lines) {
    const advance = current.find(item => item.id === line.advance_id);
    const next = updated.find(item => item.id === line.advance_id);
    if (!advance || !next || advance.employee_id !== payslip.employee_id || line.balance_before !== advanceBalance(advance) ||
      line.balance_after !== line.balance_before - line.amount) throw new Error("Une avance a changé. Rechargez la paie.");
    const expected = deductAdvance(advance, line.amount, payslip.id, payslip.updated_at);
    if (next.amount !== expected.amount || next.amount_deducted !== expected.amount_deducted || next.status !== expected.status ||
      next.payslip_id !== payslip.id || next.employee_id !== payslip.employee_id) throw new Error("Le solde de l’avance est incohérent.");
  }
}
