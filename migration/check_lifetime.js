// migration/check_lifetime.js
import XLSX from 'xlsx';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = join(__dirname, '2026 Membership.xlsx');

if (!existsSync(EXCEL_PATH)) {
    console.error('File not found');
    process.exit(1);
}

const workbook = XLSX.readFile(EXCEL_PATH);
const sheets = ['2026 Members', '2026 Corporate', '2026 Patrons'];

console.log('Scanning 2026 sheets for "life" or "lifetime"...');

for (const name of sheets) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rawData = XLSX.utils.sheet_to_json(sheet);
    
    rawData.forEach((row, i) => {
        const rowStr = JSON.stringify(row).toLowerCase();
        if (rowStr.includes('life')) {
            console.log(`\nFound match in sheet "${name}", row ${i+2}:`);
            console.log(JSON.stringify(row, null, 2));
        }
    });
}
