# Running the Archive Demo

This guide shows how to run a **blank copy of the Online Archive on your own laptop**,
as if a different museum were setting it up for the first time. It's for demos and
rehearsals, including the February 2027 demonstration.

**It's completely separate from the real archive.** Everything runs on your laptop
and starts empty each time. Nothing you do in the demo can change
archives.senoiahistory.com, and it costs nothing.

---

## Quick start

1. Open **PowerShell**.
2. Type `wsl` and press Enter. The prompt changes to something like
   `catnolan@sahs-dell5420:~$`.
3. Run:

   ```bash
   cd ~/SAHS-archive-app && npm run demo
   ```

4. Wait about 30 seconds for a box that says **"The demo archive is ready."**
5. Open **http://localhost:5174** in your browser.
6. Sign in. In the sign-in window, choose **Add new account** and enter
   `director@examplemuseum.org`.

**To stop:** press **Ctrl+C** in the PowerShell window, or close it.

**To start over with an empty archive:** stop it, then run `npm run demo` again.

---

## Before your first demo on a laptop

The demo needs the archive's code and a few tools, which are already set up on
the SAHS Dell (sahs-dell5420). On that laptop, skip this section.

On a different computer, someone technical needs to set up WSL, Node.js 20,
Java 21, the Firebase command-line tools and a copy of the project (with
`npm install` run in both the project folder and its `functions` folder). The
project's `CLAUDE.md` has the technical details.

**Make sure you have the latest version of the demo** before rehearsing. In WSL:

```bash
cd ~/SAHS-archive-app && git switch main && git pull
```

> Until the demo changes are merged into the main version, use
> `git switch feat/local-demo` instead of `git switch main`.

---

## A suggested demo walkthrough

This order tells the story of a new museum getting started.

**1. The empty archive and first-time setup**
- Open http://localhost:5174 and sign in as `director@examplemuseum.org`.
- You land on the **Setup Wizard** automatically, because the archive is empty.
- **Claim Admin Rights.** This person becomes the museum's administrator.

**2. Setting up the museum** (wizard steps 2–7)
- **Organization:** the museum's full name, short name and sidebar title, e.g.
  "Example County Historical Society" / "ECHS".
- **Branding:** a homepage title (required to continue), a color theme, and an
  uploaded **logo** and **slideshow images**.
- **Links, Map, Tabs and Text:** optional. Fill in a couple to show they exist.
- Finish. You arrive at the museum's own, empty archive home page.

**3. Adding the first item**
- Add an archive item with a photo or scanned document attached.
- Open it to show the item page.

**4. Managing staff**
- Go to **Admin Settings** (http://localhost:5174/settings).
- Add a curator, e.g. `intern@examplemuseum.org` as **Curator**, to show the
  museum managing its own staff.
- Point out the **Support access** box: the archive's developers (SAHS) have
  admin access to help with support, the museum can see that, and it can be
  removed.

**Optional: showing the security**
- In a private/incognito window, sign in as `stranger@example.com` and try to
  **Claim Admin Rights**. It's refused, because only the email the installer chose can set
  up a new archive.

**Tip:** use a new **private/incognito window** whenever you switch accounts.

---

## Useful options

**Use a different director email:**

```bash
npm run demo -- --director someone@example.org
```

Then sign in with that email instead.

**See what's stored behind the scenes:** open **http://localhost:4000** and click
**Firestore** (the database) or **Storage** (uploaded files).

---

## If something goes wrong

| What you see | What to do |
|---|---|
| `Cannot find path 'C:\Users\...\SAHS-archive-app'` | You're in PowerShell, not WSL. Type `wsl` first, then run the command again. |
| `These ports are already in use` | A demo is already running somewhere. Find that window and press Ctrl+C, or restart the laptop, then try again. |
| `npm error Missing script: "demo"` | You're on an older version. Follow **Make sure you have the latest version** above. |
| The sign-in window doesn't appear | Your browser blocked the pop-up. Click the blocked-pop-up icon in the address bar and allow pop-ups for `localhost`. |
| The sign-in window is the **real Google** page | You're on the wrong address. Use **http://localhost:5174**, not 5173. |
| `... is not on this archive's list of setup administrators` | You signed in with a different email from the one the demo was started with. Sign in as `director@examplemuseum.org`, or restart with `--director` and your email. |
| The wizard's **Next** button is greyed out | A required box is empty. On the branding step, that's **Homepage Hero Title**. |
| The page won't load in the browser | Stop the demo and start it again. If it still won't load, restart the laptop. |
| The map is blank | The map needs internet to draw its tiles. Everything else works offline. |

If it says something else, the technical log is at
`/tmp/archive-demo-emulators.log` in WSL. Send that file to whoever is helping you.

---

## Demo-day checklist

- [ ] Use the laptop you rehearsed on, plugged in.
- [ ] The day before: get the latest version and do one full run-through.
- [ ] Have the logo and a few images to upload saved somewhere easy to find, e.g.
      the Desktop.
- [ ] Start `npm run demo` **before** the audience arrives, and leave it running.
- [ ] Open http://localhost:5174 in a fresh browser window.
- [ ] Have a screen recording of a rehearsal ready as a backup.
- [ ] If the venue has no internet, everything works except the map.
