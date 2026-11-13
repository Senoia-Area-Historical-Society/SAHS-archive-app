/**
 * The Firestore database every trigger binds to and every read and write uses.
 *
 * Set per Firebase project in `functions/.env.<project id>` as ARCHIVE_DATABASE.
 * See scripts/lib/archiveDatabase.cjs for how the rest of the repo reads the same
 * file.
 *
 * It is a param, not a plain process.env read, because trigger options are read
 * when the CLI analyses the code, before .env values reach process.env. A param
 * goes into that analysis as a placeholder, and the CLI fills it in from the .env
 * file when it deploys or emulates. With no value it refuses to deploy (it asks,
 * and in CI it fails) instead of binding the triggers anywhere.
 *
 * No default, on purpose: a trigger bound to a database that isn't the archive's
 * never fires and never errors, so it would silently stop privacy,
 * media-visibility and role-claim syncing.
 *
 * Only trigger-wiring modules may require this. The *Rules.js modules imported by
 * src/test/ must stay import-free (see CLAUDE.md).
 */

const { defineString } = require("firebase-functions/params");
const { getFirestore } = require("firebase-admin/firestore");

/** For trigger options: `database: ARCHIVE_DATABASE`. */
const ARCHIVE_DATABASE = defineString("ARCHIVE_DATABASE", {
    description: "The Firestore database this project's archive lives in.",
});

/** The archive's Firestore instance, for use inside handlers (not at load time). */
function archiveDb() {
    const name = ARCHIVE_DATABASE.value();
    if (!name) {
        throw new Error("ARCHIVE_DATABASE is not set: add it to functions/.env.<project id>.");
    }
    return getFirestore(name);
}

module.exports = { ARCHIVE_DATABASE, archiveDb };
