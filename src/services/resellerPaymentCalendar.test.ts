import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Sale, CreditCustomer } from '../types';
import type { ManualCreditDebt } from './manualCreditCalculation';
import { resellerCalendarEntries } from './resellerPaymentCalendar';
import { scheduledSupplierPurchases, supplierCalendarTotals } from './supplierPaymentCalendar';

test('reseller calendar combines validated credits and manual debts with net paid totals', () => {
  const sale = { id: '1', customer_type: 'REVENDEUR', customer_name: 'Ancien nom', credit_customer_id: 'c1', status: 'VALIDATED', credit_due_at: 100, sale_number: 'V1', total: 100, amount_paid: 70, change_returned: 10, payment_status: 'PARTIAL' } as Sale;
  const debt = { id: '1', customer_id: 'c1', customer_name: 'Ancien nom', reference: 'D1', amount: 200, amount_paid: 200, due_at: 100 } as ManualCreditDebt;
  const entries = resellerCalendarEntries([sale, { ...sale, status: 'CANCELLED' }, { ...sale, credit_due_at: undefined }, { ...sale, customer_type: 'PARTICULIER' }], [debt], [{ id: 'c1', name: 'Revendeur actuel' } as CreditCustomer]);
  assert.equal(entries.length, 2);
  assert.notEqual(entries[0].id, entries[1].id);
  assert.ok(entries.every(entry => entry.supplier_name === 'Revendeur actuel' && entry.supplier_id === 'id:c1'));
  assert.deepEqual(supplierCalendarTotals(scheduledSupplierPurchases(entries, true)), { paid: 260, unpaid: 40, total: 300 });
});
