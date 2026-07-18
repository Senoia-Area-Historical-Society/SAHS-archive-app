import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'migration', 'service-account.json');
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseId: 'sahs-archives'
});

const db = getFirestore();

async function run() {
  try {
    const setupRef = db.collection('site_settings').doc('setup');
    const setupSnap = await setupRef.get();
    if (setupSnap.exists) {
      console.log("PRODUCTION_STATUS: Setup document EXISTS!", JSON.stringify(setupSnap.data(), null, 2));
    } else {
      console.log("PRODUCTION_STATUS: Setup document does NOT exist yet.");
    }
  } catch (err) {
    console.error("Failed to query production database:", err);
  }
}
run();
