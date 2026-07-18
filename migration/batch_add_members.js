// migration/batch_add_members.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');
const MEMBERS_JSON_PATH = join(__dirname, 'members.json');

// 1. Template Generator if members.json doesn't exist
if (!existsSync(MEMBERS_JSON_PATH)) {
    const template = [
        {
            name: "Jane Doe",
            email: "jane.doe@example.com",
            isLifetime: false,
            isRecurring: true,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 1 year from now
        },
        {
            name: "John Smith",
            email: "john.smith@example.com",
            isLifetime: true,
            isRecurring: false,
            expiresAt: "Never"
        }
    ];
    writeFileSync(MEMBERS_JSON_PATH, JSON.stringify(template, null, 2));
    console.log(`\x1b[33mCreated template members file at: ${MEMBERS_JSON_PATH}\x1b[0m`);
    console.log(`Please open this file, add your membership list, and run this script again.\n`);
}

// 2. Check for service-account.json
if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`\x1b[31mError: service-account.json not found in ${__dirname}\x1b[0m`);
    console.log(`\nTo run this script:`);
    console.log(`1. Go to the Firebase Console -> Project Settings -> Service Accounts.`);
    console.log(`2. Click "Generate new private key".`);
    console.log(`3. Save the downloaded JSON file as "service-account.json" inside the "migration/" folder.`);
    console.log(`4. Run this script again.\n`);
    process.exit(1);
}

// 3. Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore('sahs-archives');

async function importMembers() {
    console.log(`Reading members list from: ${MEMBERS_JSON_PATH}...`);
    const membersList = JSON.parse(readFileSync(MEMBERS_JSON_PATH, 'utf8'));

    if (!Array.isArray(membersList) || membersList.length === 0) {
        console.error('\x1b[31mError: members.json must contain a non-empty array of members.\x1b[0m');
        process.exit(1);
    }

    console.log(`Found ${membersList.length} members to import/update.`);
    console.log('Writing to Firestore (database: sahs-archives)...');

    const batch = db.batch();
    const joinedAt = new Date().toISOString();
    let count = 0;

    for (const member of membersList) {
        const email = (member.email || '').toLowerCase().trim();
        const name = (member.name || '').trim();

        if (!email || !name) {
            console.warn(`\x1b[33mWarning: Skipping invalid entry (missing name or email): ${JSON.stringify(member)}\x1b[0m`);
            continue;
        }

        const expiresAt = member.isLifetime === true ? 'Never' : (member.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

        const memberRef = db.collection('members').doc(email);
        batch.set(memberRef, {
            email,
            name,
            tier: 'Member',
            status: 'active',
            joinedAt,
            expiresAt,
            isRecurring: member.isRecurring === true
        }, { merge: true });

        count++;
    }

    if (count > 0) {
        await batch.commit();
        console.log(`\x1b[32mSuccessfully imported/updated ${count} member(s) in "sahs-archives"!\x1b[0m`);
    } else {
        console.log('No members were written.');
    }
}

importMembers().catch(err => {
    console.error('\x1b[31mFatal error during import:\x1b[0m', err);
    process.exit(1);
});
