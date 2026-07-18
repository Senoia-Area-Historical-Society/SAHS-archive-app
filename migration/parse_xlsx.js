// migration/parse_xlsx.js
import XLSX from 'xlsx';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = join(__dirname, '2026 Membership.xlsx');

if (!existsSync(EXCEL_PATH)) {
    console.error(`\x1b[31mError: File not found at ${EXCEL_PATH}\x1b[0m`);
    process.exit(1);
}

const workbook = XLSX.readFile(EXCEL_PATH);

// Simple parser copy to test local evaluation
function parseDates(dateVal) {
    let joinedAt = new Date().toISOString();
    let expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 1 year default

    if (typeof dateVal === 'number') {
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

const sheet = workbook.Sheets['2026 Members'];
const rawData = XLSX.utils.sheet_to_json(sheet);

console.log('--- Date Parsing Validation ---');
rawData.slice(0, 15).forEach((row, i) => {
    const rawDate = row['Date Joined:'];
    const email = row['email address'];
    const name = (row['First names'] || '') + ' ' + (row['Last names'] || '');
    if (!email) return;
    const { joinedAt, expiresAt } = parseDates(rawDate);
    console.log(`[#${i+1}] ${name.trim()}`);
    console.log(`  Raw: "${rawDate}"`);
    console.log(`  Parsed Joined:  ${new Date(joinedAt).toLocaleDateString()}`);
    console.log(`  Parsed Expires: ${new Date(expiresAt).toLocaleDateString()}`);
});
