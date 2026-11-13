---
name: run-archive-app
description: >
  Run, start, screenshot, or verify the digital archive app. Use when asked to
  launch the dev server or a demo, take a screenshot, confirm a change works in
  the browser, or test a browse/search/map/admin page. For architecture and edit
  patterns, see CLAUDE.md at the repo root.
---

# Run: Digital Archive app

Web app, driven with `chromium-cli` against the Vite dev server. Architecture (the
named Firestore database, privacy model, Cloud Functions, Leaflet maps, data model)
is in `CLAUDE.md`.

## Which way to run it

| Command | Data | Use for |
|---|---|---|
| `npm run demo` | a blank archive on the emulators, at http://localhost:5174 | anything that writes, first-run setup, demos |
| `npm run dev` | **the live project** named by `VITE_FIREBASE_PROJECT_ID` in `.env` | read-only browsing of real data |

`npm run dev` talks to production. Don't sign in and edit there to test a change;
use `npm run demo`.

## Start

```bash
npm run demo          # emulators + app on :5174; Ctrl+C stops everything
# or
npm run dev           # Vite on http://localhost:5173, live data
```

A worktree needs `.env` copied in before `npm run dev` works.

## Browser verification (agent path)

```bash
chromium-cli navigate http://localhost:5173
chromium-cli screenshot --output /tmp/archive-home.png

chromium-cli navigate http://localhost:5173/archive
chromium-cli screenshot --output /tmp/archive-browse.png

chromium-cli navigate http://localhost:5173/collections
chromium-cli screenshot --output /tmp/archive-collections.png

chromium-cli navigate http://localhost:5173/map
chromium-cli screenshot --output /tmp/archive-map.png

# Staff sign-in
chromium-cli navigate http://localhost:5173/login
chromium-cli screenshot --output /tmp/archive-login.png
```

Use port 5174 for `npm run demo`.

## Build and lint

```bash
npm run build    # tsc -b && vite build
npm run lint     # ESLint
npm test         # unit tests
```

## Gotchas

**Leaflet CSS must be imported** (`import 'leaflet/dist/leaflet.css'`). A map with
blank tiles or missing pin icons means the import is missing.

**Vite port.** The dev server defaults to `5173` and moves to the next free port if
that one is taken. `npm run demo` insists on `5174`.

**The map needs geocoded items.** `/map` is blank until some `archive_items` have
`coordinates`, which the `geocodeArchiveItemAddress` trigger sets from
`historical_address`.

**Pages are lazy-loaded.** The first visit to a page downloads its chunk, so a
screenshot taken straight away may catch the loading spinner. Wait first.
