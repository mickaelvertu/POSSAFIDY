import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Purchase } from '../types';
import { calendarDateKey, calendarDays, scheduledSupplierPurchases, supplierCalendarTotals } from './supplierPaymentCalendar';

test('month spans complete Monday to Sunday weeks including leap day', () => {
  const days = calendarDays(new Date(2024, 1, 29), 'month');
  assert.equal(calendarDateKey(days[0]), '2024-01-29');
  assert.equal(calendarDateKey(days.at(-1)!), '2024-03-03');
  assert.equal(days.length, 35);
  assert.ok(days.some(day => calendarDateKey(day) === '2024-02-29'));
});

test('Sunday belongs to the preceding Monday week across a year boundary', () => {
  const days = calendarDays(new Date(2027, 0, 3), 'week');
  assert.equal(days.length, 7);
  assert.equal(calendarDateKey(days[0]), '2026-12-28');
  assert.equal(calendarDateKey(days[6]), '2027-01-03');
});

test('calendar retains outstanding balances and excludes drafts, cancellations, settled and invalid entries', () => {
  const base = { id: 'partial', supplier_name: 'Fournisseur', total: 100, amount_paid: 40, payment_status: 'PARTIAL', status: 'APPROVED', expected_payment_at: 100 } as Purchase;
  const purchases = [base, { ...base, id: 'legacy', status: undefined, expected_payment_at: 50 },
    { ...base, status: 'DRAFT' }, { ...base, status: 'CANCELLED' }, { ...base, payment_status: 'PAID' },
    { ...base, amount_paid: 100 }, { ...base, amount_paid: 120 }, { ...base, expected_payment_at: NaN }] as Purchase[];
  const scheduled = scheduledSupplierPurchases(purchases);
  assert.deepEqual(scheduled.map(p => p.id), ['legacy', 'partial']);
  assert.equal(scheduled.reduce((sum, p) => sum + p.total - p.amount_paid, 0), 120);
});

test('daily totals include fully paid purchases and split partial payments without counting cancellations', () => {
  const base = { supplier_name: 'Fournisseur', total: 100, amount_paid: 40, payment_status: 'PARTIAL', status: 'RECEIVED', expected_payment_at: 100 } as Purchase;
  const purchases = scheduledSupplierPurchases([base, { ...base, amount_paid: 100, payment_status: 'PAID' }, { ...base, amount_paid: 0 }, { ...base, status: 'CANCELLED' }], true);
  assert.deepEqual(supplierCalendarTotals(purchases), { paid: 140, unpaid: 160, total: 300 });
  assert.deepEqual(supplierCalendarTotals([]), { paid: 0, unpaid: 0, total: 0 });
});
