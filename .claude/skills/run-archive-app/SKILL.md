---
name: run-archive-app
description: >
  Run, start, screenshot, or verify the SAHS digital archives platform.
  Use when asked to launch the dev server, take a screenshot, confirm a change
  works in the browser, or test a browse/search/map/admin page. For architecture
  and edit patterns, see CLAUDE.md in this directory. Sibling: /run-sahs-website.
---

# Run: SAHS Archive App

Web app — driven with `chromium-cli` against the Vite dev server. All architectural context (Firestore named database, Gemini AI, Leaflet maps, data model) is in `archive-app/CLAUDE.md`.

## Prerequisites

Node and npm must be installed. No emulator setup needed for read-only browsing — the dev server hits the production `sahs-archives` Firestore database.

## Start Dev Server

```bash
# From archive-app/
npm run dev
# Vite starts on http://localhost:5173
```

## Browser Verification (Agent Path)

```bash
# Home / landing
chromium-cli navigate http://localhost:5173
chromium-cli screenshot --output /tmp/archive-home.png

# Browse archive items
chromium-cli navigate http://localhost:5173/archive
chromium-cli screenshot --output /tmp/archive-browse.png

# Collections listing
chromium-cli navigate http://localhost:5173/collections
chromium-cli screenshot --output /tmp/archive-collections.png

# Geographic map view
chromium-cli navigate http://localhost:5173/map
chromium-cli screenshot --output /tmp/archive-map.png

# Login page (SAHS staff gate)
chromium-cli navigate http://localhost:5173/login
chromium-cli screenshot --output /tmp/archive-login.png
```

## Build & Lint

```bash
npm run build    # TypeScript compile + Vite production build — confirms no type errors
npm run lint     # ESLint
```

## Run-Specific Gotchas

**Leaflet CSS must be imported** — `import 'leaflet/dist/leaflet.css'`. If the map page renders but shows blank tiles or missing pin icons, this import is missing somewhere in the component tree.

**Vite port** — Default is `5173`. If another process is on that port, Vite increments to `5174` — update your `chromium-cli` URL.

**Map page requires geocoded items** — `/map` is blank if no `archive_items` have a `coordinates` field. This field is populated by the `geocodeArchiveItemAddress` Cloud Function trigger when `historical_address` is set on an item.

**All pages are lazy-loaded** — First navigation to any page triggers a chunk download. Screenshots taken immediately after navigation may catch a loading spinner. Use `chromium-cli wait-for` or add a short delay before screenshotting.

## See Also

- `archive-app/CLAUDE.md` — architecture, named database, data model, functions, all gotchas
- `/run-sahs-website` — sibling public website and admin portal
