// migration/test_send_mail.js
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

async function send() {
  const defaultDb = getFirestore();
  
  console.log('Writing test mail document to (default) database...');
  try {
    const docRef = await defaultDb.collection('mail').add({
      to: 'cathrinennolan@gmail.com',
      from: 'Senoia Area Historical Society <noreply@senoiahistory.com>',
      ownerEmail: 'catnolan@senoiahistory.com',
      message: {
        subject: 'TEST: SAHS Archives Folder Sharing Route Fix',
        text: 'This is a test email to verify that folder sharing email routing works.'
      }
    });
    console.log(`Successfully wrote document ID: ${docRef.id}`);
    
    console.log('Waiting 6 seconds for Trigger Email extension to process...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    const docSnap = await docRef.get();
    const data = docSnap.data();
    console.log('\n--- Resulting Document Data ---');
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error during test execution:', e);
  }
}

send().catch(console.error);
