// artifacts_with_photos_missing_locations.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'service-account.json'), 'utf8'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = getFirestore('sahs-archives');

async function findArtifactsWithPhotosNoLocation() {
  console.log('Fetching all artifacts from sahs-archives...\n');

  let allDocs = [];
  let lastDoc = null;

  while (true) {
    let query = db.collection('archive_items').limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    allDocs = allDocs.concat(snap.docs);
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 500) break;
  }

  // Filter to artifacts only
  const artifacts = allDocs.filter(doc => {
    const type = (doc.data().item_type || '').trim().toLowerCase();
    return type === 'artifact';
  });

  // Find ones WITH photos but WITHOUT a location
  const results = artifacts.filter(doc => {
    const data = doc.data();
    const hasImage = !!(data.featured_image_url?.trim()) || (Array.isArray(data.file_urls) && data.file_urls.length > 0);
    const hasLocation = !!(data.museum_location_id || (Array.isArray(data.museum_location_ids) && data.museum_location_ids.length > 0));
    return hasImage && !hasLocation;
  });

  // Sort by artifact_id numerically
  results.sort((a, b) => {
    const idA = parseInt(a.data().artifact_id) || 0;
    const idB = parseInt(b.data().artifact_id) || 0;
    return idA - idB;
  });

  console.log(`Total artifacts:              ${artifacts.length}`);
  console.log(`Have photo, missing location: ${results.length}\n`);
  console.log('--- Artifacts With Photos But Missing Locations ---\n');

  results.forEach(doc => {
    const d = doc.data();
    console.log(`${String(d.artifact_id || '?').padEnd(8)} | ${d.title}`);
  });

  console.log(`\nTotal: ${results.length}`);
}

findArtifactsWithPhotosNoLocation().catch(console.error);
