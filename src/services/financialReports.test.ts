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
