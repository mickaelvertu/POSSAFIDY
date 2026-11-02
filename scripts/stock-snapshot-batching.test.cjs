const { test } = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');

test('snapshot imports bound transaction size and preserve all 57 stock adjustments', async () => {
  const batches = [];
  globalThis.__snapshotTransactions = batches;
  try {
    const result = await esbuild.build({
      entryPoints: ['src/services/stockImportService.ts'], bundle: true,
      platform: 'node', format: 'cjs', write: false,
      plugins: [{ name: 'mock-firestore', setup(build) {
        build.onResolve({ filter: /^(firebase\/firestore|\.\.\/firebase)$/ }, args => ({ path: args.path, namespace: 'mock' }));
        build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
          export const db = {};
          export const doc = (_, collection, id) => ({ collection, id });
          export const getDoc = async () => { throw new Error('Unexpected getDoc'); };
          export async function runOnlineTransaction(callback) {
            const writes = [];
            const result = await callback({
              get: async () => ({ exists: () => true, data: () => ({ quantity: 20, reserved_quantity: 0 }) }),
              set: (ref, value) => writes.push({ ref, value })
            });
            globalThis.__snapshotTransactions.push(writes);
            return result;
          }
        ` }));
      } }],
    });
    const module = { exports: {} };
    new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
    const rows = Array.from({ length: 57 }, (_, i) => ({ id: `stock-${i}`, store_id: 'store-pos-03', article_id: `article-${i}`, quantity: i, before: 20 }));
    const imported = await module.exports.applyStockSnapshot(rows, { roleId: 'SUPER_ADMIN', id: 'super', displayName: 'Super' });
    assert.equal(batches.length, 12);
    for (const batch of batches) assert.ok(batch.filter(w => w.ref.collection === 'stocks').length <= 5);
    assert.deepEqual(imported.stocks.map(s => s.id), rows.filter(r => r.quantity !== 20).map(r => r.id));
    assert.equal(imported.movements.length, 56);
    assert.equal(imported.auditLogs.length, 56);
    assert.equal(new Set(imported.movements.map(m => m.id)).size, 56);
    for (const movement of imported.movements) assert.equal(movement.after_quantity, movement.before_quantity + movement.quantity);
  } finally {
    delete globalThis.__snapshotTransactions;
  }
});
