/**
 * Which Firestore database an install keeps its archive in.
 *
 * The one place this is written down is `functions/.env.<project id>`:
 *
 *   ARCHIVE_DATABASE=sahs-archives
 *
 * The Firebase CLI loads that file into the Cloud Functions, both when it deploys
 * them (so the triggers bind to it) and in the emulator. Everything else reads the
 * same file through this module: the web build (vite.config.ts), the deploy-time
 * and maintenance scripts, the Docker demo, and the deploy check that compares it
 * with firebase.json.
 *
 * There is deliberately no default. A Firestore trigger bound to the wrong
 * database never fires and never errors, so a missing value would quietly stop
 * the privacy and role-claim triggers. Every caller fails instead.
 *
 * Must stay free of anything but Node built-ins: vite.config.ts and the Docker
 * image load it before any dependency is installed.
 */

const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.join(__dirname, '..', '..', 'functions');

// Firestore database ids: lowercase letters, digits and hyphens, 4–63 characters,
// or the literal "(default)".
const VALID_DATABASE = /^(\(default\)|[a-z][a-z0-9-]{2,61}[a-z0-9])$/;

function envFileFor(projectId) {
    return path.join(FUNCTIONS_DIR, `.env.${projectId}`);
}

/** The ARCHIVE_DATABASE line of a dotenv file's text, or undefined. */
function parseArchiveDatabase(text) {
    for (const line of text.split(/\r?\n/)) {
        const match = /^\s*ARCHIVE_DATABASE\s*=\s*(.*?)\s*$/.exec(line);
        if (match) return match[1].replace(/^(['"])(.*)\1$/, '$2');
    }
    return undefined;
}

/**
 * The archive database for a Firebase project id. Throws, naming the file to
 * create, when the project has none.
 */
function archiveDatabaseFor(projectId) {
    if (!projectId) {
        throw new Error('No Firebase project id, so no way to find its archive database.');
    }
    const file = envFileFor(projectId);
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch {
        throw new Error(
            `No ${path.relative(process.cwd(), file)}. Create it with one line naming the ` +
            `Firestore database this project's archive uses, e.g. ARCHIVE_DATABASE=archive`
        );
    }
    const database = parseArchiveDatabase(text);
    if (!database) {
        throw new Error(`${path.relative(process.cwd(), file)} has no ARCHIVE_DATABASE line.`);
    }
    if (!VALID_DATABASE.test(database)) {
        throw new Error(`ARCHIVE_DATABASE "${database}" in ${file} is not a valid Firestore database id.`);
    }
    return database;
}

module.exports = { archiveDatabaseFor, parseArchiveDatabase, envFileFor };
