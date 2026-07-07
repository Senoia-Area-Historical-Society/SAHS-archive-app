import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Firebase — split by service so each can be cached independently
          'firebase-core': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'firebase-storage': ['firebase/storage'],
          'firebase-extras': ['firebase/functions', 'firebase/analytics'],

          // Mapping libraries
          'leaflet': ['leaflet', 'react-leaflet'],

          // React ecosystem
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],

          // UI icons
          'lucide': ['lucide-react'],
        },
      },
    },
  },
})
