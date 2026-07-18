// migration/check_mail.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
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

  console.log('--- Checking (default) database ---');
  try {
    const defaultSnap = await defaultDb.collection('mail').get();
    console.log(`Found ${defaultSnap.size} total documents in (default) 'mail' collection.`);
    const docs = [];
    defaultSnap.forEach(doc => {
      docs.push({ id: doc.id, data: doc.data(), createTime: doc.createTime });
    });
    docs.sort((a, b) => b.createTime.toMillis() - a.createTime.toMillis());
    const latest = docs.slice(0, 5);
    if (latest.length > 0) {
      console.log('LATEST DEFAULT MAIL DOCUMENT DETAIL:');
      console.log(JSON.stringify(latest[0].data, null, 2));
    }
    latest.forEach(item => {
      console.log(`[default] ID: ${item.id} | Created: ${item.createTime.toDate().toISOString()}`);
      console.log(`  To: ${item.data.to} | Owner: ${item.data.ownerEmail || 'MISSING'}`);
      console.log(`  Subject: ${item.data.message?.subject || 'N/A'}`);
      console.log(`  State: ${JSON.stringify(item.data.delivery || 'N/A')}`);
    });
  } catch (e) {
    console.error('Error querying (default) mail collection:', e.message);
  }

  console.log('\n--- Checking sahs-archives database ---');
  try {
    const namedSnap = await namedDb.collection('mail').get();
    console.log(`Found ${namedSnap.size} total documents in sahs-archives 'mail' collection.`);
    const docs = [];
    namedSnap.forEach(doc => {
      docs.push({ id: doc.id, data: doc.data(), createTime: doc.createTime });
    });
    docs.sort((a, b) => b.createTime.toMillis() - a.createTime.toMillis());
    const latest = docs.slice(0, 5);
    latest.forEach(item => {
      console.log(`[sahs-archives] ID: ${item.id} | Created: ${item.createTime.toDate().toISOString()}`);
      console.log(`  To: ${item.data.to} | Owner: ${item.data.ownerEmail || 'MISSING'}`);
      console.log(`  Subject: ${item.data.message?.subject || 'N/A'}`);
      console.log(`  State: ${JSON.stringify(item.data.delivery || 'N/A')}`);
    });
  } catch (e) {
    console.error('Error querying sahs-archives mail collection:', e.message);
  }
}

check().catch(console.error);
