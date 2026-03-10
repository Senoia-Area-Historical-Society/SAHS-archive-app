// migration/migrate.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');
const ARTIFACTS_JSON_PATH = join(__dirname, 'artifacts.json');
const ASSETS_DIR = join(__dirname, 'assets');

function safeJsonParse(filePath) {
  let content = readFileSync(filePath, 'utf8');
  // Strip UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return JSON.parse(content);
}

if (!existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Error: migration/service-account.json not found.');
  process.exit(1);
}

if (!existsSync(ARTIFACTS_JSON_PATH)) {
  console.error('Error: migration/artifacts.json not found. Run extract_artifacts.ps1 first.');
  process.exit(1);
}

const serviceAccount = safeJsonParse(SERVICE_ACCOUNT_PATH);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
});

// Explicitly target the 'sahs-archives' named database
const db = getFirestore('sahs-archives');
const bucket = admin.storage().bucket();

async function migrate() {
  let artifacts;
  try {
    artifacts = safeJsonParse(ARTIFACTS_JSON_PATH);
  } catch (e) {
    console.error('Failed to parse artifacts.json:', e.message);
    process.exit(1);
  }
  
  console.log(`Starting migration of ${artifacts.length} artifacts to 'sahs-archives' database...`);

  for (const item of artifacts) {
    try {
      console.log(`Processing: ${item.title} (ID: ${item.access_id})`);
      
      let file_urls = [];
      for (const fileName of (item.local_attachments || [])) {
        const filePath = join(ASSETS_DIR, fileName);
        if (existsSync(filePath)) {
          const destination = `archive_media/${Date.now()}_${fileName}`;
          await bucket.upload(filePath, {
            destination: destination,
            metadata: { contentType: 'image/jpeg' }
          });
          
          const file = bucket.file(destination);
          const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
          });
          file_urls.push(url);
        }
      }

      const archiveItem = {
        item_type: 'Artifact',
        title: item.title || 'Untitled Artifact',
        description: item.description || '',
        date: item.date || '',
        creator: item.creator || '',
        donor: item.donor || '',
        museum_location: item.museum_location || '',
        artifact_type: item.artifact_type || '',
        tags: item.artifact_type ? [item.artifact_type.toLowerCase()] : [],
        file_urls: file_urls,
        featured_image_url: file_urls.length > 0 ? file_urls[0] : null,
        created_at: new Date().toISOString(),
        archive_reference: `ACCESS-${item.access_id}`,
        artifact_id: item.access_id.toString(),
        notes: item.notes || ''
      };

      await db.collection('archive_items').add(archiveItem);
      console.log(`✅ Migrated: ${item.title}`);
    } catch (error) {
      console.error(`❌ Failed to migrate ${item.title}:`, error.message);
    }
  }
  console.log('Migration complete!');
}

migrate().catch(console.error);
