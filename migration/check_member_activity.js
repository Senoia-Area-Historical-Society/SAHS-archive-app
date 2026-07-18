// migration/check_member_activity.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');

if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`Error: service-account.json not found in ${__dirname}`);
    process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore('sahs-archives');
const auth = admin.auth();

async function run() {
    console.log('--- Fetching Member Registry ---');
    const membersSnap = await db.collection('members').get();
    const members = [];
    const memberEmails = new Set();
    
    membersSnap.forEach(doc => {
        const data = doc.data();
        const email = (data.email || doc.id).toLowerCase().trim();
        members.push({
            id: doc.id,
            name: data.name,
            email: email,
            status: data.status,
            expiresAt: data.expiresAt,
            hasLoggedIn: false,
            lastSignInTime: null,
            createdFoldersCount: 0,
            createdNotesCount: 0,
            createdPinsCount: 0
        });
        memberEmails.add(email);
    });
    console.log(`Found ${members.length} members in the database registry.\n`);

    console.log('--- Fetching Authenticated Users ---');
    const authUsers = [];
    let pageToken = undefined;
    try {
        do {
            const listUsersResult = await auth.listUsers(1000, pageToken);
            listUsersResult.users.forEach(userRecord => {
                if (userRecord.email) {
                    authUsers.push({
                        email: userRecord.email.toLowerCase(),
                        lastSignInTime: userRecord.metadata.lastSignInTime,
                        creationTime: userRecord.metadata.creationTime
                    });
                }
            });
            pageToken = listUsersResult.pageToken;
        } while (pageToken);
        console.log(`Found ${authUsers.length} total authenticated user records in Firebase Auth.\n`);
    } catch (authErr) {
        console.warn('Warning: Could not fetch Firebase Auth users list (check service account permissions).', authErr.message);
    }

    // Map login status to members
    const authMap = new Map(authUsers.map(u => [u.email, u]));
    members.forEach(m => {
        if (authMap.has(m.email)) {
            const u = authMap.get(m.email);
            m.hasLoggedIn = true;
            m.lastSignInTime = u.lastSignInTime;
        }
    });

    console.log('--- Checking Research Workspace Activity ---');
    
    // 1. Research Folders
    try {
        const foldersSnap = await db.collection('research_folders').get();
        foldersSnap.forEach(doc => {
            const data = doc.data();
            const owner = (data.ownerEmail || '').toLowerCase().trim();
            const member = members.find(m => m.email === owner);
            if (member) {
                member.createdFoldersCount++;
            }
        });
    } catch (err) {
        console.warn('Warning: Could not read research_folders collection:', err.message);
    }

    // 2. Research Notes
    try {
        const notesSnap = await db.collection('research_notes').get();
        notesSnap.forEach(doc => {
            const data = doc.data();
            const owner = (data.ownerEmail || '').toLowerCase().trim();
            const member = members.find(m => m.email === owner);
            if (member) {
                member.createdNotesCount++;
            }
        });
    } catch (err) {
        console.warn('Warning: Could not read research_notes collection:', err.message);
    }

    // 3. Personal Pins
    try {
        const pinsSnap = await db.collection('personal_pins').get();
        pinsSnap.forEach(doc => {
            const data = doc.data();
            const owner = (data.ownerEmail || '').toLowerCase().trim();
            const member = members.find(m => m.email === owner);
            if (member) {
                member.createdPinsCount++;
            }
        });
    } catch (err) {
        console.warn('Warning: Could not read personal_pins collection:', err.message);
    }

    // Calculations
    const loggedInMembers = members.filter(m => m.hasLoggedIn);
    const activeDataMembers = members.filter(m => m.createdFoldersCount > 0 || m.createdNotesCount > 0 || m.createdPinsCount > 0);
    const fullyUsedMembers = members.filter(m => m.hasLoggedIn || m.createdFoldersCount > 0 || m.createdNotesCount > 0 || m.createdPinsCount > 0);

    console.log('==================================================');
    console.log('            MEMBERSHIP ACCOUNT USAGE REPORT       ');
    console.log('==================================================');
    console.log(`Total Members Registered:        ${members.length}`);
    console.log(`Members who Logged In (Auth):    ${loggedInMembers.length} (${members.length ? ((loggedInMembers.length / members.length) * 100).toFixed(1) : 0}%)`);
    console.log(`Members with Saved Data:         ${activeDataMembers.length} (${members.length ? ((activeDataMembers.length / members.length) * 100).toFixed(1) : 0}%)`);
    console.log(`Total Members who Used Accounts: ${fullyUsedMembers.length} (${members.length ? ((fullyUsedMembers.length / members.length) * 100).toFixed(1) : 0}%)`);
    console.log('==================================================\n');

    console.log('--- Member List & Details ---');
    members.forEach(m => {
        const statusStr = m.hasLoggedIn 
            ? `Logged In (Last: ${m.lastSignInTime ? new Date(m.lastSignInTime).toLocaleDateString() : 'Unknown'})`
            : `Never Logged In`;
        
        const dataStr = `Folders: ${m.createdFoldersCount}, Notes: ${m.createdNotesCount}, Pins: ${m.createdPinsCount}`;
        
        console.log(`- ${m.name} (${m.email})`);
        console.log(`  Status:  ${statusStr}`);
        console.log(`  Data:    ${dataStr}`);
        console.log(`  Profile: Status: ${m.status}, Expiration: ${m.expiresAt}`);
        console.log('  ---------------------------------------------');
    });
}

run().catch(console.error);
