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
        // Cache app shell + static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Runtime caching: Supabase storage (ebook signed URLs) — network-first
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 10,
            },
          },
          {
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
        description: 'Your complete Warhammer companion — library, lore, reading order, painting and AI oracle.',
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
