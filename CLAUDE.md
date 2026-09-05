# archive-app — CLAUDE.md

Digital archives platform at `archives.senoiahistory.com`. Sibling to
`../sahs-website/` (the public society website); see `../CLAUDE.md` for the
two-app overview — but read the Gotchas here first, because several of that file's
claims about *this* app are wrong.

## Tech Stack

| Layer | Technology |
|---|---|
| Build | Vite, TypeScript |
| Frontend | React, React Router |
| Styling | Tailwind CSS |
| Auth | Firebase Auth — Google OAuth |
| Database | Cloud Firestore — **named database `sahs-archives`**, not the default |
| Storage | Firebase Storage — the project's **default** bucket |
| Functions | Cloud Functions v2, JavaScript (CommonJS), codebase `archives` |
| Maps | Leaflet + react-leaflet |
| Testing | Vitest — unit (`npm test`) and rules (`npm run test:rules`) |

## Commands

```bash
npm run dev              # Vite dev server
npm run dev:emulators    # dev server pointed at the Firebase emulators
npm run build            # tsc -b && vite build
npm run lint             # ESLint (44 pre-existing warnings, 0 errors)
npm test                 # unit tests — no emulator needed
npm run test:rules       # security-rules tests — wraps `firebase emulators:exec`
```

Before pushing anything that touches rules or `functions/`:

```bash
npm run build && npm test && npm run test:rules && (cd functions && npm run lint)
```

## Firebase / GCP

- **Project:** `sahs-archives`, shared with `sahs-website`
- **Firestore:** the **named** database `sahs-archives`. The website uses the
  default one. They do not share data — see the Gotchas.
- **Storage:** the project's default bucket. The website now has its own
  (`sahs-website-media`) and is scoped to it via a `website-media` target, so the
  two repos no longer overwrite each other's rules. **Do not add a bucket target
  here** without re-reading that history.
- **Auth:** one Firebase Auth instance shared with the website.
- **Deploy:** every push to `main` runs
  `deploy --only hosting,functions,storage,firestore`. **Merging a PR is a
  production release.** There is a concurrency group, so runs queue rather than
  race.

## Access model

Three layers see roles differently, and that difference is the source of most
access bugs here.

| Layer | Can it read `user_roles`? | What it accepts |
|---|---|---|
| `AuthContext` | yes | role document |
| `firestore.rules` | yes, via `get()` | `role` claim, role document, 2 hardcoded admins |
| `storage.rules` | **no** | `role` claim, 2 hardcoded admins |
| `functions/restrictedMedia.js` | not used | `role` claim, 2 hardcoded admins |

Storage Rules cannot read Firestore *at all*, let alone a named database. That is
why `functions/userRoles.js` mirrors each role onto the user's Auth **custom
claim** — `syncUserRoleClaims` on write, `syncMyRoleClaim` on sign-in. A role
holder with no claim is invisible to Storage.

Permanent admins, hardcoded in all three: `catnolan@senoiahistory.com`,
`jeremywarren@senoiahistory.com`. Roles are `admin` and `curator` only.

`scripts/backfill-role-claims.cjs` reconciles claims against `user_roles`.

## Privacy model

The archive is public; individual items and collections can be private.

- `is_private` on an item is the **effective** value — what `firestore.rules` and
  every public query read.
- `is_private_own` is the curator's own choice.
- `is_private = is_private_own || (any collection it belongs to is private)`,
  maintained by `functions/collectionPrivacy.js`.

Public reads are gated by `allow read: if resource.data.is_private == false ||
isSAHSUser()`, so **every public query must carry the filter** — use
`publicOnly(isSAHSUser)` from `src/lib/privacyQuery.ts`, or `publicOnlyWith` when
the query already uses `or()`.

Media privacy is separate and lives in object ACLs, not rules: public objects are
served via IAM at `storage.googleapis.com`, restricted ones have their download
tokens revoked and are fetched through `restrictedMediaUrl`.
`scripts/reconcile-media-visibility.cjs` keeps the bucket in step with Firestore
and runs fortnightly.

## Cloud Functions (`functions/`)

| Function | Trigger | Purpose |
|---|---|---|
| `geocodeArchiveItemAddress` | Firestore | geocodes `historical_address` |
| `onCommentCreated` | Firestore | comment moderation notifications |
| `syncItemPrivacy` / `syncCollectionPrivacy` | Firestore | effective item privacy |
| `syncUserRoleClaims` | Firestore | mirrors a role onto the Auth claim |
| `syncMyRoleClaim` | callable | self-heals a missing claim on sign-in |
| `restrictedMediaUrl` | callable | short-lived signed URLs for staff-only media |
| `lookupIsbnFallback` | callable | ISBN lookup for the library |
| `renderMeta` | HTTP (Hosting rewrite) | SSR `<head>` for `/items/**`, `/collections/**`, `/library/**` |

**There are no unauthenticated `onRequest` functions, and it should stay that way.**
Everything is a trigger or an `onCall` (which populates `request.auth` from a
verified token). `renderMeta` is the sole `onRequest` and is a Hosting rewrite,
public by design, and filters private items itself.

## Gotchas

**The monorepo `../CLAUDE.md` is wrong about this app in three places.** It says
neither app checks the email domain (this one did, until the domain grant was
removed in Sept 2026); that both apps share one `user_roles` collection (they are
in *different databases* — granting a role in the website admin does nothing
here, and vice versa); and that `extractMetadata` is a live Gemini function (it
was deleted in `82f9d81` as part of cost control — there is no Gemini or Vertex
code in this repo at all).

**Two Firestore databases, one Auth instance.** `src/lib/firebase.ts` exports both
`db` (named `sahs-archives`) and `defaultDb` (the website's). The only current use
of `defaultDb` is `MyResearch.tsx` writing to the website's `mail` collection for
the Trigger Email extension. `firestore.rules` in this repo governs the *named*
database only — a rule written here has no effect on anything in `defaultDb`.

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
`collectionPrivacy.js` is separate. The same split exists in the website
(`ticketEmailContent.ts` / `ticketEmail.ts`).

**Installed extensions are not in version control**, so nothing in this repo
mentions them. `firebase ext:list --project sahs-archives` is the only way to see
them, and `gcloud functions describe ext-<name>-<fn> --region <r>
--format="value(environmentVariables)"` is how to read their configuration.
Currently active: `storage-resize-images`, `firestore-send-email` (the website's
`mail` queue), `storage-extract-image-text` (OCRs **every** bucket upload into an
`extractedText` collection in the *default* database), and
`firestore-algolia-search`, which is misconfigured — its `COLLECTION_PATH` is a
document id, so it indexes nothing.

**Role simulation is admin-only and derives from `localStorage`.** See
`src/lib/effectiveRoles.ts`. A simulation is honoured only for an account that
actually holds the role; the stored value alone grants nothing.

**Scripts default to a dry run and take `--prod` to write.** That applies to
`migrate-item-privacy-and-paperwork.cjs` and `backfill-role-claims.cjs`; both are
idempotent. Under bare user ADC the Auth API needs
`GOOGLE_CLOUD_QUOTA_PROJECT=sahs-archives` set **per command** — not via `gcloud
auth application-default set-quota-project`, which changes it for every tool on the
machine and is what routed the August 2026 Vertex AI spend.

**`renderMeta` serves `/items/**` and friends; the list pages are static.**
`scripts/generate-static-pages.cjs` pre-renders only the `<head>` of the six public
list pages, so social scrapers get real metadata while the bodies still hydrate
from Firestore. It needs `cleanUrls: true` in `firebase.json`.
