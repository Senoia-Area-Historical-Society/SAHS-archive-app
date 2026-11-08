import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const { siteBuildDefines } = createRequire(import.meta.url)('./scripts/site-url.cjs')

// \r?\n: a Windows checkout (core.autocrlf) has CRLF line endings.
const SITE_HEAD_BLOCK = /[ \t]*<!-- site-head:start -->[\s\S]*?<!-- site-head:end -->\r?\n/

/**
 * Social scrapers and tab titles read index.html before any setting has loaded,
 * so a museum's name there has to arrive at build time. index.html is neutral;
 * SITE_HEAD_FILE names a file to replace its site-head block with. Production's
 * build sets it to deploy/sahs-head.html (see .github/workflows/deploy.yml).
 */
function siteHead(): Plugin {
  return {
    name: 'site-head',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!SITE_HEAD_BLOCK.test(html)) {
          throw new Error('index.html has lost its site-head markers.')
        }
        const file = process.env.SITE_HEAD_FILE
        if (file) {
          const head = readFileSync(file, 'utf8')
          return html.replace(SITE_HEAD_BLOCK, () => head)
        }
        return html.replace(/[ \t]*<!-- site-head:(start|end) -->\r?\n/g, '')
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), siteHead()],
  // The deployment's own address for canonical, og and JSON-LD URLs (src/lib/seo.ts).
  define: siteBuildDefines(),
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
