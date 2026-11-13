# SAHS demo notes

SAHS's own notes for running the demo. The general walkthrough is
[docs/DEMO-GUIDE.md](../docs/DEMO-GUIDE.md).

## The demo laptop

The SAHS Dell (`sahs-dell5420`) is already set up: WSL, Node.js, Java, the
Firebase command-line tools and a copy of the project. In WSL the prompt reads
`catnolan@sahs-dell5420:~$`. Skip the guide's "Before your first demo" section on
that laptop.

## Start it with SAHS as the support admins

`npm run demo` no longer adds anyone as a support admin unless told to. For the
**Support access** box to show SAHS, start it with:

```bash
cd ~/SAHS-archive-app && SUPPORT_ADMINS=catnolan@senoiahistory.com,jeremywarren@senoiahistory.com npm run demo
```

With Docker, in PowerShell before `docker compose up`:

```powershell
$env:SUPPORT_ADMINS="catnolan@senoiahistory.com,jeremywarren@senoiahistory.com"
```

## The February 2027 demonstration

Rehearse on the Dell with the command above, and follow the guide's demo-day
checklist.
