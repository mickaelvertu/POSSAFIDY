import type { TreasuryFund, TreasuryMovement } from '../types';
export function movementDelta(m: TreasuryMovement, owner = '') {
  return (m.to_user && (!owner || m.to_user === owner) ? m.amount : 0) - (m.from_user && (!owner || m.from_user === owner) ? m.amount : 0);
}
export function periodSummary(funds: TreasuryFund[], movements: TreasuryMovement[], start: number, end: number, owner = '') {
  const current = funds.filter(f => !owner || f.owner_id === owner).reduce((s, f) => s + f.balance, 0);
  const closing = current - movements.filter(m => m.created_at > end).reduce((s, m) => s + movementDelta(m, owner), 0);
  const period = movements.filter(m => m.created_at >= start && m.created_at <= end);
  return { opening: closing - period.reduce((s, m) => s + movementDelta(m, owner), 0), closing,
    receipts: period.filter(m => m.kind === 'RECEIPT' && (!owner || m.to_user === owner)).reduce((s, m) => s + m.amount, 0),
    expenses: period.filter(m => ['PURCHASE', 'EXPENSE'].includes(m.kind) && (!owner || m.from_user === owner)).reduce((s, m) => s + m.amount, 0),
    refunds: period.filter(m => m.kind === 'EXPENSE_REFUND' && (!owner || m.to_user === owner)).reduce((s, m) => s + m.amount, 0),
    reversals: period.filter(m => m.kind === 'RECEIPT_REVERSAL' && (!owner || m.from_user === owner)).reduce((s, m) => s + m.amount, 0),
    deposits: period.filter(m => m.kind === 'DEPOSIT' && (!owner || m.from_user === owner)).reduce((s, m) => s + m.amount, 0),
    transfers: period.filter(m => m.kind === 'TRANSFER').reduce((s, m) => s + movementDelta(m, owner), 0) };
}
export function treasuryCsv(rows: (string | number)[][]) {
  return '\uFEFF' + rows.map(row => row.map(v => '"' + String(typeof v === 'string' && /^[\s]*[=+\-@]/.test(v) ? "'" + v : v).replaceAll('"', '""') + '"').join(';')).join('\r\n');
}
