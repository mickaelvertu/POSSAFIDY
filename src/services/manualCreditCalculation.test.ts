import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManualDebt, validateManualPayment, manualDebtRemaining, type ManualCreditDebt } from './manualCreditCalculation';
import type { CreditCustomer } from '../types';
const customer={is_active:true,credit_limit:1000,outstanding_balance:300} as CreditCustomer;
test('manual debt checks the current available credit, date, reference and integer amounts',()=>{
  assert.doesNotThrow(()=>validateManualDebt(customer,700,Date.now(),'ANCIEN-01'));
  for(const amount of [0,-1,0.5,701,Infinity,NaN])assert.throws(()=>validateManualDebt(customer,amount,Date.now(),'REF'));
  assert.throws(()=>validateManualDebt({...customer,is_active:false},1,Date.now(),'REF'));
  assert.throws(()=>validateManualDebt(customer,1,NaN,'REF'));
  assert.throws(()=>validateManualDebt(customer,1,Date.now(),' '));
});
test('manual repayments preserve the remainder and cannot overpay or repeat a settled debt',()=>{
  const debt={amount:1000,amount_paid:300} as ManualCreditDebt;
  assert.equal(manualDebtRemaining(debt),700);
  assert.doesNotThrow(()=>validateManualPayment(debt,700));
  for(const amount of [0,-1,0.5,701,Infinity,NaN])assert.throws(()=>validateManualPayment(debt,amount));
  assert.throws(()=>validateManualPayment({...debt,amount_paid:1000},1));
});
