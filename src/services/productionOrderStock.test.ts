import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Production, StockTransfer, StoreStock } from '../types';
import { productionOrderStock } from './productionOrderStock';
const stock = (store_id: string, quantity: number, quarantine_quantity: number) => ({ store_id, article_id: 'a', quantity, quarantine_quantity }) as StoreStock;
const transfer = (store: string, quantity: number, decision = 'RECYCLED', status = 'VALIDATED') => ({type:'RECYCLING', status, destination_store_id:store, lines:[{article_id:'a', quantity_accepted:quantity, recycling_decision:decision, recycled_available:decision === 'RECYCLED'}]}) as StockTransfer;
const production = (store: string, quantity: number, status = 'COMPLETED') => ({manufacturer_store_id:store, status, consumptions:[{article_id:'a',quantity,source:'RECYCLED'}]}) as Production;
test('normal stock excludes quarantine without subtracting it twice', () => {
  const row = productionOrderStock([stock('prd', 10, 40),stock('depot', 8, 20)], [], []).get('a');
  assert.deepEqual(row, {normal:18,quarantine:60,ready:0});
});
test('ready quantity excludes pending, destroyed, cancelled and already consumed quantities', () => {
  const row = productionOrderStock([stock('prd',10,30)], [transfer('prd',20),transfer('prd',100,'DESTROYED'),transfer('prd',100,'RECYCLED','CANCELLED'),transfer('prd',100,'','VALIDATED')], [production('prd',7),production('prd',100,'DRAFT')]).get('a');
  assert.deepEqual(row,{normal:10,quarantine:30,ready:13});
});
test('caps ready quantities per store and limits both buckets to authorized stores', () => {
  const stocks=[stock('one',5,2),stock('two',3,50)];
  const transfers=[transfer('one',10),transfer('two',6)];
  const productions=[production('two',2)];
  assert.deepEqual(productionOrderStock(stocks,transfers,productions).get('a'),{normal:8,quarantine:52,ready:6});
  assert.deepEqual(productionOrderStock(stocks,transfers,productions,['one']).get('a'),{normal:5,quarantine:2,ready:2});
  assert.equal(productionOrderStock(stocks,transfers,productions,[]).size,0);
});
