# deploy/

The Senoia Area Historical Society's own deployment files: its `<head>`
(`sahs-head.html`), its static files (`sahs-public/`: icons, hero photographs and
logos), and its demo notes (`DEMO-NOTES.md`). The build uses them only when told to, through `SITE_HEAD_FILE` and
`SITE_PUBLIC_DIR` (see `vite.config.ts`). Without those settings, a build includes
none of them.

**These files are not covered by the MIT license that applies to the rest of this
repository.** The photographs, logos and wording belong to the Senoia Area
Historical Society, which reserves all rights to them. Don't use them in your own
install. Supply your own through the same settings instead.

These files are expected to move to SAHS's private deployment repository.
