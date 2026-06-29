import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // Pin a fixed port so the data origin (localStorage + IndexedDB) never drifts.
  // strictPort: fail loudly if 5173 is taken instead of silently moving to 5174
  // (which would "hide" your saved data under a different origin).
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          supabase: ['@supabase/supabase-js'],
          three: ['three'],
        },
      },
    },
  },
})
