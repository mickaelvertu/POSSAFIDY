import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { validateStockSync } from '../../src/services/stockSyncValidation';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
assert(process.argv[2], 'Provide latest stock export path');
const latest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const original = read('antsahabe-stock-correction-audit-2026-10-15.json');
assert.equal(original.blockers.length, 0);
const storeId = 'store-pos-02';
const current = latest.data.filter((row: any) => row.store_id === storeId);
assert(current.length > 0);
assert.equal(new Set(current.map((row: any) => row.article_code)).size, current.length);
const articles = original.articles.map((row: any) => {
  const matches = current.filter((item: any) => item.article_code === row.article_code);
  assert.equal(matches.length, 1, `Missing/ambiguous live article: ${row.article_code}`);
  const live = matches[0];
  assert(typeof live.quantity === 'number' && Number.isFinite(live.quantity) && live.quantity >= 0);
  const quantity = live.quantity + row.adjustment;
  assert(quantity >= 0, `Negative stock for ${live.article_name}`);
  return { ...row, article_id: live.article_id, article_name: live.article_name,
    previous_export_quantity: row.expected_current_quantity, expected_current_quantity: live.quantity,
    latest_net_change: live.quantity - row.expected_current_quantity,
    later_net_movements: live.quantity - row.imported_initial_quantity, quantity };
});
const changed = articles.filter((row: any) => row.adjustment !== 0);
const data = changed.map(({ article_id, article_code, article_name, expected_current_quantity, quantity }: any) =>
  ({ store_id: storeId, article_id, article_code, article_name, expected_current_quantity, quantity }));
const catalogue = read('catalogue-importable-2026-10-12.json').data.articles;
const liveCatalogue = current.map((row: any) => {
  const item = catalogue.find((item: any) => item.code === row.article_code);
  return { ...item, id: row.article_id, code: row.article_code, name: row.article_name };
});
const stocks = current.map((row: any) => ({ ...row, id: `stock-${storeId}-${row.article_id}`, reserved_quantity: 0 }));
const validation = validateStockSync(data, read('magasins-importables-2026-10-12.json').data, liveCatalogue, stocks, [storeId]);
assert.deepEqual(validation.errors, []);
assert.equal(validation.rows.length, data.length);
const adjustment = articles.reduce((sum: number, row: any) => sum + row.adjustment, 0);
const currentTotal = current.reduce((sum: number, row: any) => sum + row.quantity, 0);
const newActivity = articles.filter((row: any) => row.latest_net_change !== 0);
const summary = { stock_exported_at: latest.exportedAt, changed_articles: data.length,
  latest_activity_articles: newActivity.length, latest_activity_net_quantity: newActivity.reduce((sum: number, row: any) => sum + row.latest_net_change, 0),
  current_store_total: currentTotal, adjustment_total: adjustment, corrected_store_total: currentTotal + adjustment,
  corrected_initial_total: original.summary.corrected_initial_total,
  other_store_rows_in_import: data.filter((row: any) => row.store_id !== storeId).length };
const write = (name: string, value: unknown) => fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + '\n');
write('antsahabe-stock-correction-latest-transfer-import-2026-10-15.json', {
  version: 1, purpose: 'Correct initial stock while retaining balances from the latest stock export',
  baseline_reference: original.baseline_reference, source_exported_at: latest.exportedAt, summary, data
});
write('antsahabe-stock-correction-latest-transfer-audit-2026-10-15.json', {
  source_latest_stock: process.argv[2], baseline_reference: original.baseline_reference,
  application_rule: 'latest current quantity + corrected initial quantity - original imported initial quantity',
  assumption: 'The earlier correction has not already been applied. Balance differences since the movement report are retained in full.',
  summary, latest_balance_changes: newActivity, articles
});
console.log(JSON.stringify(summary, null, 2));
