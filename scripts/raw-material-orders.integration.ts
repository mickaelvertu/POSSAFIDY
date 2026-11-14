import test from 'node:test';
import assert from 'node:assert/strict';
import { collection, doc, getDoc, getDocs, terminate } from 'firebase/firestore';
import { db } from '../src/firebase';
import { createRawMaterialOrder, reviewRawMaterialOrder } from '../src/services/rawMaterialOrderService';
import type { RawMaterialOrder, RawMaterialOrderLine } from '../src/services/rawMaterialOrderTypes';
import type { AppUser } from '../src/types';
const { commit, write, token, origin, root, project } = require('../scripts/sale-rules-fixture.cjs');
const admin = { uid: 'super', displayName: 'Admin', roleId: 'SUPER_ADMIN', isActive: true, storeIds: [] } as unknown as AppUser;
const line: RawMaterialOrderLine = { article_id: 'raw', article_code: 'MP-1', article_name: 'Huile', unit: 'L', quantity: 3, unit_cost: 200 };
const read = async (path: string) => (await getDoc(doc(db, path))).data()!;
const profile = (role: string, assignedStores: string[] = []) => write('users/super', { role, assignedStores, permissions: [], status: 'ACTIVE' });

test('DEP requests, review, atomic purchase creation and security rules', async t => {
  try {
    await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    assert.equal((await commit([
      profile('SUPER_ADMIN'), write('stores/dep', { id: 'dep', store_type: 'CENTRAL_WAREHOUSE', is_active: true }),
      write('stores/pos', { id: 'pos', store_type: 'POS', is_active: true }),
      write('articles/raw', { id: 'raw', code: 'MP-1', name: 'Huile', unit: 'L', is_active: true, article_type: 'RAW_MATERIAL' }),
      write('articles/resale', { id: 'resale', is_active: true, article_type: 'RESALE' }),
      write('suppliers/supplier', { id: 'supplier', name: 'Fournisseur', is_active: true })
    ])).status, 200);

    await t.test('assigned DEP manager submits raw materials and cannot order for POS or another depot', async () => {
      assert.equal((await commit([profile('RESPONSABLE_MAGASIN', ['dep'])])).status, 200);
      const manager = { ...admin, roleId: 'RESPONSABLE_MAGASIN', storeIds: ['dep'] } as AppUser;
      await createRawMaterialOrder(manager, 'dep', [line], 'Urgent');
      await assert.rejects(() => createRawMaterialOrder(manager, 'pos', [line], ''));
      await assert.rejects(() => createRawMaterialOrder(manager, 'dep', [{ ...line, article_id: 'resale' }], ''));
      const response = await fetch(`${origin}/v1/${root}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'rawMaterialOrders' }], where: { compositeFilter: { op: 'AND', filters: [['created_by', 'super'], ['store_id', 'dep']].map(([field, value]) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } })) } } } }) });
      assert.equal(response.status, 200, await response.text());
    });

    await commit([profile('SUPER_ADMIN')]);
    const order = (await getDocs(collection(db, 'rawMaterialOrders'))).docs[0].data() as RawMaterialOrder;
    await t.test('manager cannot review, convert or read another author request', async () => {
      await commit([profile('RESPONSABLE_MAGASIN', ['dep'])]);
      const changed = { ...order, reviewed_by: 'super', updated_at: order.updated_at + 1, reviewed_lines: [line] };
      assert.equal((await commit([write(`rawMaterialOrders/${order.id}`, changed)], token)).status, 403);
      await commit([write('rawMaterialOrders/other', { ...order, id: 'other', created_by: 'someone-else' })]);
      const response = await fetch(`${origin}/v1/${root}/rawMaterialOrders/other`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 403);
      await commit([profile('SUPER_ADMIN')]);
    });

    await t.test('conversion without an atomic purchase is denied', async () => {
      assert.equal((await commit([write(`rawMaterialOrders/${order.id}`, { ...order, status: 'PURCHASE_CREATED', supplier_id: 'supplier', reviewed_lines: [line], purchase_id: `purchase-raw-${order.id}`, reviewed_by: 'super', updated_at: order.updated_at + 1 })], token)).status, 403);
    });
    await t.test('admin saves analysis then creates exactly one draft purchase and audit', async () => {
      await reviewRawMaterialOrder(admin, order, [line], 'supplier', 'Retenu', 'SAVE');
      const reviewed = await read(`rawMaterialOrders/${order.id}`) as RawMaterialOrder;
      await assert.rejects(() => reviewRawMaterialOrder(admin, order, [line], 'supplier', '', 'PURCHASE'), /changé/);
      await reviewRawMaterialOrder(admin, reviewed, [line], 'supplier', 'Retenu', 'PURCHASE');
      const purchase = await read(`purchases/purchase-raw-${order.id}`);
      assert.equal(purchase.status, 'DRAFT'); assert.equal(purchase.total, 600); assert.equal(purchase.amount_paid, 0);
      assert.equal(purchase.store_id, 'dep'); assert.equal(purchase.raw_material_order_id, order.id);
      assert.equal((await read(`rawMaterialOrders/${order.id}`)).status, 'PURCHASE_CREATED');
      assert.equal((await getDocs(collection(db, 'auditLogs'))).size, 1);
      await assert.rejects(() => reviewRawMaterialOrder(admin, reviewed, [line], 'supplier', '', 'PURCHASE'), /changé/);
      assert.equal((await getDocs(collection(db, 'purchases'))).size, 1);
      assert.equal((await getDocs(collection(db, 'stocks'))).size, 0);
      assert.equal((await getDocs(collection(db, 'transfers'))).size, 0);
    });
    await t.test('refusal requires a reason and creates no purchase', async () => {
      await createRawMaterialOrder(admin, 'dep', [line], 'Second');
      const pending = (await getDocs(collection(db, 'rawMaterialOrders'))).docs.map(row => row.data() as RawMaterialOrder).find(row => row.notes === 'Second')!;
      await assert.rejects(() => reviewRawMaterialOrder(admin, pending, [], '', '', 'REJECT'));
      await reviewRawMaterialOrder(admin, pending, [], '', 'Non nécessaire', 'REJECT');
      assert.equal((await read(`rawMaterialOrders/${pending.id}`)).status, 'REJECTED');
      assert.equal((await getDocs(collection(db, 'purchases'))).size, 1);
    });
  } finally { await terminate(db); }
});
