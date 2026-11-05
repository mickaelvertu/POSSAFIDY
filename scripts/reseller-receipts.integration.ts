import test from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, terminate } from 'firebase/firestore';
import { db } from '../src/firebase';
import { createCreditSale, recordCreditPayment } from '../src/services/creditService';
import { recordResellerCashPayment } from '../src/services/resellerOrderService';
import { createCashHandover, confirmCashHandoverReceipt } from '../src/services/cashHandoverService';
import { resellerBusinessDate } from '../src/services/resellerReceiptCalculation';
import type { Sale, CreditPayment, CashHandover } from '../src/types';
import { ALL_PERMISSIONS } from '../src/types';
const { commit, write, token, origin, project } = require('../scripts/sale-rules-fixture.cjs');
const read = async (path: string) => (await getDoc(doc(db, path))).data()!;
const audit = (id: string) => ({ id, user_id: 'super', action: 'TEST', entity_type: 'SALE', entity_id: 's', created_at: Date.now() } as any);
const payment = (id: string, amount = 100): CreditPayment => ({ id, amount, method: 'CASH', paid_at: Date.now(),
  collected_by: 'super', collected_by_name: 'Encaisseur', recorded_by: 'super', recorded_by_name: 'Encaisseur' });
const sale = { id: 's', sale_number: 'FACT-DEP', store_id: 'dep', customer_type: 'REVENDEUR', credit_customer_id: 'c',
  status: 'VALIDATED', seller_id: 'seller', created_at: Date.now() - 86400000, total: 2000, amount_paid: 0,
  payment_status: 'PENDING', payment_method: 'CASH', lines: [] } as unknown as Sale;
const profile = (role: string, assignedStores = ['dep']) => ({ role, assignedStores, status: 'ACTIVE', displayName: 'Encaisseur',
  permissions: ['sales.view', 'sales.create', 'credit.sales', 'cash_handover.view', 'cash_handover.create'] });
const handover = (id: string, ids: string[], amount: number): CashHandover => ({ id, handover_number: id,
  receipt_ids: ids, store_id: 'dep', store_name: 'DEP', business_date: resellerBusinessDate(Date.now()), expected_cash_sales: amount,
  cash_sale_count: ids.length, declared_amount: amount, declared_by: 'super', declared_by_name: 'Encaisseur', declared_at: Date.now(),
  status: 'DECLARED', deposited_amount: 0, deposits: [] });

test('real collector, daily DEP handover and direct treasury receipts', async t => {
  try {
    await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    assert.equal((await commit([
      write('users/super', profile('RESPONSABLE_MAGASIN')), write('users/other', profile('ADMIN')),
      write('stores/dep', { store_type: 'CENTRAL_WAREHOUSE', is_active: true }), write('sales/s', sale),
      write('creditCustomers/c', { id: 'c', is_active: true, credit_limit: 3000, payment_term_days: 15, outstanding_balance: 2000 }),
    ])).status, 200);
    let current = sale;
    await t.test('initial DEP payments identify the responsible even while the sale is a draft', async () => {
      const initial = { ...sale, id: 'initial-sale', sale_number: 'INITIAL', status: 'DRAFT', seller_id: 'super', seller_name: 'Encaisseur',
        created_at: Date.now(), total: 100, amount_paid: 100, payment_status: 'PAID',
        lines: [{ article_id: 'article', quantity: 1, unit_price: 100, total: 100 }] } as Sale;
      const saved = await createCreditSale(initial, audit('initial'));
      assert.equal(saved.credit_payments?.[0].collected_by, 'super');
      assert.equal((await read('resellerReceipts/initial-initial-sale')).amount, 100);
      assert.equal((await read('resellerReceipts/initial-initial-sale')).destination, 'HANDOVER');
      assert.equal((await read('creditCustomers/c')).outstanding_balance, 2000);
    });
    await t.test('responsible receives money today for an older sale; identity and customer debt are recorded atomically', async () => {
      current = await recordCreditPayment(current, payment('p1'), audit('p1'));
      const receipt = await read('resellerReceipts/p1');
      assert.equal(receipt.collected_by, 'super'); assert.equal(receipt.business_date, resellerBusinessDate(Date.now()));
      assert.equal(receipt.destination, 'HANDOVER'); assert.equal(receipt.handover_id, '');
      assert.equal((await read('creditCustomers/c')).outstanding_balance, 1900);
      assert.equal(current.credit_payments?.[0].collected_by, 'super');
    });
    await t.test('cannot record on behalf of another collector, reuse a payment, or collect outside assigned DEP', async () => {
      await assert.rejects(recordCreditPayment(current, { ...payment('foreign'), collected_by: 'other' }, audit('foreign')));
      await assert.rejects(recordCreditPayment(current, payment('p1'), audit('duplicate')));
      await commit([write('users/super', profile('RESPONSABLE_MAGASIN', []))]);
      await assert.rejects(recordCreditPayment(current, payment('outside'), audit('outside')));
      await commit([write('users/super', profile('RESPONSABLE_MAGASIN'))]);
      assert.equal((await read('sales/s')).amount_paid, 100);
    });
    await t.test('server rejects forged collector, tampered receipt and free-standing receipts', async () => {
      const receipt = await read('resellerReceipts/p1');
      assert.equal((await commit([write('resellerReceipts/p1', { ...receipt, collected_by: 'other' })], token)).status, 403);
      assert.equal((await commit([write('resellerReceipts/forged', { ...receipt, id: 'forged' })], token)).status, 403);
      const forged = { ...payment('forged-payment'), collected_by: 'other', cash_destination: 'HANDOVER' };
      assert.equal((await commit([write('sales/s', { ...current, amount_paid: 200, credit_payments: [...current.credit_payments!, forged] })], token)).status, 403);
    });
    await t.test('server rejects a complete payment without the debt update and rejects fabricated date or collector', async () => {
      for (const variant of ['debt', 'date', 'collector', 'destination']) {
        const p = { ...payment(`tamper-${variant}`), cash_destination: 'HANDOVER' };
        const row = { id: p.id, sale_id: 's', store_id: 'dep', amount: p.amount, method: p.method, paid_at: p.paid_at,
          business_date: resellerBusinessDate(p.paid_at), collected_by: 'super', collected_by_name: 'Encaisseur',
          recorded_by: 'super', recorded_by_name: 'Encaisseur', destination: 'HANDOVER', handover_id: '' };
        if (variant === 'date') row.business_date = '2020-01-01';
        if (variant === 'collector') { row.collected_by = 'other'; p.collected_by = 'other'; }
        if (variant === 'destination') { row.destination = 'TREASURY'; p.cash_destination = 'TREASURY'; }
        const writes = [write('sales/s', { ...current, amount_paid: current.amount_paid + p.amount,
          credit_payments: [...current.credit_payments!, p] }), write(`resellerReceipts/${p.id}`, row)];
        if (variant !== 'debt') writes.push(write('creditCustomers/c', { ...(await read('creditCustomers/c')),
          outstanding_balance: 1800, updated_at: p.paid_at, last_payment_sale_id: 's' }));
        assert.equal((await commit(writes, token)).status, 403, variant);
      }
      assert.equal((await read('creditCustomers/c')).outstanding_balance, 1900);
    });
    await t.test('a DEP declaration claims receipts exactly once; wrong amounts and competing declarations fail', async () => {
      await assert.rejects(createCashHandover(handover('wrong', ['p1'], 101), audit('wrong')));
      const results = await Promise.allSettled([
        createCashHandover(handover('h1', ['p1'], 100), audit('h1')),
        createCashHandover(handover('h2', ['p1'], 100), audit('h2')),
      ]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.ok(['h1', 'h2'].includes((await read('resellerReceipts/p1')).handover_id));
      await assert.rejects(createCashHandover(handover('again', ['p1'], 100), audit('again')));
      assert.equal((await commit([write('cashHandovers/without-claim', handover('without-claim', ['p1'], 100))], token)).status, 403);
    });
    await t.test('five receipts fit the rules budget and sum validation is enforced by Firestore', async () => {
      for (let i = 0; i < 5; i++) current = await recordCreditPayment(current, payment(`batch-${i}`, 10), audit(`batch-${i}`));
      const ids = Array.from({ length: 5 }, (_, i) => `batch-${i}`);
      const rows = await Promise.all(ids.map(id => read(`resellerReceipts/${id}`)));
      const wrong = handover('batch-wrong', ids, 51);
      assert.equal((await commit([write('cashHandovers/batch-wrong', wrong), ...rows.map(row => write(`resellerReceipts/${row.id}`, {
        ...row, handover_id: 'batch-wrong'
      }))], token)).status, 403);
      await createCashHandover(handover('batch', ids, 50), audit('batch'));
      assert.equal((await read('cashHandovers/batch')).declared_amount, 50);
    });
    await t.test('administrator receives directly into their treasury; funds cannot enter a DEP handover', async () => {
      await commit([write('users/super', profile('ADMIN', []))]);
      current = await recordCreditPayment(current, payment('admin', 200), audit('admin'));
      assert.equal((await read('resellerReceipts/admin')).destination, 'TREASURY');
      assert.equal((await read('treasuryFunds/reseller-admin')).balance, 200);
      assert.equal((await read('treasuryFunds/reseller-admin')).owner_id, 'super');
      assert.equal((await read('treasuryMovements/receipt-reseller-admin')).amount, 200);
      await assert.rejects(createCashHandover(handover('admin-double', ['admin'], 200), audit('admin-double')));
    });
    await t.test('noncash payments reduce debt but never create cash treasury funds or enter cash handovers', async () => {
      current = await recordCreditPayment(current, { ...payment('mobile', 50), method: 'MVOLA' }, audit('mobile'));
      const mobile = await read('resellerReceipts/mobile');
      assert.equal(mobile.method, 'MVOLA'); assert.equal(mobile.destination, 'HANDOVER');
      assert.equal((await getDoc(doc(db, 'treasuryFunds/reseller-mobile'))).exists(), false);
      await assert.rejects(createCashHandover(handover('mobile-cash', ['mobile'], 50), audit('mobile-cash')));
    });
    await t.test('cash order confirmation also records the actual administrator and treasury receipt', async () => {
      const cashSale = { ...sale, id: 'cash-order-sale', amount_paid: 0, payment_status: 'PENDING', credit_customer_id: undefined, total: 150 };
      const order = { id: 'cash-order', sale_id: cashSale.id, payment_type: 'CASH', status: 'APPROVED', reseller_user_id: 'reseller', order_number: 'CMD-CASH' };
      await commit([write('sales/cash-order-sale', cashSale), write('resellerOrders/cash-order', { ...order, store_id: 'dep' }),
        write('users/reseller', { role: 'REVENDEUR', status: 'ACTIVE' })]);
      await recordResellerCashPayment(order as any, 'super', 'Encaisseur');
      assert.equal((await read('resellerReceipts/cash-cash-order-sale')).collected_by, 'super');
      assert.equal((await read('treasuryFunds/reseller-cash-cash-order-sale')).balance, 150);
      await assert.rejects(recordResellerCashPayment(order as any, 'super', 'Encaisseur'));
    });
    await t.test('only a different user receives the DEP handover and credits that user once', async () => {
      const h = await read(`cashHandovers/${(await read('resellerReceipts/p1')).handover_id}`) as CashHandover;
      await assert.rejects(confirmCashHandoverReceipt(h, 100, '', 'super', 'Encaisseur', audit('self-receipt')));
      // The authenticated receiver is super; the original collector was a different person.
      const other = { ...h, id: 'other-h', declared_by: 'other-collector' };
      await commit([write('cashHandovers/other-h', other)]);
      await confirmCashHandoverReceipt(other, 100, '', 'super', 'Encaisseur', audit('receive'));
      assert.equal((await read('treasuryFunds/pos-other-h')).balance, 100);
      await assert.rejects(confirmCashHandoverReceipt(other, 100, '', 'super', 'Encaisseur', audit('receive-again')));
    });
    await t.test('collector name comes from the authenticated profile rather than submitted text', async () => {
      await commit([write('users/super', { role: 'ADMIN', status: 'ACTIVE', assignedStores: [], permissions: [], firstName: 'Jean', lastName: 'Encaisseur' })]);
      current = await recordCreditPayment(current, { ...payment('canonical', 10), collected_by_name: 'Faux nom', recorded_by_name: 'Autre nom' }, audit('canonical'));
      const receipt = await read('resellerReceipts/canonical');
      assert.equal(receipt.collected_by_name, 'Jean Encaisseur'); assert.equal(receipt.recorded_by_name, 'Jean Encaisseur');
      assert.equal(receipt.collected_by, 'super');
    });
    for (const role of ['RESPONSABLE_MAGASIN', 'ADMIN', 'SUPER_ADMIN']) for (const amount of [0, 40, 100]) {
      await t.test(`${role} creates reseller draft with ${amount} initially received`, async () => {
        const id = `draft-${role}-${amount}`;
        await commit([write('users/super', { ...profile(role), displayName: undefined, firstName: 'Jean', lastName: 'Encaisseur' }),
          write(`creditCustomers/${id}`, { id, is_active: true, credit_limit: 1000, payment_term_days: 15, outstanding_balance: 0 })]);
        const draft = { ...sale, id, sale_number: id, credit_customer_id: id, status: 'DRAFT', seller_id: 'super', seller_name: 'Jean Encaisseur',
          created_at: Date.now(), credit_due_at: Date.now() + 86400000, total: 100, amount_paid: amount,
          payment_status: amount === 0 ? 'PENDING' : amount === 100 ? 'PAID' : 'PARTIAL',
          lines: [{ article_id: 'article', quantity: 1, unit_price: 100, total: 100 }] } as Sale;
        const saved = await createCreditSale(draft, audit(id));
        assert.equal(saved.amount_paid, amount);
        assert.equal((await read(`creditCustomers/${id}`)).outstanding_balance, 100 - amount);
      });
    }
    for (const role of ['RESPONSABLE_MAGASIN', 'ADMIN']) {
      await t.test(`${role} can collect a legacy sale with a null payment history`, async () => {
        const id = `legacy-null-${role}`;
        const legacy = { ...sale, id, credit_customer_id: id, credit_payments: null } as unknown as Sale;
        await commit([write('users/super', profile(role)), write(`sales/${id}`, legacy),
          write(`creditCustomers/${id}`, { id, is_active: true, credit_limit: 3000, payment_term_days: 15, outstanding_balance: 2000 })]);
        const updated = await recordCreditPayment(legacy, payment(`pay-${id}`), audit(id));
        assert.equal(updated.amount_paid, 100);
      });
      await t.test(`${role} collects partial and final payments without legacy seller metadata`, async () => {
        const id = `legacy-metadata-${role}`;
        const legacy = { ...sale, id, credit_customer_id: id };
        delete (legacy as Partial<Sale>).seller_id;
        delete (legacy as Partial<Sale>).created_at;
        await commit([write('users/super', profile(role)), write(`sales/${id}`, legacy),
          write(`creditCustomers/${id}`, { id, is_active: true, credit_limit: 3000, payment_term_days: 15, outstanding_balance: 2000 })]);
        const partial = await recordCreditPayment(legacy, payment(`partial-${id}`, 500), audit(`partial-${id}`));
        const final = await recordCreditPayment(partial, payment(`final-${id}`, 1500), audit(`final-${id}`));
        assert.equal(final.payment_status, 'PAID');
        assert.equal((await read(`creditCustomers/${id}`)).outstanding_balance, 0);
      });
    }
    await t.test('legacy compatibility cannot add or change seller metadata while recording a payment', async () => {
      const id = 'legacy-immutable';
      const legacy = { ...sale, id, credit_customer_id: id };
      delete (legacy as Partial<Sale>).seller_id;
      const customer = { id, is_active: true, credit_limit: 3000, payment_term_days: 15, outstanding_balance: 2000 };
      await commit([write('users/super', profile('RESPONSABLE_MAGASIN')), write(`sales/${id}`, legacy), write(`creditCustomers/${id}`, customer)]);
      const p = { ...payment('legacy-immutable-payment'), cash_destination: 'HANDOVER' };
      const receipt = { id: p.id, sale_id: id, store_id: 'dep', amount: 100, method: 'CASH', paid_at: p.paid_at,
        business_date: resellerBusinessDate(p.paid_at), collected_by: 'super', collected_by_name: 'Encaisseur',
        recorded_by: 'super', recorded_by_name: 'Encaisseur', destination: 'HANDOVER', handover_id: '' };
      const updated = { ...legacy, amount_paid: 100, payment_status: 'PARTIAL', credit_payments: [p] };
      const writes = (value: object) => [write(`sales/${id}`, value), write(`resellerReceipts/${p.id}`, receipt),
        write(`creditCustomers/${id}`, { ...customer, outstanding_balance: 1900, last_payment_sale_id: id, updated_at: p.paid_at })];
      assert.equal((await commit(writes({ ...updated, seller_id: 'someone-else' }), token)).status, 403);
      assert.equal((await commit(writes({ ...updated, created_at: 1 }), token)).status, 403);
      assert.equal((await commit(writes({ ...updated, total: 2100 }), token)).status, 403);
      assert.equal((await commit(writes(updated), token)).status, 200);
    });
    await t.test('administrator collects complete invoices with realistic sale fields and permissions', async t => {
    for (const count of [1, 25, 100]) await t.test(`${count} invoice lines`, async () => {
      const id = `complete-${count}`;
      const full = { ...sale, id, credit_customer_id: id, sale_number: id, seller_name: 'Vendeur',
        customer_name: 'Revendeur', customer_phone: '', subtotal: 83000, discount: 0, tax: 0, total: 83000,
        amount_paid: 0, change_returned: 0, notes: '', device_id: 'POS-WEB-CLIENT',
        lines: Array.from({length:count}, (_, i) => ({id:`line-${i}`,sale_id:id,article_id:`article-${i}`,article_code:`ART-${i}`,
          article_name:`Article ${i}`,unit:'Pièce',quantity:1,unit_price:83000/count,discount:0,total:83000/count})) } as Sale;
      await commit([write('users/super', {...profile('ADMIN'), displayName: undefined, firstName: 'Jean', lastName: 'Encaisseur', permissions: ALL_PERMISSIONS}), write(`sales/${id}`, full),
        write(`creditCustomers/${id}`, {id,is_active:true,credit_limit:1000000,payment_term_days:15,outstanding_balance:83000})]);
      const partial = await recordCreditPayment(full, payment(`complete-partial-${count}`, 30000), audit(`complete-${count}`));
      const paid = await recordCreditPayment(partial, payment(`complete-final-${count}`, 53000), audit(`complete-final-${count}`));
      assert.equal(paid.payment_status, 'PAID');
    });
    });
  } finally { await terminate(db); }
});
