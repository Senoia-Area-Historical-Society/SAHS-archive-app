import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
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
 * SITE_HEAD_FILE names a file to replace its site-head block with. A
 * deployment's CI build sets it (see .github/workflows/deploy.yml).
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

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? filesUnder(dir, rel) : [rel]
  })
}

/**
 * A museum's own static files (its icons, hero photos, logo), served from the
 * site root beside public/. public/ holds only what every install needs, so a new
 * museum never ships another's images. SITE_PUBLIC_DIR names a directory whose
 * files are emitted into dist/ under the same names, and served in dev.
 * A deployment's CI build sets it, beside SITE_HEAD_FILE.
 *
 * Its files keep their exact paths because settings and other build inputs point
 * at them (hero slides, SITE_OG_IMAGE, the head file's icons). A missing one would
 * not 404: Hosting's catch-all rewrite would answer with index.html. So a named
 * directory that doesn't exist fails the build, and so does a name public/ already
 * has. robots.txt is generated at deploy time and can't be overridden here.
 */
function sitePublic(): Plugin {
  const dir = process.env.SITE_PUBLIC_DIR
  if (!dir) return { name: 'site-public' }

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`SITE_PUBLIC_DIR is "${dir}", which is not a directory.`)
  }
  const files = filesUnder(dir)
  const clashes = files.filter((f) => f === 'robots.txt' || existsSync(path.join('public', f)))
  if (clashes.length) {
    throw new Error(`SITE_PUBLIC_DIR may not provide ${clashes.join(', ')}: public/ or the deploy already does.`)
  }
  const served = new Set(files)

  return {
    name: 'site-public',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        if (!served.has(rel)) return next()
        res.setHeader('Content-Type', CONTENT_TYPES[path.extname(rel).toLowerCase()] ?? 'application/octet-stream')
        res.end(readFileSync(path.join(dir, rel)))
      })
    },
    generateBundle() {
      for (const fileName of files) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(path.join(dir, fileName)) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), siteHead(), sitePublic()],
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
