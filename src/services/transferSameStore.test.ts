import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Store } from '../types';
import { permitsSameStoreTransfer } from './transferSameStore';

const depot = { store_type: 'CENTRAL_WAREHOUSE', is_active: true } as Store;
test('permits an internal return only in an active central warehouse', () => {
  assert.equal(permitsSameStoreTransfer('STORE_RETURN', depot), true);
  for (const store_type of ['POS', 'MANUFACTURER', 'RESELLER'] as const) {
    assert.equal(permitsSameStoreTransfer('STORE_RETURN', { ...depot, store_type }), false);
  }
  assert.equal(permitsSameStoreTransfer('STORE_RETURN', { ...depot, is_active: false }), false);
  assert.equal(permitsSameStoreTransfer('STORE_RETURN'), false);
});
test('keeps direct deposits and forbids all other same-store transfer types', () => {
  assert.equal(permitsSameStoreTransfer('DIRECT_DEPOSIT', depot), true);
  for (const type of ['STANDARD', 'STORE_TO_STORE', 'CENTRAL_TO_POS', 'RECYCLING', 'MANUFACTURER_TO_STORE', 'SUPPLIER_TO_STORE']) {
    assert.equal(permitsSameStoreTransfer(type, depot), false);
  }
});
