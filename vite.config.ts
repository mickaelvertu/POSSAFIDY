import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
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
const CACHE_NAME = 'gileada-shell-v1';
const PRECACHE_URLS = ${JSON.stringify(precacheFiles)};

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () =>
      (await caches.match(request, { ignoreVary: true })) ||
      (await caches.match('/index.html', { ignoreVary: true })) ||
      Response.error()
    ));
    return;
  }

  if (!/\\.(?:js|css|png|svg|webp|ico|woff2?|webmanifest)$/i.test(url.pathname)) return;
  event.respondWith(caches.match(request, { ignoreVary: true }).then(cached => cached || fetch(request).then(response => {
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
