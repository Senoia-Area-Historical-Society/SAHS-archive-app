// migration/debug_xlsx_counts.js
import XLSX from 'xlsx';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = join(__dirname, '2026 Membership.xlsx');

if (!existsSync(EXCEL_PATH)) {
    console.error(`Error: File not found at ${EXCEL_PATH}`);
    process.exit(1);
}

const workbook = XLSX.readFile(EXCEL_PATH);
const sheetNames = workbook.SheetNames;

console.log('=== Spreadsheet Count Analysis ===\n');

let totalRawRowsAllSheets = 0;
let totalProcessed = 0;
const seenEmails = new Set();
const missingEmails = [];
const duplicateEmails = [];

for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    const rawData = XLSX.utils.sheet_to_json(sheet);
    totalRawRowsAllSheets += rawData.length;

    console.log(`Sheet "${name}":`);
    console.log(`  Raw rows: ${rawData.length}`);

    let missingInSheet = 0;
    let duplicateInSheet = 0;
    let successInSheet = 0;

    for (const [index, row] of rawData.entries()) {
        const emailField = row['email address'] || row['Email 1'] || row['Email 1:'] || row['Email'] || row['email'] || '';
        const nameField = (row['First names'] || row['Company Name:'] || row['Company Name'] || '').trim() + ' ' + (row['Last names'] || '').trim();
        const cleanedName = nameField.trim() || 'Unnamed';

        if (!emailField || typeof emailField !== 'string' || !emailField.includes('@')) {
            missingInSheet++;
            missingEmails.push({ sheet: name, rowNum: index + 2, name: cleanedName, value: emailField });
            continue;
        }

        const email = emailField.toLowerCase().trim();
        if (seenEmails.has(email)) {
            duplicateInSheet++;
            duplicateEmails.push({ sheet: name, rowNum: index + 2, name: cleanedName, email });
            continue;
        }

        seenEmails.add(email);
        successInSheet++;
        totalProcessed++;
    }

    console.log(`  └─ Success: ${successInSheet}, Missing Email: ${missingInSheet}, Duplicates: ${duplicateInSheet}`);
}

console.log(`\n================ SUMMARY ================`);
console.log(`Total raw rows across ALL sheets: ${totalRawRowsAllSheets}`);
console.log(`Total unique members successfully parsed: ${totalProcessed}`);
console.log(`Total entries skipped due to missing/invalid email: ${missingEmails.length}`);
console.log(`Total entries skipped as duplicates: ${duplicateEmails.length}`);

if (missingEmails.length > 0) {
    console.log(`\n--- Sample of Missing Emails (first 10) ---`);
    missingEmails.slice(0, 10).forEach(item => {
        console.log(`  [Sheet: ${item.sheet}, Row: ${item.rowNum}] Name: "${item.name}" (Email field: "${item.value}")`);
    });
}

if (duplicateEmails.length > 0) {
    console.log(`\n--- Sample of Duplicate Emails (first 10) ---`);
    duplicateEmails.slice(0, 10).forEach(item => {
        console.log(`  [Sheet: ${item.sheet}, Row: ${item.rowNum}] Name: "${item.name}" (Email: ${item.email})`);
    });
}
