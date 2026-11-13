#!/usr/bin/env node
/**
 * The container's entry point: starts the emulators, writes the setup and support
 * lists, and prints where to go. scripts/demo.cjs does the same job on a developer's
 * machine; this one has no Vite (the image serves the built app from the hosting
 * emulator), no port checks (Docker owns the ports), and a `demo-` project.
 *
 * Environment:
 *   DIRECTOR_EMAIL     who may run first-time setup
 *   SUPPORT_ADMINS     comma-separated; empty means nobody outside the museum.
 *                      Deliberately empty by default: a museum's trial should not
 *                      quietly make anyone else its admins.
 *   ARCHIVE_DATA_DIR   keep data here between runs (compose.yaml sets it). Unset,
 *                      every run starts blank.
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT = 'demo-archive';
const DIRECTOR = (process.env.DIRECTOR_EMAIL || '').trim().toLowerCase();
const SUPPORT = (process.env.SUPPORT_ADMINS || '').split(',').map((e) => e.trim()).filter(Boolean);
const DATA_DIR = process.env.ARCHIVE_DATA_DIR;

if (!DIRECTOR) {
    console.error('Set DIRECTOR_EMAIL to the address that will run first-time setup.');
    process.exit(1);
}

function buildEmulatorArgs() {
    const args = ['emulators:start', '--project', PROJECT, '--only', 'auth,firestore,storage,functions,hosting'];
    if (DATA_DIR) {
        // A subdirectory, because the CLI replaces the export directory when it
        // saves, and the top of a Docker volume is a mount point it cannot replace.
        const exportDir = path.join(DATA_DIR, 'export');
        args.push(`--export-on-exit=${exportDir}`);
        // Importing a directory with no export in it is an error, and that is what
        // a brand-new volume is.
        if (fs.existsSync(path.join(exportDir, 'firebase-export-metadata.json'))) {
            args.push(`--import=${exportDir}`);
        }
    }
    return args;
}

/*
 * The CLI's export and import cover Auth and Storage but only the (default)
 * Firestore database, and the app's data lives in the named one. Left to the CLI,
 * a restart would keep every account and file and lose the whole archive. The
 * emulator's own API does accept a database, so Firestore is saved and restored
 * here. The API is undocumented; the emulator version is fixed by the image, and
 * the save-and-restore check in docs/DOCKER.md is what to rerun after upgrading it.
 */
const FIRESTORE_API = `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}`;
// The image's working directory mirrors the repo: scripts/ and functions/ sit beside this file.
const { archiveDatabaseFor } = require('./scripts/lib/archiveDatabase.cjs');
const FIRESTORE_DATABASE = `projects/${PROJECT}/databases/${archiveDatabaseFor(PROJECT)}`;
const firestoreDir = () => path.join(DATA_DIR, 'firestore');
const firestoreMetadata = (dir) => path.join(dir, 'archive', 'archive.overall_export_metadata');

async function firestoreRequest(action, body) {
    const response = await fetch(`${FIRESTORE_API}:${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ database: FIRESTORE_DATABASE, ...body }),
    });
    if (!response.ok) {
        throw new Error(`Firestore ${action} failed (${response.status}): ${await response.text()}`);
    }
}

async function restoreFirestore() {
    if (!fs.existsSync(firestoreMetadata(firestoreDir()))) return;
    await firestoreRequest('import', { export_directory: firestoreMetadata(firestoreDir()) });
}

/** Writes beside the last good copy and swaps at the end, so a failure leaves it intact. */
async function saveFirestore() {
    const next = `${firestoreDir()}.next`;
    fs.rmSync(next, { recursive: true, force: true });
    fs.mkdirSync(next, { recursive: true });
    await firestoreRequest('export', { export_directory: next, export_name: 'archive' });
    fs.rmSync(firestoreDir(), { recursive: true, force: true });
    fs.renameSync(next, firestoreDir());
}

function seed(script, args) {
    const result = spawnSync(
        process.execPath,
        [path.join('scripts', script), ...args, '--emulator', '--project', PROJECT],
        { encoding: 'utf8' },
    );
    if (result.status !== 0) {
        throw new Error(`${script} failed:\n${result.stdout}${result.stderr}`);
    }
}

// The binary itself, not `npx firebase`: npx does not pass SIGINT on, so the CLI
// would never save the export and Docker would end up killing it with the data unsaved.
const emulators = spawn(path.join('node_modules', '.bin', 'firebase'), buildEmulatorArgs(), {
    stdio: ['ignore', 'pipe', 'pipe'],
});

// True once any saved Firestore data is back in the emulator. Until then saving is
// off: the emulator is still empty, and a save would replace the real copy with that.
let safeToSave = false;
let stopping = false;

async function stop() {
    if (stopping) return;
    stopping = true;
    if (DATA_DIR && safeToSave) {
        console.log('\nSaving the archive and stopping…');
        try {
            await saveFirestore();
        } catch (err) {
            console.error(`Could not save the archive's database; the last saved copy is unchanged.\n${err.message}`);
        }
    } else {
        console.log('\nStopping…');
    }
    // SIGINT is what makes the CLI save Auth and Storage and shut down cleanly; this
    // process then exits when the CLI does.
    emulators.kill('SIGINT');
}

// Ctrl+C and `docker stop`.
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

emulators.once('exit', (code) => process.exit(code ?? 1));

let ready = false;
function onOutput(stream) {
    return (chunk) => {
        stream.write(chunk);
        if (!ready && chunk.toString().includes('All emulators ready')) {
            ready = true;
            onReady();
        }
    };
}
emulators.stdout.on('data', onOutput(process.stdout));
emulators.stderr.on('data', onOutput(process.stderr));

async function onReady() {
    try {
        if (DATA_DIR) await restoreFirestore();
        safeToSave = true;
        seed('set-setup-admins.cjs', [DIRECTOR]);
        seed('set-support-admins.cjs', SUPPORT.length ? SUPPORT : ['--none']);
    } catch (err) {
        console.error(err.message);
        stop();
        return;
    }
    console.log(`
  ┌───────────────────────────────────────────────────────────────┐
     The demo archive is ready.

     Open:        http://localhost:5174
     Sign in as:  ${DIRECTOR}
                  (choose "Add new account" in the sign-in window)

     Behind the scenes: http://localhost:4000

     ${DATA_DIR ? 'Your archive is saved when you stop this cleanly.' : 'This archive is blank each run and is not saved.'}
     For trying the software only — it has no real sign-in security.
  └───────────────────────────────────────────────────────────────┘
`);
}
