import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTreasuryReportRows, filterReportData, type ReportData } from './reportService';
import type { GeneralFilters, TreasuryFund, TreasuryMovement } from '../types';

const filters: GeneralFilters = { storeIds: [], categoryIds: [], statuses: [], movementTypes: [] };
test('expense scope distinguishes store expenses from head office independently of funding', () => {
  const data = { articles: [], stores: [], stocks: [], transfers: [], movements: [], sales: [], productions: [], auditLogs: [],
    expenses: [
      { id: 'store', store_id: 'one', funding_source: 'ADMIN_FUND', category: 'RENT', expense_date: 1 },
      { id: 'other-store', store_id: 'two', category: 'FUEL', expense_date: 1 },
      { id: 'hq', category: 'RENT', expense_date: 1 }
    ]
  } as unknown as ReportData;
  const ids = (extra: Partial<GeneralFilters>) => filterReportData(data, { ...filters, ...extra }).expenses?.map(row => row.id);
  assert.deepEqual(ids({ expenseScope: 'ALL' }), ['store', 'other-store', 'hq']);
  assert.deepEqual(ids({ expenseScope: 'STORE' }), ['store', 'other-store']);
  assert.deepEqual(ids({ expenseScope: 'HEAD_OFFICE' }), ['hq']);
  assert.deepEqual(ids({ expenseScope: 'STORE', storeIds: ['one'], expenseCategory: 'RENT' }), ['store']);
});
test('financial filters combine supplier, category and period', () => {
  const data = { articles: [], stores: [], stocks: [], transfers: [], movements: [], sales: [], productions: [], auditLogs: [],
    purchases: [{ id: 'a', supplier_id: 'one', created_at: 1, lines: [] }, { id: 'b', supplier_id: 'two', created_at: 1, lines: [] }],
    expenses: [{ id: 'rent', category: 'RENT', expense_date: 1 }, { id: 'fuel', category: 'FUEL', expense_date: 1 }]
  } as unknown as ReportData;
  const result = filterReportData(data, { ...filters, supplierId: 'one', expenseCategory: 'FUEL' });
  assert.deepEqual(result.purchases?.map(row => row.id), ['a']);
  assert.deepEqual(result.expenses?.map(row => row.id), ['fuel']);
});

test('treasury filters by administrator identity across all their funds', () => {
  const funds = [
    { id: 'one', owner_id: 'admin-a', owner_name: 'Same name', created_at: 1, balance: 100 },
    { id: 'two', owner_id: 'admin-b', owner_name: 'Same name', created_at: 1, balance: 50 },
    { id: 'three', owner_id: 'admin-a', owner_name: 'Same name', created_at: 1, balance: 25 }
  ] as TreasuryFund[];
  const rows = buildTreasuryReportRows(funds, [], { ...filters, treasuryAdminId: 'admin-a', treasuryView: 'BALANCE' });
  assert.deepEqual(rows.map(row => row.id), ['one', 'three']);
  assert.equal(rows.reduce((sum, row) => sum + row.balance, 0), 125);
  assert.equal(buildTreasuryReportRows(funds, [], filters).length, 3);
});

test('treasury reconstructs historical closing and opening balances, including transfers', () => {
  const date = (day: string) => new Date(day + 'T12:00:00').getTime();
  const funds = [{ id: 'a', owner_name: 'A', created_at: date('2026-01-01'), balance: 60 },
    { id: 'b', owner_name: 'B', created_at: date('2026-01-02'), balance: 30 }] as TreasuryFund[];
  const movements = [
    { fund_id: '', destination_fund_id: 'a', amount: 100, created_at: date('2026-01-01') },
    { fund_id: 'a', destination_fund_id: 'b', amount: 30, created_at: date('2026-01-02') },
    { fund_id: 'a', destination_fund_id: '', amount: 10, created_at: date('2026-01-03') }
  ] as TreasuryMovement[];
  const rows = buildTreasuryReportRows(funds, movements, { ...filters, startDate: '2026-01-02', endDate: '2026-01-02' });
  assert.deepEqual(rows.map(row => [row.opening, row.incoming, row.outgoing, row.balance]), [[100, 0, 30, 70], [0, 30, 0, 30]]);
  assert.deepEqual(buildTreasuryReportRows(funds, movements, { ...filters, treasuryView: 'OUT' }).map(row => row.id), ['a']);
});

test('treasury identifies reseller recoveries and manual debts without changing totals', () => {
  const funds = [
    { id: 'recovery', source: 'OTHER', source_reference: 'Règlement revendeur VTE-1 · payment-1', created_at: 1, balance: 100 },
    { id: 'manual', source: 'OTHER', source_reference: 'Règlement dette manuelle OLD-1 · payment-2', created_at: 1, balance: 50 },
    { id: 'new', source: 'OTHER', source_reference: 'Règlement dette manuelle OLD-2 · payment-3 · Rabe', created_at: 1, balance: 25 },
    { id: 'unknown', source: 'OTHER', source_reference: 'Règlement revendeur missing · unknown', created_at: 1, balance: 10 }
  ] as TreasuryFund[];
  const sales = [{ sale_number: 'VTE-1', customer_name: 'Rakoto' }] as import('../types').Sale[];
  const logs = [
    { action: 'MANUAL_CREDIT_PAYMENT', new_value: { id: 'payment-2', debt_id: 'debt-1' } },
    { action: 'MANUAL_CREDIT_CREATED', new_value: { id: 'debt-1', customer_name: 'Rasoa' } }
  ] as import('../types').AuditLog[];
  const rows = buildTreasuryReportRows(funds, [], filters, sales, logs);
  assert.deepEqual(rows.map(row => [row.reseller, row.nature]), [
    ['Rakoto', 'Recouvrement'], ['Rasoa', 'Dette'], ['Rabe', 'Dette'], ['Revendeur non renseigné', 'Recouvrement']
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.balance, 0), 185);
  assert.deepEqual(buildTreasuryReportRows(funds, [], { ...filters, searchRef: 'Rasoa' }, sales, logs).map(row => row.id), ['manual']);
});

test('supplier purchase period uses actual payments, independently of creation and due dates', () => {
  const at = (day: string) => new Date(day + 'T12:00:00').getTime();
  const data = { articles: [], stores: [], stocks: [], transfers: [], movements: [], sales: [], productions: [], auditLogs: [],
    purchases: [
      { id: 'old-paid-now', store_id: 's', supplier_id: 'one', created_at: at('2026-01-01'), lines: [], payments: [{ paid_at: at('2026-11-16'), amount: 20 }, { paid_at: at('2026-11-17'), amount: 30 }] },
      { id: 'new-paid-before', store_id: 's', supplier_id: 'one', created_at: at('2026-11-16'), lines: [], payments: [{ paid_at: at('2026-11-15'), amount: 10 }] },
      { id: 'unpaid', store_id: 's', supplier_id: 'one', created_at: at('2026-11-16'), expected_payment_at: at('2026-11-16'), lines: [], payments: [] },
      { id: 'other-supplier', store_id: 's', supplier_id: 'two', created_at: at('2026-01-01'), lines: [], payments: [{ paid_at: at('2026-11-16'), amount: 10 }] }
    ]
  } as unknown as ReportData;
  const rows = (extra: Partial<GeneralFilters>) => filterReportData(data, { ...filters, ...extra }).purchases!;
  assert.deepEqual(rows({ startDate: '2026-11-16', endDate: '2026-11-16', supplierId: 'one' }).map(row => row.id), ['old-paid-now']);
  assert.equal(rows({ startDate: '2026-11-16', endDate: '2026-11-16', supplierId: 'one' })[0].payments.length, 2);
  assert.deepEqual(rows({ endDate: '2026-11-15' }).map(row => row.id), ['new-paid-before']);
  assert.deepEqual(rows({ startDate: '2026-11-17' }).map(row => row.id), ['old-paid-now']);
  assert.equal(rows({}).length, 4);
  assert.equal(rows({ startDate: '2026-11-16', endDate: '2026-11-16', storeIds: ['elsewhere'] }).length, 0);
});
