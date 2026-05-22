import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
