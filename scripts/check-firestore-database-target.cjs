#!/usr/bin/env node
// Guards against firebase.json deploying rules and indexes to a Firestore database
// other than the archive's own.
//
// Incident: this file's firestore config listed "(default)" (another app's database
// in the same project) alongside this app's own named database. Every deploy from this repo
// silently pushed this app's rules/indexes to that database too, wiping out
// the other app's own rules.
//
// The archive's database is named in functions/.env.<project id> (see
// scripts/lib/archiveDatabase.cjs), which is also what the Cloud Functions'
// triggers and the web build use. Each firebase.json must target that database and
// nothing else, so rules, triggers and app can never point at different databases.
//
//   firebase.json         → the .firebaserc default project (production)
//   docker/firebase.json  → the Docker demo's project, demo-archive

const fs = require('fs');
const path = require('path');
const { archiveDatabaseFor } = require('./lib/archiveDatabase.cjs');

const root = path.join(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

function targetedDatabases(firebaseJsonFile) {
  const firestoreConfig = readJson(firebaseJsonFile).firestore;
  const entries = Array.isArray(firestoreConfig)
    ? firestoreConfig
    : firestoreConfig
    ? [firestoreConfig]
    : [];
  return entries.map((entry) => entry.database || '(default)');
}

const checks = [
  { file: 'firebase.json', project: readJson('.firebaserc').projects.default },
  { file: 'docker/firebase.json', project: 'demo-archive' },
];

let failed = false;
for (const { file, project } of checks) {
  let expected;
  try {
    expected = archiveDatabaseFor(project);
  } catch (error) {
    console.error(`${file}: ${error.message}`);
    failed = true;
    continue;
  }
  const targeted = targetedDatabases(file);
  if (targeted.length !== 1 || targeted[0] !== expected) {
    console.error(
      `${file} targets Firestore database(s) [${targeted.join(', ') || 'none'}], but project ` +
        `${project}'s archive database is "${expected}" (functions/.env.${project}).\n` +
        `It must list exactly that one. A stray entry deploys this app's rules and indexes to ` +
        `another app's database; a mismatch leaves the triggers and the rules on different databases.`
    );
    failed = true;
    continue;
  }
  console.log(`OK — ${file} targets only "${expected}", project ${project}'s archive database.`);
}

process.exit(failed ? 1 : 0);
