const esbuild = require('esbuild');
esbuild.build({
  entryPoints: ['scripts/inventory-service.integration.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external',
  outfile: 'build/inventory-service.integration.mjs',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  plugins: [{ name: 'emulator-only-firebase', setup(build) {
    build.onResolve({ filter: /\/firebase$/ }, () => ({ path: 'emulator-firebase', namespace: 'local-test' }));
    build.onLoad({ filter: /.*/, namespace: 'local-test' }, () => ({ loader: 'ts', resolveDir: process.cwd(), contents: `
      import { initializeApp } from 'firebase/app';
      import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator, runTransaction } from 'firebase/firestore';
      const app = initializeApp({ projectId: 'demo-sale-rules', apiKey: 'test-only' });
      export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
      connectFirestoreEmulator(db, '127.0.0.1', 8189, { mockUserToken: { sub: 'super', user_id: 'super' } });
      export const runOnlineTransaction = operation => runTransaction(db, operation);
    ` }));
  } }],
}).catch(error => { console.error(error); process.exitCode = 1; });
