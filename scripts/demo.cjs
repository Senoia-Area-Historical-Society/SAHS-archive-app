#!/usr/bin/env node
/**
 * Runs a blank archive on this machine, for demos and rehearsals:
 *
 *   npm run demo
 *   npm run demo -- --director someone@example.org
 *
 * It starts the Firebase emulators (sign-in, database, file storage and Cloud
 * Functions), puts the director on the setup list and the support admins on the
 * support list, starts the app pointed at the emulators, and prints the address
 * to open. Ctrl+C stops everything.
 *
 * Every run starts empty — the emulators keep nothing between runs — so running
 * it again is how you reset for the next rehearsal.
 *
 * Nothing here can reach the live archive: the app runs with
 * VITE_USE_FIREBASE_EMULATOR=true, which connects every service to the emulators
 * (src/lib/firebase.ts), and the lists are written with --emulator. All four
 * emulators must be running for that to hold, since a Cloud Function calling a
 * service with no emulator would reach production — which is why this starts
 * them together and stops everything if any of them exits.
 *
 * Needs Java (for the emulators) and costs nothing.
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'node_modules', '.bin');
const APP_PORT = 5174;
const PORTS = { app: APP_PORT, firestore: 8080, auth: 9099, storage: 9199, functions: 5001, 'emulator UI': 4000 };
const SUPPORT_ADMINS = ['catnolan@senoiahistory.com', 'jeremywarren@senoiahistory.com'];
const LOG = path.join(os.tmpdir(), 'archive-demo-emulators.log');

const args = process.argv.slice(2);
const directorFlag = args.indexOf('--director');
const DIRECTOR = (directorFlag === -1 ? 'director@examplemuseum.org' : args[directorFlag + 1] || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(DIRECTOR)) {
    console.error('Usage: npm run demo -- [--director <email>]');
    process.exit(1);
}

const children = [];
let stopping = false;

function stopAll(code) {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
        if (child.exitCode === null) child.kill('SIGINT');
    }
    // The emulators take a moment to shut down cleanly.
    setTimeout(() => process.exit(code), 4000).unref();
}
// Ctrl+C, and also closing the terminal window or being stopped some other way —
// otherwise the emulators would outlive the demo and hold its ports.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
        console.log('\nStopping the demo…');
        stopAll(0);
    });
}

function portInUse(port) {
    return new Promise((resolve) => {
        const socket = net.connect({ port, host: '127.0.0.1' });
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => resolve(false));
    });
}

/** Starts a long-running child and resolves once `readyText` appears in its output. */
function startUntil(label, command, commandArgs, env, readyText, logStream) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, commandArgs, { cwd: ROOT, env: { ...process.env, ...env } });
        children.push(child);
        let ready = false;
        const onData = (chunk) => {
            if (logStream) logStream.write(chunk);
            if (!ready && chunk.toString().includes(readyText)) {
                ready = true;
                resolve(child);
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.once('exit', (code) => {
            if (!ready) {
                reject(new Error(`${label} exited before it was ready (code ${code}).`));
            } else if (!stopping) {
                console.error(`\n${label} stopped unexpectedly (code ${code}) — stopping the demo.`);
                if (logStream) console.error(`Its log is at ${LOG}`);
                stopAll(1);
            }
        });
    });
}

function seed(script, emails) {
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...emails, '--emulator'], {
        cwd: ROOT,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`${script} failed:\n${result.stdout}${result.stderr}`);
    }
}

async function main() {
    const busy = [];
    for (const [name, port] of Object.entries(PORTS)) {
        if (await portInUse(port)) busy.push(`${name} (port ${port})`);
    }
    if (busy.length) {
        console.error(`These ports are already in use: ${busy.join(', ')}.`);
        console.error('Another demo or emulator is probably still running. Stop it with Ctrl+C in its window, then try again.');
        process.exit(1);
    }

    console.log('Starting a blank archive — this takes about 30 seconds…');
    const log = fs.createWriteStream(LOG);
    await startUntil(
        'The Firebase emulators',
        path.join(BIN, 'firebase'),
        ['emulators:start', '--only', 'auth,firestore,storage,functions', '--project', 'sahs-archives'],
        {},
        'All emulators ready',
        log,
    );

    seed('set-setup-admins.cjs', [DIRECTOR]);
    seed('set-support-admins.cjs', SUPPORT_ADMINS);

    await startUntil(
        'The app',
        path.join(BIN, 'vite'),
        ['--port', String(APP_PORT), '--strictPort'],
        { VITE_USE_FIREBASE_EMULATOR: 'true' },
        'Local:',
    );

    console.log(`
  ┌───────────────────────────────────────────────────────────────┐
     The demo archive is ready.

     Open:            http://localhost:${APP_PORT}
     Sign in as:      ${DIRECTOR}
                      (choose "Add new account" in the sign-in window)
     Behind the scenes: http://localhost:4000

     Everything is local and starts empty; nothing touches the
     live archive. Press Ctrl+C here to stop. Run it again for a
     fresh, empty archive.
  └───────────────────────────────────────────────────────────────┘
`);
}

main().catch((err) => {
    console.error(err.message);
    console.error(`The emulator log is at ${LOG}`);
    stopAll(1);
});
