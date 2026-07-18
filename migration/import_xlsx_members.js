// migration/import_xlsx_members.js
import XLSX from 'xlsx';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = join(__dirname, '2026 Membership.xlsx');
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');

// Helper to convert Excel serial dates or date strings
function parseDates(dateVal) {
    let joinedAt = new Date().toISOString();
    let expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 1 year default

    if (typeof dateVal === 'number') {
        // Excel serial date number
        const utc_days = Math.floor(dateVal - 25569);
        const utc_value = utc_days * 86400;
        const date = new Date(utc_value * 1000);
        joinedAt = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
        
        const expDate = new Date(date.getFullYear() + 1, date.getMonth(), date.getDate());
        expiresAt = expDate.toISOString().split('T')[0];
    } else if (typeof dateVal === 'string') {
        const dateRegex = /(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/g;
        const matches = [];
        let match;
        while ((match = dateRegex.exec(dateVal)) !== null) {
            let year = parseInt(match[3]);
            if (year < 100) year += 2000;
            const month = parseInt(match[1]) - 1;
            const day = parseInt(match[2]);
            matches.push(new Date(year, month, day));
        }

        if (matches.length >= 2) {
            // Sort to find earliest (joined) and latest (expired)
            matches.sort((a, b) => a.getTime() - b.getTime());
            joinedAt = matches[0].toISOString();
            expiresAt = matches[matches.length - 1].toISOString().split('T')[0];
        } else if (matches.length === 1) {
            joinedAt = matches[0].toISOString();
            const expDate = new Date(matches[0].getFullYear() + 1, matches[0].getMonth(), matches[0].getDate());
            expiresAt = expDate.toISOString().split('T')[0];
        }
    }

    return { joinedAt, expiresAt };
}

// Helper to detect if a record has a recurring payment
function detectIsRecurring(record) {
    const fieldsToCheck = [
        record['Date Joined:'],
        record['Notes/Date Paid:'],
        record['Date Paid'],
        record['notes:']
    ];

    for (const val of fieldsToCheck) {
        if (typeof val === 'string') {
            const lower = val.toLowerCase();
            if (lower.includes('recurring') || lower.includes('renewal') || lower.includes('auto')) {
                return true;
            }
        }
    }
    return false;
}

function extractName(record, sheetName) {
    if (sheetName === '2026 Members') {
        const first = (record['First names'] || record['First Name:'] || record['First Name'] || '').trim();
        const last = (record['Last names'] || record['Last Name:'] || record['Last Name'] || '').trim();
        if (!first && !last) {
            // Check numeric keys
            const keys = Object.keys(record);
            const firstKey = keys.find(k => k === '2');
            const lastKey = keys.find(k => k === '1');
            const fVal = firstKey ? String(record[firstKey]).trim() : '';
            const lVal = lastKey ? String(record[lastKey]).trim() : '';
            return `${fVal} ${lVal}`.trim();
        }
        return `${first} ${last}`.trim();
    }
    
    // Corporate or Patrons
    const company = (record['Company Name:'] || record['Company Name'] || '').trim();
    const first = (record['First name:'] || record['First Name:'] || '').trim();
    const last = (record['Last name:'] || record['Last Name:'] || '').trim();
    const contactName = `${first} ${last}`.trim();

    if (company && contactName) {
        return `${company} (${contactName})`;
    }
    return company || contactName || '';
}

function extractEmail(record) {
    const emailStr = record['email address'] || record['Email 1'] || record['Email 1:'] || '';
    if (!emailStr || typeof emailStr !== 'string') {
        const keys = Object.keys(record);
        const emailKey = keys.find(k => k === '8');
        if (emailKey && typeof record[emailKey] === 'string') {
            const val = record[emailKey].trim();
            if (val.includes('@')) return val.toLowerCase().trim();
        }
        return null;
    }
    const cleaned = emailStr.toLowerCase().trim();
    if (cleaned.includes('@') && cleaned.length > 3) {
        return cleaned;
    }
    return null;
}

function generatePlaceholderEmail(name) {
    if (!name) return `unknown-${Math.random().toString(36).substr(2, 9)}@sahs-member.local`;
    const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^\.|\.$)/g, '');
    return `${clean}@sahs-member.local`;
}

// Helper to detect if a row is mauve color coded (indicates lifetime memberships)
function isEmailRowMauve(sheet, email, rawRow) {
    if (!email) return false;
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    const mauveColor = 'EAD1DC';

    for (let r = range.s.r; r <= range.e.r; r++) {
        let isMatch = false;

        if (email && !email.endsWith('@sahs-member.local')) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[cellAddress];
                if (cell && typeof cell.v === 'string' && cell.v.toLowerCase().trim() === email.toLowerCase().trim()) {
                    isMatch = true;
                    break;
                }
            }
        } else if (rawRow) {
            // Match by name
            const first = String(rawRow['First names'] || rawRow['First Name:'] || rawRow['First Name'] || '').trim().toLowerCase();
            const last = String(rawRow['Last names'] || rawRow['Last Name:'] || rawRow['Last Name'] || '').trim().toLowerCase();
            let rowFirst = '';
            let rowLast = '';
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[cellAddress];
                if (cell && cell.v !== undefined) {
                    if (c === 1) rowLast = String(cell.v).trim().toLowerCase();
                    if (c === 2) rowFirst = String(cell.v).trim().toLowerCase();
                }
            }
            if (rowFirst === first && rowLast === last) {
                isMatch = true;
            }
        }

        if (isMatch) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[cellAddress];
                if (cell && cell.s) {
                    if ((cell.s.fgColor && cell.s.fgColor.rgb === mauveColor) ||
                        (cell.s.bgColor && cell.s.bgColor.rgb === mauveColor)) {
                        return true;
                    }
                }
            }
            break;
        }
    }
    return false;
}

// Helper to detect if a row is green color coded (indicates 1-year free realtor paid memberships)
function isEmailRowGreen(sheet, email, rawRow) {
    if (!email) return false;
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    const greenColor = 'D9EAD3';

    for (let r = range.s.r; r <= range.e.r; r++) {
        let isMatch = false;

        if (email && !email.endsWith('@sahs-member.local')) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[cellAddress];
                if (cell && typeof cell.v === 'string' && cell.v.toLowerCase().trim() === email.toLowerCase().trim()) {
                    isMatch = true;
                    break;
                }
            }
        } else if (rawRow) {
            // Match by name
            const first = String(rawRow['First names'] || rawRow['First Name:'] || rawRow['First Name'] || '').trim().toLowerCase();
            const last = String(rawRow['Last names'] || rawRow['Last Name:'] || rawRow['Last Name'] || '').trim().toLowerCase();
            let rowFirst = '';
            let rowLast = '';
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[cellAddress];
                if (cell && cell.v !== undefined) {
                    if (c === 1) rowLast = String(cell.v).trim().toLowerCase();
                    if (c === 2) rowFirst = String(cell.v).trim().toLowerCase();
                }
            }
            if (rowFirst === first && rowLast === last) {
                isMatch = true;
            }
        }

        if (isMatch) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[cellAddress];
                if (cell && cell.s) {
                    if ((cell.s.fgColor && cell.s.fgColor.rgb === greenColor) ||
                        (cell.s.bgColor && cell.s.bgColor.rgb === greenColor)) {
                        return true;
                    }
                }
            }
            break;
        }
    }
    return false;
}

async function run() {
    if (!existsSync(EXCEL_PATH)) {
        console.error(`\x1b[31mError: "2026 Membership.xlsx" not found in migration/ folder.\x1b[0m`);
        process.exit(1);
    }

    const workbook = XLSX.readFile(EXCEL_PATH, { cellStyles: true });
    const parsedMembers = [];
    const seenEmails = new Set();

    const sheetsToProcess = [
        { name: '2026 Members', type: 'Member' },
        { name: '2026 Corporate', type: 'Corporate' },
        { name: '2026 Patrons', type: 'Patron' }
    ];

    console.log('--- Step 1: Parsing Sheets ---');
    for (const sheetConfig of sheetsToProcess) {
        const sheet = workbook.Sheets[sheetConfig.name];
        if (!sheet) {
            console.warn(`\x1b[33mWarning: Sheet "${sheetConfig.name}" not found in Excel file.\x1b[0m`);
            continue;
        }

        const rawData = XLSX.utils.sheet_to_json(sheet);
        console.log(`Sheet "${sheetConfig.name}": Found ${rawData.length} raw rows.`);

        for (const row of rawData) {
            const name = extractName(row, sheetConfig.name);
            if (!name) {
                continue;
            }

            const lowerName = name.toLowerCase();
            const invalidKeywords = ['memberships', 'pd in', 'free membership', 'grand total', 'total', 'pink', 'mauve', 'white', 'green'];
            if (invalidKeywords.some(keyword => lowerName.includes(keyword))) {
                continue;
            }

            let email = extractEmail(row);
            if (!email) {
                email = generatePlaceholderEmail(name);
            }

            if (seenEmails.has(email)) {
                console.log(`  Skipping duplicate email: ${email} (Name: "${name}")`);
                continue;
            }

            seenEmails.add(email);

            // Parse joined/expiry dates
            const dateSource = row['Date Joined:'] || row['Notes/Date Paid:'] || row['Date Paid'] || '';
            let { joinedAt, expiresAt } = parseDates(dateSource);

            // Check for Lifetime Membership Level
            const levelVal = String(row['2026 Level'] || row['Level:'] || row['Level'] || '').toLowerCase();
            const notesVal = String(row['notes:'] || '').toLowerCase();
            let isLifetime = levelVal.includes('lifetime') || notesVal.includes('lifetime') || isEmailRowMauve(sheet, email, row);
            if (isLifetime) {
                expiresAt = 'Never';
            }

            const isRecurring = detectIsRecurring(row);
            const isFreeOneYear = isEmailRowGreen(sheet, email, row);

            const isPlaceholder = !extractEmail(row);

            parsedMembers.push({
                email,
                name,
                tier: 'Member', // App database schema tier is always 'Member'
                status: 'active',
                joinedAt,
                expiresAt,
                isRecurring,
                isFreeOneYear,
                isPlaceholder,
                _sourceSheet: sheetConfig.name
            });
        }
    }

    console.log(`\n--- Step 2: Parse Summary ---`);
    console.log(`Successfully parsed \x1b[32m${parsedMembers.length}\x1b[0m unique member records.`);

    // Print all Lifetime Members detected
    const lifetimeParsed = parsedMembers.filter(m => m.expiresAt === 'Never');
    console.log(`\nDetected \x1b[36m${lifetimeParsed.length}\x1b[0m Lifetime Members:`);
    lifetimeParsed.forEach(m => console.log(`  - ${m.name} (${m.email})`));

    // Print all 1-Year Free Members detected
    const freeOneYearParsed = parsedMembers.filter(m => m.isFreeOneYear);
    console.log(`\nDetected \x1b[32m${freeOneYearParsed.length}\x1b[0m 1-Year Free (Realtor Paid) Members:`);
    freeOneYearParsed.forEach(m => console.log(`  - ${m.name} (${m.email})`));

    // Show a preview of the first 10 members
    console.log('\nPreviewing first 10 parsed records:');
    console.log(JSON.stringify(parsedMembers.slice(0, 10), null, 2));

    const isCommit = process.argv.includes('--commit');

    if (!isCommit) {
        console.log(`\n\x1b[33m*** PREVIEW MODE ONLY ***\x1b[0m`);
        console.log(`To actually write these members to the Firestore production database:`);
        console.log(`1. Ensure you have saved your "service-account.json" inside the "migration/" folder.`);
        console.log(`2. Run the script with the --commit flag:`);
        console.log(`   \x1b[36mnode migration/import_xlsx_members.js --commit\x1b[0m\n`);
        return;
    }

    // Write to Firestore if --commit flag is provided
    if (!existsSync(SERVICE_ACCOUNT_PATH)) {
        console.error(`\x1b[31mError: service-account.json is required for writing to Firestore. Place it in the migration/ folder.\x1b[0m`);
        process.exit(1);
    }

    console.log(`\n--- Step 3: Importing to Firestore (Database: sahs-archives) ---`);
    const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    const db = getFirestore('sahs-archives');

    // Firestore batch limits transactions to 500 writes
    const batchChunks = [];
    const chunkSize = 400;
    for (let i = 0; i < parsedMembers.length; i += chunkSize) {
        batchChunks.push(parsedMembers.slice(i, i + chunkSize));
    }

    let writeCount = 0;
    for (const chunk of batchChunks) {
        const batch = db.batch();
        for (const m of chunk) {
            // Destructure sourceSheet/isPlaceholder so we don't save helper fields to db
            const { _sourceSheet, isPlaceholder, ...dbPayload } = m;
            
            let memberRef;
            if (isPlaceholder) {
                memberRef = db.collection('members').doc();
                dbPayload.email = "";
            } else {
                memberRef = db.collection('members').doc(m.email);
            }
            batch.set(memberRef, dbPayload, { merge: true });
            writeCount++;
        }
        await batch.commit();
        console.log(`  Committed batch write of ${chunk.length} members...`);
    }

    console.log(`\n\x1b[32mSuccessfully imported/updated ${writeCount} members in the sahs-archives production database!\x1b[0m\n`);
}

run().catch(err => {
    console.error('\x1b[31mFatal error during parsing or upload:\x1b[0m', err);
    process.exit(1);
});
