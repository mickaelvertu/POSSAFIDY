import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUserAudit, UserAuditData } from './userAuditReport';

const data = {
  users: [{ id: 'u1', uid: 'auth1', storeIds: ['shop1'] }, { id: 'u2', uid: 'auth2', storeIds: ['shop2'] }],
  employees: [{ id: 'e1', user_id: 'auth1', store_id: 'shop1' }, { id: 'e2', user_id: 'u2', store_id: 'shop2' }],
  sales: [
    { id: 's1', seller_id: 'auth1', store_id: 'shop1', status: 'VALIDATED', total: 100, created_at: new Date('2026-09-30T23:59:59.999').getTime() },
    { id: 's2', seller_id: 'u1', store_id: 'shop1', status: 'CANCELLED', total: 80, created_at: new Date('2026-09-10T12:00:00').getTime() },
    { id: 's3', seller_id: 'u2', store_id: 'shop1', status: 'VALIDATED', total: 900, created_at: new Date('2026-09-10T12:00:00').getTime() }
  ],
  advances: [{ id: 'a1', employee_id: 'e1', amount: 30, advance_date: new Date('2026-09-10T12:00:00').getTime() }],
  payslips: [{ id: 'p1', employee_id: 'e1', period: '2026-09' }, { id: 'p2', employee_id: 'e1', period: '2026-08' }],
  counts: [{ id: 'c1', charged_to: 'auth1', status: 'VALIDATED', store_id: 'shop1', reviewed_at: new Date('2026-09-15T12:00:00').getTime() }, { id: 'c2', charged_to: 'auth1', status: 'DRAFT', store_id: 'shop1', updated_at: new Date('2026-09-15T12:00:00').getTime() }]
} as unknown as UserAuditData;

test('links account aliases and payroll IDs without attributing another seller’s sales', () => {
  const [fiche] = buildUserAudit(data, { userId: 'u1', storeId: 'shop1', start: '2026-09-01', end: '2026-09-30' });
  assert.equal(fiche.revenue, 100);
  assert.deepEqual(fiche.sales.map(sale => sale.id), ['s1', 's2']);
  assert.deepEqual(fiche.advances.map(advance => advance.id), ['a1']);
  assert.deepEqual(fiche.payslips.map(slip => slip.id), ['p1']);
  assert.deepEqual(fiche.counts.map(count => count.id), ['c1']);
});

test('store scope excludes unrelated payroll and retains actual sales outside current assignments', () => {
  const [fiche] = buildUserAudit(data, { userId: 'u2', storeId: 'shop1', start: '', end: '' });
  assert.equal(fiche.revenue, 900);
  assert.equal(fiche.payslips.length, 0);
  assert.deepEqual(buildUserAudit(data, { userId: 'u1', storeId: 'unknown', start: '', end: '' }), []);
});
