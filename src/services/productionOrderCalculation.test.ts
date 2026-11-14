import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { aggregateProductionSales, productionPeriod } from './productionOrderCalculation';
import type { Article, Sale } from '../types';
test('calendar week crosses month and includes Monday through Sunday in UTC+3', () => {
  const range = productionPeriod('WEEK', '2026-11-01');
  assert.equal(new Date(range.start).toISOString(), '2026-10-25T21:00:00.000Z');
  assert.equal(new Date(range.end).toISOString(), '2026-11-01T21:00:00.000Z');
});
test('calendar month handles leap years and invalid dates', () => {
  const r = productionPeriod('MONTH', '2028-02-17');
  assert.equal(r.end-r.start, 29*86400000);
  assert.throws(() => productionPeriod('MONTH', '2026-02-30'));
});
test('totals only validated product quantities, with exclusive end and active resale catalogue', () => {
  const articles = [{id:'a',code:'A',name:'Article',unit:'Pot',is_active:true,article_type:'RESALE'}, {id:'raw',is_active:true,article_type:'RAW_MATERIAL'}] as Article[];
  const make = (status: string, created_at: number, quantity: number) => ({status,created_at,lines:[{article_id:'a',quantity},{article_id:'raw',quantity:20},{article_id:'a',quantity:100,line_type:'SERVICE'}]}) as Sale;
  const lines = aggregateProductionSales([make('VALIDATED',10,0.1),make('VALIDATED',19,0.2),make('DRAFT',12,20),make('CANCELLED',12,20),make('REFUNDED',12,20),make('VALIDATED',20,20),make('VALIDATED',9,20)],articles,10,20);
  assert.equal(lines.length,1); assert.equal(lines[0].quantity,0.3);
});
