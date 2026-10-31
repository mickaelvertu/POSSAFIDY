import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createHash } from 'node:crypto';
import {defineConfig} from 'vite';

function offlineServiceWorker() {
  return {
    name: 'gileada-offline-service-worker',
    apply: 'build' as const,
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      const bundledFiles = Object.keys(bundle).filter(file => /\.(?:html|js|css|png|svg|webp|woff2?)$/i.test(file));
      const precacheFiles = [...new Set([
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/branding/apple-touch-icon.png',
        '/branding/favicon.png',
        '/branding/gileada-icon.png',
        '/branding/gileada-logo.png',
        '/branding/gileada-pwa-192.png',
        '/branding/gileada-pwa-512.png',
        ...bundledFiles.map(file => `/${file}`)
      ])];
      const source = `
const CACHE_NAME = 'gileada-shell-${createHash('sha256').update(JSON.stringify(precacheFiles)).digest('hex').slice(0, 12)}';
const PRECACHE_URLS = ${JSON.stringify(precacheFiles)};

async function cachedResponse(request) {
  const current = await caches.open(CACHE_NAME);
  return (await current.match(request, { ignoreVary: true })) || (await caches.match(request, { ignoreVary: true }));
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const versions = (await caches.keys()).filter(name => name.startsWith('gileada-shell-'));
    const keep = new Set([CACHE_NAME, ...versions.filter(name => name !== CACHE_NAME).slice(-1)]);
    await Promise.all(versions.filter(name => !keep.has(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data;
  if (data?.type !== 'action-notification') return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (client) {
      await client.focus();
      client.postMessage(data);
    } else {
      await self.clients.openWindow('/');
    }
  }));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () =>
      (await cachedResponse(request)) ||
      (await cachedResponse('/index.html')) ||
      Response.error()
    ));
    return;
  }

  if (!/\\.(?:js|css|png|svg|webp|ico|woff2?|webmanifest)$/i.test(url.pathname)) return;
  event.respondWith(cachedResponse(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), offlineServiceWorker()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // The Firebase SDK alone is ~825 kB and cannot be split further.
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('firebase') || id.includes('@firebase')) return 'firebase';
            if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
