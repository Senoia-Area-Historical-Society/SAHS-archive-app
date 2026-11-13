# archive-app — CLAUDE.md

A digital archives platform for museums and historical societies: browse,
search, map and manage artifacts and documents, on React and Firebase. Built and
used by the Senoia Area Historical Society; any museum can run its own install.

This is the contributor guide. Notes about a particular deployment (its project,
people, extensions and incidents) belong in that deployment's own private repo,
not here. For SAHS that is `sahs-archive-deploy`.

## Tech Stack

| Layer | Technology |
|---|---|
| Build | Vite, TypeScript |
| Frontend | React, React Router |
| Styling | Tailwind CSS |
| Auth | Firebase Auth — Google OAuth |
| Database | Cloud Firestore — a **named** database, not `(default)` |
| Storage | Firebase Storage — the project's **default** bucket |
| Functions | Cloud Functions v2, JavaScript (CommonJS), codebase `archives` |
| Maps | Leaflet + react-leaflet |
| Testing | Vitest — unit (`npm test`) and rules (`npm run test:rules`) |

**Each Firebase project names its archive database once**, in
`functions/.env.<project id>` (`ARCHIVE_DATABASE=...`). The CLI loads that file
into the Cloud Functions on deploy and in the emulator, and `functions/database.js`
binds every trigger to it. `scripts/lib/archiveDatabase.cjs` reads the same file
for the web build (`__ARCHIVE_DATABASE__`, via `VITE_FIREBASE_PROJECT_ID`), the
scripts and the Docker demo. `scripts/check-firestore-database-target.cjs`, the
first deploy step, fails unless `firebase.json` targets exactly that database.
None of these has a default: a trigger bound to the wrong database never fires
and never errors, so a missing value must stop the build or deploy. A new install
adds its own `functions/.env.<project id>`; `src/test/archiveDatabase.test.ts`
fails on a literal database name in the app or functions.

## Commands

```bash
npm run dev              # Vite dev server
npm run dev:emulators    # dev server pointed at the Firebase emulators
npm run demo             # blank archive on all four emulators, for demos — see scripts/demo.cjs
docker compose up        # the same, needing only Docker, for evaluators — see docs/DOCKER.md
npm run build            # tsc -b && vite build
npm run lint             # ESLint (pre-existing warnings, 0 errors)
npm test                 # unit tests — no emulator needed
npm run test:rules       # security-rules tests — wraps `firebase emulators:exec`
```

Before pushing anything that touches rules or `functions/`:

```bash
npm run build && npm test && npm run test:rules && (cd functions && npm run lint)
```

## Deployment

`.github/workflows/deploy.yml` deploys `hosting,functions,storage,firestore` on
every push to `main`, so **merging a PR is currently a production release** for
SAHS. That workflow is moving to SAHS's private deploy repo; after that, upstream
gets a PR-check workflow and versioned releases.

A deployment's identity is four build inputs: `SITE_HEAD_FILE` (its static
`<head>`, icons included), `SITE_PUBLIC_DIR` (its own static files, such as icons,
hero photos and logos, served from the site root beside `public/`), and `SITE_URL`
and `SITE_OG_IMAGE` (`scripts/site-url.cjs`), baked into the app by Vite and into
`functions/shared/seo.cjs` by `prepare-functions.cjs`. **A build without them is
neutral**: no icon, no museum images, canonicals use the serving origin, there is no
default share image, and the sitemap and list-page scripts refuse to run. Set all
four for any production build or functions deploy. `public/` holds only what every
install needs (`src/test/museumAssets.test.ts`); a museum's files keep their exact
names, because a missing one is answered with `index.html` and a 200, not a 404.

**`functions/shared/seo.cjs` and `functions/shell.html` are generated, never
committed** (they would carry one deployment's address and `<head>`). A functions
deploy needs `npm run build && npm run prepare:functions` first, with the same
`SITE_*` values; CI does this. The functions require `seo.cjs` when they load, so
the emulator needs at least `npm run prepare:functions -- --shared-only`, which
`npm run demo` and the Docker image run for you.

## Access model

Three layers see roles differently, and that difference is the source of most
access bugs here.

| Layer | Can it read `user_roles`? | What it accepts |
|---|---|---|
| `AuthContext` | yes | role document, support list |
| `firestore.rules` | yes, via `get()` | role document, support list — **not** the claim, so a revoked role stops at once |
| `storage.rules` | **no** | `role` claim only |
| `functions/restrictedMedia.js` | not used | `role` claim, support list |

Access comes from a `user_roles` document, never from an email domain. Storage
Rules cannot read Firestore *at all*, let alone a named database, so
`functions/userRoles.js` mirrors each role onto the user's Auth **custom claim** —
`syncUserRoleClaims` on a role write, `syncSupportAdminClaims` on a support-list
write, `syncMyRoleClaim` on sign-in. A role holder with no claim is invisible to
Storage. `functions/roleResolution.js` decides the role.

**Support admins** are the archive's developers, admitted as admin in an install so
they can help with support. The list lives in `deployment_config/support`, is set
only by `scripts/set-support-admins.cjs`, is shown to the museum's staff in Admin
Settings, and can be removed (`--none`). Any admin — support or museum-granted —
may grant and revoke roles; roles are `admin` and `curator` only.

`scripts/backfill-role-claims.cjs` reconciles claims against `user_roles`.
Removing a role also revokes the user's refresh tokens, so Storage access ends
when their current ID token expires (within the hour).

**First-run setup** (the Setup Wizard's self-grant of admin on an empty archive)
is open only to the exact addresses in `deployment_config/bootstrap`, set with
`scripts/set-setup-admins.cjs` (`--emulator` for local demos). No document means
nobody can bootstrap. The app can neither read nor write that collection, and the
list stops mattering once `site_settings/setup` is complete.

## Privacy model

The archive is public; individual items and collections can be private.

- `is_private` on an item is the **effective** value — what `firestore.rules` and
  every public query read.
- `is_private_own` is the curator's own choice.
- `is_private = is_private_own || pending/deaccessioned artifact || (any
  collection it belongs to is private)`, maintained by
  `functions/collectionPrivacy.js`. Membership for privacy is `collection_ids`
  **and** the legacy `collection_id`, unioned.

**The client always writes `is_private_own` explicitly** whenever it sets
privacy, together with the effective `is_private` (so there is no public window
before the trigger runs) — use `src/lib/itemPrivacy.ts`. The triggers derive
`is_private` from `is_private_own` and never change an existing one. Writing
`is_private` alone does not express a choice: a change event cannot tell a
curator's write from the collection trigger's inheritance write, and inferring
it is what once pinned items private after their collection went public. The
artifact-status force is never written into `is_private_own`.

Public reads are gated by `allow read: if resource.data.is_private == false ||
isSAHSUser()`, so **every public query must carry the filter** — use
`publicOnly(isSAHSUser)` from `src/lib/privacyQuery.ts`, or `publicOnlyWith` when
the query already uses `or()`.

Media privacy is separate and lives in object ACLs, not rules: public objects are
served via IAM at `storage.googleapis.com`, restricted ones have their download
tokens revoked and are fetched through `restrictedMediaUrl`.
`functions/mediaVisibility.js` applies an item's visibility to its media and
thumbnails whenever its `is_private` or media changes;
`scripts/reconcile-media-visibility.cjs` keeps the whole bucket in step with
Firestore and should run regularly as the backstop. The resize extension must be
configured with `MAKE_PUBLIC=false` (`extensions/storage-resize-images.env`), so
a thumbnail is public only if its item is.

## Demos and trial installs

A blank install has to look like the *adopting museum's* archive, not SAHS's.
There are two ways to run one, and both use emulators only — nothing reaches
production.

| | `npm run demo` (`scripts/demo.cjs`) | `docker compose up` (`docker/start.cjs`) |
|---|---|---|
| For | rehearsals on a dev machine | evaluators, needing only Docker |
| App | Vite on `:5174` | built app served by the hosting emulator on `:5174` |
| Setup admin | `--director <email>`, default `director@examplemuseum.org` | `DIRECTOR_EMAIL`, same default |
| Support admins | set by the script | `SUPPORT_ADMINS`, **empty by default** — a trial must not quietly make anyone else its admins |
| Data | blank every run | kept in the `archive-data` volume until `docker compose down -v` |

Both write `deployment_config/bootstrap` and `deployment_config/support` on start.
Compose binds every port to `127.0.0.1` on purpose: emulator sign-in is fake, so
anyone who could reach the ports could be anyone. Host and container ports must
match, because the built app has them hard-coded. The image is built with no
`SITE_*` variables, so it carries no deployment's identity.

User-facing docs: `docs/DEMO-GUIDE.md` is a non-technical walkthrough;
`docs/DOCKER.md` is for evaluators and holds the save-and-restore check to rerun
after upgrading the emulator image. Both describe the Setup Wizard and home page
step by step — update them when either changes.

**The Getting Started checklist** (`src/lib/gettingStarted.ts`, pure and tested;
`src/components/GettingStarted.tsx`, on Home) is what a new museum's staff see after
the wizard. Its rules:

- Every step is derived from archive data, never from clicks, so work done any
  other way still ticks it off. An archive that already has everything never sees
  the card at all; a failed load shows nothing.
- Admins see branding (always done — `App.tsx` holds signed-in users at `/setup`
  until it is complete), item, collection (only if `enableCollections`), location
  and colleague. Curators see item, collection and location, and their item step
  counts only items they uploaded (`uploaded_by_email`). Only the admin version
  reads `user_roles`; keep any new probe to queries the rules allow that role.
- Closing it is stored in `localStorage` under a key that includes
  `site_settings/setup.completedAt`, so `docker compose down -v` brings it back for
  the next rehearsal. **Getting Started** in the sidebar links to `/?guide=open`,
  which reopens it and clears the closed flag.

Browse, Library and Collections have empty states for a new archive: staff get a
link to add the first item or book, visitors a neutral "nothing published yet". The
Collections list is never empty, because it always merges in the built-in virtual
collections (`pending-acquisitions`, `deaccessioned-artifacts`, `on-loan`), so its
staff note checks for "only built-ins" instead.

## Cloud Functions (`functions/`)

| Function | Trigger | Purpose |
|---|---|---|
| `geocodeArchiveItemAddress` | Firestore | geocodes `historical_address` |
| `onCommentCreated` | Firestore | comment moderation notifications |
| `syncItemPrivacy` / `syncCollectionPrivacy` | Firestore | effective item privacy |
| `syncItemMediaVisibility` | Firestore | item media ACLs and tokens follow `is_private` |
| `syncUserRoleClaims` | Firestore | mirrors a role onto the Auth claim |
| `syncMyRoleClaim` | callable | self-heals a missing claim on sign-in |
| `sendShareInvitation` | Firestore | emails a folder's new collaborator via Resend (`RESEND_API_KEY` secret, optional `INVITATION_FROM_ADDRESS` env var) |
| `syncMemberLogins` | Firestore | `member_logins/{secondary email}` → member record, so spouses get member access |
| `restrictedMediaUrl` | callable | short-lived signed URLs for staff-only media |
| `lookupIsbnFallback` | callable | ISBN lookup for the library |
| `renderMeta` | HTTP (Hosting rewrite) | SSR `<head>` for `/items/**`, `/collections/**`, `/library/**` |

**There are no unauthenticated `onRequest` functions, and it should stay that way.**
Everything is a trigger or an `onCall` (which populates `request.auth` from a
verified token). `renderMeta` is the sole `onRequest` and is a Hosting rewrite,
public by design, and filters private items itself.

## Gotchas

**The emulators use the named database too**, not the default one, because the
functions' Firestore triggers are bound to it. `npm run demo` (project
`sahs-archives`) and Docker (`demo-archive`) each read it from their own
`functions/.env.<project id>`; Docker's is allowlisted in `.dockerignore`. Run the functions emulator
alongside auth, firestore and storage (`npm run demo` does): a function calling a
service with no emulator running reaches production.

**The CLI's emulator export skips the named database.** `--export-on-exit` and
`--import` save Auth and Storage but only the `(default)` Firestore database, so
adding them to `npm run demo` would keep accounts and files and lose the archive.
`docker/start.cjs` saves and restores the named database through the emulator's API.

**`firestore.rules` governs the named database only.** The app talks only to it
(`db` in `src/lib/firebase.ts`). Email goes through Resend from
`sendShareInvitation`, never through a Firestore mail queue written by the browser.
Firebase Extensions stop accepting installs and edits on 2027-03-31, so don't
build new features on one.

**`firestore.indexes.json` is deployed declaratively and deletes anything not in
it.** Add a composite index there *before* shipping a query that needs it, or
production gets "requires an index". Firestore also **rejects** indexes it
considers unnecessary — all-equality combinations, and anything ending in
`__name__` — with `HTTP Error: 400, this index is not necessary`, which fails the
whole deploy. A composite index is needed only for equality plus an `orderBy` on
another field, or equality plus `array-contains`.

**In a rules privacy check, read the field directly.** `resource.data.is_private ==
false` works; `resource.data.get('is_private', false) != true` silently does not.
Firestore evaluates a list query against the *constraints the query carries*, and
can only tie a rule to a query when the rule compares a field directly. Behind a
map `.get()` the analyser gives up and stops requiring the query to filter at all —
an unfiltered list is then allowed and every private item comes back. Single
document reads are denied correctly either way, so only a list-query test catches
it.

**A `functions/` module imported by `src/test/` must have no imports of its own.**
The site's `tsc -b` follows test imports into `functions/`, where it has neither
`node` types nor the functions dependencies. That is why the decision logic in
`collectionPrivacyRules.js` is import-free and the trigger wiring in
`collectionPrivacy.js` is separate.

**Installed extensions are not deployed by CI.** `extensions/` holds only
`storage-resize-images`'s config, applied with `firebase deploy --only
extensions`. `firebase ext:list --project <id>` shows what a project has.

**Role simulation is admin-only and derives from `localStorage`.** See
`src/lib/effectiveRoles.ts`. A simulation is honoured only for an account that
actually holds the role; the stored value alone grants nothing.

**Scripts default to a dry run and take `--prod` to write.** That applies to
`migrate-item-privacy-and-paperwork.cjs`, `backfill-role-claims.cjs`,
`backfill-member-logins.cjs` and `normalize-artifact-types.cjs`; all are
idempotent. Under bare user ADC the Auth API needs `GOOGLE_CLOUD_QUOTA_PROJECT=<project>`
set **per command** — never via `gcloud auth application-default
set-quota-project`, which changes it for every tool on the machine.

**Scripts take the project from `--project <id>`, else `.firebaserc`'s
`projects.default`** (`scripts/lib/archiveProject.cjs`), and that project's
database and bucket from its `functions/.env.<project id>` (`ARCHIVE_DATABASE`,
`ARCHIVE_STORAGE_BUCKET`). There is no project in code. Each run prints
`Project: … Database: …` first, and refuses if `GOOGLE_CLOUD_PROJECT` or
`GCLOUD_PROJECT` names a different project. `src/test/archiveProject.test.ts`
fails on a project or bucket name written into `scripts/`.

**A museum's wording lives in its settings, not in the defaults.** Defaults in
`AppearanceContext`, `Home.tsx`, `src/lib/seo.ts` and `index.html` are what any new
museum sees, so they stay neutral (`src/test/noSenoiaDefaults.test.ts`). A
museum's text comes from `site_settings/appearance`, which stores every content
block; its static `<head>` comes from `SITE_HEAD_FILE` (see Deployment). Hero
slides are the `backgroundImages` setting; a museum without slides gets a solid
colour.

**`renderMeta` serves `/items/**` and friends; the list pages are static.**
`scripts/generate-static-pages.cjs` pre-renders only the `<head>` of the six public
list pages, so social scrapers get real metadata while the bodies still hydrate
from Firestore. It needs `cleanUrls: true` in `firebase.json`.
