import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative Pfade: Die App läuft in jedem GitHub-Pages-Unterordner (z. B. /band-app/).
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registrierung per Skript statt virtuellem Modul: Ein Update lädt die Seite
      // nie von selbst neu – also auch nicht mitten im Auftritt.
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Band Planner',
        short_name: 'Band Planner',
        description: 'Setlists, Leadsheets und Notizen für Probe und Bühne – komplett offline.',
        lang: 'de',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0A0E17',
        background_color: '#0A0E17',
        categories: ['music', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Alle App-Assets inkl. PDF-Engine (.mjs) landen schon bei der Installation im Cache.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webp,woff2,pdf,wasm}'],
        // Die Band-Daten dürfen NIE aus dem Cache kommen, sonst sieht der GitHub-Sync veraltete Stände.
        globIgnores: ['band-data.json'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: 'index.html',
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/band-data.json'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.pathname.toLowerCase().endsWith('.pdf'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'band-pdf-dokumente',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'band-bilder',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // Die PDF-Engine ist groß, aber absichtlich Teil des Offline-Pakets.
    chunkSizeWarningLimit: 2000,
  },
});
