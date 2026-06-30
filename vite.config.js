import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // Precache all static assets including JS chunks for full offline support.
        // JS files are content-hashed so cached entries never go stale — new deploys
        // create new URLs, which are fetched fresh on the next online visit.
        globPatterns: ['**/*.{css,html,ico,png,svg,woff2,js}'],
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Self-hosted book covers (/covers/*) — CacheFirst so they persist
            // offline once viewed, without bloating the install-time precache.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/covers/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'book-covers',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            // Supabase API + Storage — NetworkFirst with short timeout
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Google Fonts — CacheFirst (stable for a year)
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: 'WH Companion',
        short_name: 'WH',
        description: 'Your complete Warhammer companion — library, lore, reading order and painting tracker.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0905',
        theme_color: '#0a0905',
        orientation: 'any',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        categories: ['books', 'entertainment', 'games'],
        lang: 'en',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // Vitest owns unit/component tests; Playwright specs under e2e/ run separately.
    // Never pick up Stryker's sandbox copies as real test files.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.stryker-tmp/**', '**/e2e/**'],
  },
  optimizeDeps: {
    include: ['epubjs'],
  },
  build: {
    chunkSizeWarningLimit: 800,
    commonjsOptions: {
      include: [/epubjs/, /jszip/, /node_modules/],
    },
  },
})
