/**
 * Which Firebase project a script works on, and that project's archive database
 * and Storage bucket.
 *
 * The project is, in order:
 *
 *   1. `--project <id>` on the command line, the flag the Firebase CLI uses too;
 *   2. `projects.default` in .firebaserc, the project `firebase deploy` uses and
 *      scripts/check-firestore-database-target.cjs checks.
 *
 * There is no built-in default. A maintenance script run with `--prod` writes to
 * whatever project this returns, so with neither source it stops.
 *
 * The database and bucket come from that project's `functions/.env.<project id>`
 * (ARCHIVE_DATABASE, ARCHIVE_STORAGE_BUCKET), so they can never belong to a
 * different project from the one being written to. The bucket is asked for only
 * by the scripts that touch Storage.
 *
 * firebase-admin also reads GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT for itself. If
 * either is set to a different project, this refuses rather than guess which one
 * was meant.
 *
 * The resolved target is printed to stderr, so every run, dry or not, shows where
 * it is pointed before it reads or writes anything.
 *
 * Node built-ins only, like archiveDatabase.cjs.
 */

const fs = require('fs');
const path = require('path');
const { archiveDatabaseFor, envFileFor, parseEnvValue } = require('./archiveDatabase.cjs');

const ROOT = path.join(__dirname, '..', '..');

// Cloud Storage bucket names: lowercase letters, digits, dots, hyphens and
// underscores, 3–222 characters, starting and ending with a letter or digit.
const VALID_BUCKET = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

/** The `--project <id>` value in `argv`, or undefined. Throws if it has no value. */
function projectFlag(argv) {
    const i = argv.indexOf('--project');
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
        throw new Error('--project needs a Firebase project id, e.g. --project my-museum-archive');
    }
    return value;
}

/** projects.default from the repo's .firebaserc, or undefined. */
function firebasercDefault() {
    try {
        const rc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
        return (rc && rc.projects && rc.projects.default) || undefined;
    } catch {
        return undefined;
    }
}

/** The Firebase project id for this run. Throws when none is given anywhere. */
function resolveProjectId(argv = process.argv.slice(2), env = process.env) {
    const projectId = projectFlag(argv) || firebasercDefault();
    if (!projectId) {
        throw new Error(
            'No Firebase project. Pass --project <id>, or set projects.default in .firebaserc ' +
            '(`firebase use --add`).'
        );
    }
    for (const name of ['GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT']) {
        if (env[name] && env[name] !== projectId) {
            throw new Error(
                `${name} is ${env[name]}, but this run is for ${projectId}. ` +
                `Unset ${name} or pass --project ${env[name]}.`
            );
        }
    }
    return projectId;
}

/** ARCHIVE_STORAGE_BUCKET from functions/.env.<projectId>. Throws when absent. */
function archiveStorageBucketFor(projectId) {
    const file = envFileFor(projectId);
    const shown = path.relative(process.cwd(), file);
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch {
        throw new Error(`No ${shown}, so no Storage bucket for project ${projectId}.`);
    }
    const bucket = parseEnvValue(text, 'ARCHIVE_STORAGE_BUCKET');
    if (!bucket) {
        throw new Error(
            `${shown} has no ARCHIVE_STORAGE_BUCKET line. Add the project's default bucket, ` +
            `e.g. ARCHIVE_STORAGE_BUCKET=${projectId}.firebasestorage.app`
        );
    }
    if (!VALID_BUCKET.test(bucket)) {
        throw new Error(`ARCHIVE_STORAGE_BUCKET "${bucket}" in ${shown} is not a valid bucket name.`);
    }
    return bucket;
}

/**
 * { projectId, databaseId, bucket? } for this run. Pass { bucket: true } from
 * scripts that use Storage. Prints the target to stderr.
 */
function archiveProject({ bucket: needsBucket = false, argv, env } = {}) {
    const projectId = resolveProjectId(argv, env);
    const databaseId = archiveDatabaseFor(projectId);
    const bucket = needsBucket ? archiveStorageBucketFor(projectId) : undefined;
    console.error(
        `Project: ${projectId}  Database: ${databaseId}` + (bucket ? `  Bucket: ${bucket}` : '')
    );
    return { projectId, databaseId, bucket };
}

module.exports = { archiveProject, resolveProjectId, archiveStorageBucketFor };
