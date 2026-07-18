import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize firebase-admin with the named database ID
admin.initializeApp({
  projectId: 'sahs-archives',
  databaseId: 'sahs-archives'
});

const db = getFirestore();

async function run() {
  try {
    console.log("Attempting to connect to sahs-archives database...");
    
    console.log("Fetching collections in database...");
    const collections = await db.listCollections();
    console.log("Collections:", collections.map(c => c.id));
    
    const foldersRef = db.collection('research_folders');
    const snap = await foldersRef.limit(5).get();
    console.log(`Found ${snap.size} folders.`);
    snap.forEach(doc => {
      console.log(`Folder ID: ${doc.id}`);
      console.log("Data:", JSON.stringify(doc.data(), null, 2));
    });
  } catch (err) {
    console.error("Diagnostic failed:", err);
  }
}

run();
