# Trying the Archive with Docker

Run a complete, private copy of the Online Archive on your own computer, with no
Firebase account, Google Cloud project or software beyond Docker. You get an empty
archive and can set it up as your own museum: name, logo, colors and first items.

**This is for trying the software, not for running your archive.** Its sign-in is
simulated, so anyone who can reach it could sign in as anyone. For that reason it
only accepts connections from the computer it runs on. See
[Running it for real](#running-it-for-real).

## What you need

- [Docker Desktop](https://www.docker.com/products/docker-desktop/), or another
  Docker-compatible tool such as Rancher Desktop or Podman Desktop. Check Docker's
  license terms if your institution is large: Docker Desktop is not free for every
  organization.
- [Git](https://git-scm.com/downloads), to download the project.
- About 3 GB of free disk space and 2 GB of free memory.

## Start it

In a terminal:

```bash
git clone https://github.com/Senoia-Area-Historical-Society/SAHS-archive-app.git
```

```bash
cd SAHS-archive-app
```

```bash
docker compose up
```

The first run builds everything and takes several minutes. Later runs take about 20
seconds. When you see **"The demo archive is ready"**:

1. Open **http://localhost:5174**.
2. Click **Log In**, then **Sign in with Google**. This is a simulated window; no
   Google account is involved. Allow pop-ups if your browser asks.
3. Choose **Add new account**, enter `director@examplemuseum.org`, and sign in.
4. The Setup Wizard walks you through claiming the archive and branding it.

To use a different address as the director, start it like this:

```bash
DIRECTOR_EMAIL=you@yourmuseum.org docker compose up
```

On Windows PowerShell, run `$env:DIRECTOR_EMAIL="you@yourmuseum.org"` first, then
`docker compose up`.

## Stop, resume and reset

| To | Do this |
|---|---|
| **Stop and keep your work** | Press **Ctrl+C** once and wait for the terminal prompt to return, or run `docker compose stop`. |
| **Carry on later** | `docker compose up` |
| **Erase everything and start blank** | `docker compose down -v` |
| **Get a newer version** | `git pull`, then `docker compose up --build` |

**Your work is saved only when you stop it this way.** If the computer loses power
or Docker is force-quit, you return to the last clean stop. Please don't keep
anything here that you can't afford to lose.

After a restart you'll be signed out. Log in again and pick your account from the
list; your access and everything you added will still be there.

## Good to know

- **The map and web fonts need internet.** Everything else works offline once it's
  built, so build it before you travel.
- **Book lookups, address geocoding and the Google Drive picker** rely on outside
  services and API keys and may not work here.
- **Images aren't resized into thumbnails** as they are in a real deployment. They
  display at full size.
- **Emails aren't sent.** Research-folder invitations are only logged.
- A red **"Running in emulator mode"** bar at the bottom of the page is expected. If
  it covers a button, scroll down.
- **Behind the scenes:** http://localhost:4000 shows the stored data and files.

## If something goes wrong

| What you see | What to do |
|---|---|
| `port is already allocated` | Something else is using that port, often an earlier copy. Run `docker compose down` (this keeps your data) and try again. The port numbers can't be changed, because the app is built to expect them. |
| The sign-in window doesn't appear | Allow pop-ups for `localhost` in your browser. |
| `... is not on this archive's list of setup administrators` | Sign in with the address the archive was started with. |
| The wizard says the archive is already set up, and you want to start again | `docker compose down -v` |
| Page won't open from another computer | That's deliberate; see the note at the top. |

## Running it for real

A real archive runs on your museum's own Firebase project, which needs a Google Cloud
billing account (Firebase's pay-as-you-go Blaze plan) because the archive uses Cloud
Functions. A Docker image can't replace that today, because the archive's security
and privacy rules are enforced by Firebase itself. Speak to the Senoia Area Historical
Society about setting one up.

## For maintainers

**How it fits together.** The image holds the built app and the Firebase emulators.
The emulators run under the project ID `demo-archive`. Firebase reserves the `demo-`
prefix: such a project has no cloud resources, and calls to non-emulated services
fail. So this image can't touch production, unlike `npm run demo`, which uses the
real project ID and relies on all the emulators being up. `docker/firebase.json` is
separate from the deployed `firebase.json`, so nothing here is in the deploy path.

**`.dockerignore` is an allowlist,** so `.env` and its billable Maps key can't reach
a published image. Add new top-level files to it deliberately.

**After upgrading `firebase-tools`, rerun this save-and-restore check.** `docker/start.cjs`
saves and restores the named Firestore database through an undocumented emulator API,
because the CLI's export covers only `(default)`:

1. `docker compose down -v`, then `docker compose up --build`.
2. Finish the Setup Wizard and upload a logo.
3. `docker compose stop`, then `docker compose start`.
4. The museum's name, the signed-in account and the logo must all still be there.
