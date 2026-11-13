import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)
const { siteBuildDefines } = require('./scripts/site-url.cjs')
const { archiveDatabaseFor } = require('./scripts/lib/archiveDatabase.cjs')

/**
 * The Firestore database the app reads and writes, from the same
 * functions/.env.<project id> file the Cloud Functions' triggers are bound by, so
 * the two cannot disagree. A build for a project with no such file fails here.
 * Unit tests import no Firebase code, so they get an empty value instead.
 */
function archiveDatabaseDefine(mode: string): string {
  if (process.env.VITEST) return ''
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return archiveDatabaseFor(env.VITE_FIREBASE_PROJECT_ID)
}

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
export default defineConfig(({ mode }) => ({
  plugins: [react(), siteHead()],
  define: {
    // The deployment's own address for canonical, og and JSON-LD URLs (src/lib/seo.ts).
    ...siteBuildDefines(),
    __ARCHIVE_DATABASE__: JSON.stringify(archiveDatabaseDefine(mode)),
  },
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
}))
