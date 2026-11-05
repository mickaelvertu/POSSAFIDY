import test from 'node:test';
import assert from 'node:assert/strict';
import type { ResellerReceipt } from '../types';
import { pendingResellerReceipts, resellerBusinessDate, resellerReceiptTotal } from './resellerReceiptCalculation';
const paidAt = Date.UTC(2026, 10, 5, 22);
const receipt: ResellerReceipt = { id: 'r', sale_id: 'old-sale', store_id: 'dep', amount: 40000, method: 'CASH',
  paid_at: paidAt, business_date: '2026-11-06', collected_by: 'responsible', collected_by_name: 'Responsable',
  recorded_by: 'responsible', recorded_by_name: 'Responsable', destination: 'HANDOVER', handover_id: '' };
test('Nairobi business date is independent of browser timezone', () => assert.equal(resellerBusinessDate(paidAt), '2026-11-06'));
test('DEP remits only the selected collector actual daily cash still held outside treasury', () => {
  const rows = [receipt, { ...receipt, id: 'admin', collected_by: 'admin', destination: 'TREASURY' },
    { ...receipt, id: 'claimed', handover_id: 'h' }, { ...receipt, id: 'noncash', method: 'MVOLA' },
    { ...receipt, id: 'store', store_id: 'other' }, { ...receipt, id: 'collector', collected_by: 'other' },
    { ...receipt, id: 'date', business_date: '2026-11-05' }] as ResellerReceipt[];
  const pending = pendingResellerReceipts(rows, 'dep', '2026-11-06', 'responsible');
  assert.deepEqual(pending.map(row => row.id), ['r']); assert.equal(resellerReceiptTotal(pending), 40000);
});
