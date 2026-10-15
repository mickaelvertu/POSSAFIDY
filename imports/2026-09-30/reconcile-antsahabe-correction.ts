import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { parseCsv, validateStockSync } from '../../src/services/stockSyncValidation';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const plan = read('correction-stock-initial-antsahabe-2026-10-15.json');
const catalogue = read('catalogue-importable-2026-10-12.json').data.articles;
const stores = read('magasins-importables-2026-10-12.json').data;
const movementFile = process.argv[2];
const ledgerFile = process.argv[3];
assert(movementFile && ledgerFile, 'Provide movement and ledger CSV paths');
const moves = parseCsv(fs.readFileSync(movementFile, 'utf8'));
const ledger = parseCsv(fs.readFileSync(ledgerFile, 'utf8'));
const storeLabel = 'Antsahabe (POS-02)';
assert(moves.length && ledger.length);
assert(moves.every(row => row.magasin === storeLabel));
assert(ledger.every(row => row.magasin === storeLabel));
const baselineRef = 'SYNC-109F1A1D';
const number = (value: unknown) => { const result = Number(value); assert(value !== '' && Number.isFinite(result), `Invalid number: ${value}`); return result; };
const matchedMoves = new Set<object>();
const matchedLedger = new Set<object>();
const audit = plan.corrections.map((item: any) => {
  let article = catalogue.find((article: any) => article.id === item.article_id);
  assert(article, `Unknown article ${item.article_id}`);
  // The live ledger's article code takes precedence over an older local catalogue name.
  const liveLabels = [...new Set(ledger.map(row => String(row.article)).filter(label => label.replace(/ \[[^\]]+\]$/, '') === article.name))];
  assert(liveLabels.length <= 1, `Ambiguous live article: ${article.name}`);
  if (liveLabels.length) {
    const code = liveLabels[0].match(/ \[([^\]]+)\]$/)?.[1];
    const candidates = catalogue.filter((candidate: any) => candidate.code === code);
    assert.equal(candidates.length, 1, `Unknown live article code: ${code}`);
    article = { ...candidates[0], name: item.article_name };
  }
  const rows = moves.filter(row => row.article === article.name).sort((a, b) => number(a['date / heure']) - number(b['date / heure']));
  const lines = ledger.filter(row => row.article === `${article.name} [${article.code}]`);
  rows.forEach(row => matchedMoves.add(row));
  lines.forEach(row => matchedLedger.add(row));
  const baseline = rows.filter(row => row['réf / opérateur'] === baselineRef);
  assert(baseline.length <= 1, `Duplicate import: ${article.name}`);
  let current = 0;
  for (const row of rows) {
    assert.equal(number(row.avant), current, `Broken movement chain: ${article.name}`);
    current += number(row.mouvement);
    assert.equal(number(row['après']), current, `Invalid movement balance: ${article.name}`);
  }
  const entries = lines.filter(row => row.variation !== '');
  assert.equal(entries.length, rows.length, `Ledger count mismatch: ${article.name}`);
  let ledgerCurrent = 0;
  entries.forEach((line, index) => {
    const row = rows[index];
    assert.equal(line['référence'], row['réf / opérateur'], `Ledger reference mismatch: ${article.name}`);
    assert.equal(number(line.variation), number(row.mouvement));
    ledgerCurrent += number(line.variation);
    assert.equal(number(line.stock), ledgerCurrent);
  });
  if (rows.length) {
    const closing = lines.filter(row => row['opération'] === 'Stock après');
    assert.equal(closing.length, 1);
    assert.equal(number(closing[0].stock), current);
  } else assert.equal(lines.length, 0);
  const imported = baseline.reduce((sum, row) => sum + number(row.mouvement), 0);
  const laterChange = current - imported;
  const corrected = item.corrected_initial_quantity + laterChange;
  return { store_id: item.store_id, article_id: article.id, article_code: article.code, article_name: article.name,
    source_row: item.source_row,
    expected_current_quantity: current, imported_initial_quantity: imported,
    corrected_initial_quantity: item.corrected_initial_quantity, later_net_movements: laterChange,
    quantity: corrected, adjustment: corrected - current };
});
const unlistedMovements = moves.filter(row => !matchedMoves.has(row));
const unlistedLedger = ledger.filter(row => !matchedLedger.has(row));
assert.equal(new Set(audit.map((row: any) => row.article_code)).size, audit.length, 'Duplicate resolved article codes');
const changed = audit.filter((row: any) => row.adjustment !== 0);
const blockers = audit.filter((row: any) => row.quantity < 0);
const data = changed.map(({ store_id, article_code, article_name, quantity, expected_current_quantity }: any) =>
  ({ store_id, article_code, article_name, quantity, expected_current_quantity }));
const stocks = audit.map((row: any) => ({ id: `stock-${row.store_id}-${row.article_id}`, store_id: row.store_id, article_id: row.article_id, quantity: row.expected_current_quantity, reserved_quantity: 0 }));
if (!blockers.length) {
  const validation = validateStockSync(data, stores, catalogue, stocks, [plan.store_id]);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.rows.length, changed.length);
}
const sum = (field: string) => audit.reduce((total: number, row: any) => total + row[field], 0);
const summary = { articles: audit.length, changed_articles: changed.length, unchanged_articles: audit.length - changed.length,
  original_import_total: sum('imported_initial_quantity'), current_export_total: sum('expected_current_quantity'),
  corrected_initial_total: sum('corrected_initial_quantity'), later_net_movements: sum('later_net_movements'),
  corrected_current_total: sum('quantity'), adjustment_total: sum('adjustment'), movement_rows_verified: matchedMoves.size, unlisted_movement_rows: unlistedMovements.length };
const write = (file: string, value: unknown) => fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
if (!blockers.length && !unlistedMovements.length && !unlistedLedger.length) write('antsahabe-stock-correction-import-2026-10-15.json', { version: 1, purpose: 'Correct initial import, preserving subsequent movements', baseline_reference: baselineRef, summary, data });
write('antsahabe-stock-correction-audit-2026-10-15.json', { ready_to_apply: false, reason: blockers.length ? 'Negative resulting stock requires reconciliation' : 'Confirm exported balances still match live stock before import', source_movements: movementFile, source_ledger: ledgerFile, baseline_reference: baselineRef, summary, blockers, unlistedMovements, unlistedLedger, articles: audit });
console.log(JSON.stringify(summary, null, 2));
console.log('Negative stock blockers:', JSON.stringify(blockers, null, 2));
console.log('Unlisted movements (left unchanged):', JSON.stringify(unlistedMovements, null, 2));
