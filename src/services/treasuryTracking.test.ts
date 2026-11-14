import test from 'node:test';
import assert from 'node:assert/strict';
import { movementDelta, periodSummary, treasuryCsv } from './treasuryTracking';
import type { TreasuryFund, TreasuryMovement } from '../types';
const m = (kind: TreasuryMovement['kind'], amount: number, at: number, from = '', to = '') => ({ kind, amount, created_at: at, from_user: from, to_user: to } as TreasuryMovement);
test('global summary excludes transfers, handles refunds and reconstructs historical balances', () => {
  const movements = [m('RECEIPT',1000,1,'','a'),m('TRANSFER',300,2,'a','b'),m('EXPENSE',100,3,'b'),m('EXPENSE_REFUND',100,4,'','b'),m('DEPOSIT',200,5,'a')];
  const funds = [{owner_id:'a',balance:500},{owner_id:'b',balance:300}] as TreasuryFund[];
  assert.equal(movementDelta(movements[1]),0);
  assert.deepEqual(periodSummary(funds,movements,2,3),{opening:1000,closing:900,receipts:0,expenses:100,refunds:0,reversals:0,deposits:0,transfers:0});
  assert.deepEqual(periodSummary(funds,movements,2,3,'b'),{opening:0,closing:200,receipts:0,expenses:100,refunds:0,reversals:0,deposits:0,transfers:300});
  assert.equal(periodSummary(funds,movements,1,5,'a').closing,500);
  assert.equal(periodSummary(funds,movements,0,0).closing,0);
});
test('receipt reversal is an outflow and remains distinct from expenses', () => {
  const movements = [m('RECEIPT', 116500, 1, '', 'admin'), m('RECEIPT_REVERSAL', 116500, 2, 'admin')];
  const funds = [{ owner_id: 'admin', balance: 0 }] as TreasuryFund[];
  const summary = periodSummary(funds, movements, 2, 2, 'admin');
  assert.equal(summary.opening, 116500);
  assert.equal(summary.closing, 0);
  assert.equal(summary.reversals, 116500);
  assert.equal(summary.expenses, 0);
});
test('CSV quotes separators and neutralizes spreadsheet formulas without changing numeric amounts', () => {
  const csv=treasuryCsv([['=CMD()', ' \t+SUM(1)', 'a;"b', -10]]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=CMD()"'));
  assert.ok(csv.includes('"\' \t+SUM(1)"'));
  assert.ok(csv.includes('"a;""b"'));
  assert.ok(csv.includes('"-10"'));
});
