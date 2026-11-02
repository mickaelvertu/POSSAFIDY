const assert = require('node:assert/strict');
const project = 'demo-sale-rules';
const origin = 'http://127.0.0.1:8189';
const root = `projects/${project}/databases/(default)/documents`;
const enc = value => value === null ? { nullValue: null } : Array.isArray(value) ? { arrayValue: { values: value.map(enc) } } : typeof value === 'object' ? { mapValue: { fields: fields(value) } } : typeof value === 'number' ? Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value } : typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value };
const fields = data => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => [key, enc(value)]));
const write = (path, data) => ({ update: { name: `${root}/${path}`, fields: fields(data) } });
const payload = { sub: 'super', user_id: 'super', aud: project, iss: `https://securetoken.google.com/${project}`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, firebase: { identities: {}, sign_in_provider: 'custom' } };
const token = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.';
async function commit(writes, auth = 'owner') {
  const response = await fetch(`${origin}/v1/${root}:commit`, { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
  return { status: response.status, body: await response.json() };
}
async function run(count, storeType = 'POS', options = {}) {
  await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  const sale = { id: 'sale', sale_number: 'TEST-SALE', store_id: 'store', customer_type: 'PARTICULIER', customer_name: 'Test client', seller_id: 'seller', seller_name: 'Test seller', status: 'VERIFIED', created_at: 1, subtotal: count, discount: 0, tax: 0, total: count, amount_paid: count, payment_method: 'CASH', lines: Array.from({ length: count }, (_, i) => ({ article_id: `article-${i}`, quantity: 1, total: 1, unit_price: 1, discount: 0 })) };
  const stocks = sale.lines.map(line => ({ id: `stock-${line.article_id}`, store_id: 'store', article_id: line.article_id, quantity: 100, reserved_quantity: 0, updated_at: 1 }));
  const seeded = await commit([
    write('users/super', { role: options.role || 'SUPER_ADMIN', status: options.status || 'ACTIVE', permissions: options.permissions || ['users.view', 'users.create', 'users.edit', 'users.delete', 'users.permissions'], assignedStores: options.stores || [] }),
    write('stores/store', { store_type: storeType, is_active: true }), write('sales/sale', sale),
    ...sale.lines.map(line => write(`articles/${line.article_id}`, { article_type: options.articleType || 'RESALE' })),
    ...stocks.map(stock => write(`stocks/${stock.id}`, stock)),
  ]);
  assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
  const checks = new Map();
  if (options.checked) {
    for (let offset = 0; offset < count; offset += 7) {
      const indexes = Array.from({ length: Math.min(7, count - offset) }, (_, i) => offset + i);
      const id = `check-${offset}`;
      const checked = await commit([write(`saleCatalogChecks/${id}`, {
        sale_id: sale.id, store_id: sale.store_id, sale_created_at: sale.created_at,
        sale_lines: sale.lines, article_ids: indexes.map(i => sale.lines[i].article_id), line_indexes: indexes, created_by: 'super',
      })], token);
      if (checked.status !== 200) return checked.status;
      indexes.forEach((i, article_index) => checks.set(sale.lines[i].article_id, { sale_check: { check_id: id, article_index } }));
    }
  }
  if (options.stale) assert.equal((await commit([write('sales/sale', { ...sale, lines: sale.lines.map((line, i) => i === 0 ? { ...line, quantity: 2 } : line) })])).status, 200);
  const result = await commit([
    ...stocks.flatMap(stock => [
      write(`stocks/${stock.id}`, { ...stock, ...checks.get(stock.article_id), quantity: 99, updated_at: 2 }),
      write(`movements/movement-sale-${stock.article_id}`, { id: `movement-sale-${stock.article_id}`, ...checks.get(stock.article_id), store_id: 'store', article_id: stock.article_id, movement_type: 'SALE', quantity: -1, reference_type: 'SALE', reference_id: 'sale', reference_number: 'TEST-SALE', before_quantity: 100, after_quantity: 99, created_by: 'super', created_at: 2 }),
    ]),
    write('sales/sale', { ...sale, status: 'VALIDATED', validated_by: 'super', validated_at: 2 }),
    write('auditLogs/test', { user_id: 'super', action: 'SALE_VALIDATED', entity_type: 'SALE', entity_id: 'sale', created_at: 2 }),
  ], token);
  return result.status;
}
module.exports = { run, commit, write, token, project, origin, root };
