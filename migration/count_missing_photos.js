// count_missing_photos.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'service-account.json'), 'utf8'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = getFirestore('sahs-archives');

async function countMissingPhotos() {
  console.log('Fetching all artifacts from sahs-archives...\n');

  let allDocs = [];
  let lastDoc = null;

  // Paginate through all documents
  while (true) {
    let query = db.collection('archive_items').limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    allDocs = allDocs.concat(snap.docs);
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 500) break;
  }

  // Filter to only Artifacts in memory
  allDocs = allDocs.filter(doc => doc.data().item_type === 'Artifact');

  const total = allDocs.length;
  const missingPhoto = allDocs.filter(doc => {
    const data = doc.data();
    const hasImage = data.featured_image_url && data.featured_image_url.trim() !== '';
    const hasFiles = Array.isArray(data.file_urls) && data.file_urls.length > 0;
    return !hasImage && !hasFiles;
  });

  console.log(`Total artifacts: ${total}`);
  console.log(`Missing photos:  ${missingPhoto.length}`);
  console.log(`Have photos:     ${total - missingPhoto.length}`);
  console.log(`\n--- Artifacts Still Missing Photos ---\n`);

  missingPhoto
    .sort((a, b) => {
      const idA = parseInt(a.data().artifact_id) || 0;
      const idB = parseInt(b.data().artifact_id) || 0;
      return idA - idB;
    })
    .forEach(doc => {
      const d = doc.data();
      console.log(`${String(d.artifact_id || '?').padEnd(8)} | ${d.title}`);
    });

  console.log(`\nTotal missing: ${missingPhoto.length}`);
}

countMissingPhotos().catch(console.error);
