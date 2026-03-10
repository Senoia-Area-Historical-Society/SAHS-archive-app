// migration/check_db.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function check() {
  const defaultDb = getFirestore();
  const namedDb = getFirestore('sahs-archives');

  console.log('Checking (default) database...');
  try {
    const defaultSnap = await defaultDb.collection('archive_items').limit(5).get();
    console.log(`(default) archive_items count (sample): ${defaultSnap.size}`);
    defaultSnap.forEach(doc => console.log(` - ${doc.id}: ${doc.data().title}`));
  } catch (e) {
    console.error('Error accessing (default) database:', e.message);
  }

  console.log('\nChecking sahs-archives database...');
  try {
    const namedSnap = await namedDb.collection('archive_items').limit(5).get();
    console.log(`sahs-archives archive_items count (sample): ${namedSnap.size}`);
    namedSnap.forEach(doc => console.log(` - ${doc.id}: ${doc.data().title}`));
  } catch (e) {
    console.error('Error accessing sahs-archives database:', e.message);
  }
}

check().catch(console.error);
