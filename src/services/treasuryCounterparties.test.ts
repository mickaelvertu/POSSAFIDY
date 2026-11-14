import test from 'node:test';
import assert from 'node:assert/strict';
import { treasuryCounterparties } from './treasuryCounterparties';
import type { TreasuryFund, TreasuryMovement, Expense, Purchase } from '../types';
const funds=[{id:'f',owner_id:'a',owner_name:'Alice',source:'BANK',source_reference:'Retrait BNI'}] as TreasuryFund[];
const purchase={id:'p',purchase_number:'ACH-2026-0087',supplier_name:'Fournisseur Safidy'} as Purchase;
const expense={id:'e',expense_number:'DEP-01',payee:'Transporteur Rabe'} as Expense;
const resolve=treasuryCounterparties(funds,[purchase],[expense]);
const movement=(kind:TreasuryMovement['kind'],fields:Partial<TreasuryMovement>={})=>({kind,from_user:'a',to_user:'',reference:'',purchase_id:'',...fields} as TreasuryMovement);
test('purchase movements identify supplier by document or legacy purchase number',()=>{
  assert.deepEqual(resolve(movement('PURCHASE',{purchase_id:'p'})),{from:'Alice',to:'Fournisseur · Fournisseur Safidy'});
  assert.equal(resolve(movement('PURCHASE',{reference:'ACH-2026-0087'})).to,'Fournisseur · Fournisseur Safidy');
  assert.equal(resolve(movement('PURCHASE',{purchase_id:'deleted'})).to,'Fournisseur non renseigné');
});
test('expenses name beneficiaries and refunds reverse the direction',()=>{
  assert.equal(resolve(movement('EXPENSE',{expense_id:'e'})).to,'Bénéficiaire · Transporteur Rabe');
  assert.deepEqual(resolve(movement('EXPENSE_REFUND',{expense_id:'e',from_user:'',to_user:'a'})),{from:'Remboursement · Transporteur Rabe',to:'Alice'});
  assert.equal(resolve(movement('EXPENSE',{reference:'DEP-01'})).to,'Bénéficiaire · Transporteur Rabe');
});
test('deposits and receipts expose references, transfers keep administrator identities',()=>{
  assert.equal(resolve(movement('DEPOSIT',{reference:'BNI / BRD-1'})).to,'Banque · BNI / BRD-1');
  assert.deepEqual(resolve(movement('RECEIPT',{from_user:'',to_user:'a',destination_fund_id:'f'})),{from:'Retrait bancaire · Retrait BNI',to:'Alice'});
  assert.deepEqual(resolve(movement('TRANSFER',{to_user:'b'})),{from:'Alice',to:'b'});
});
