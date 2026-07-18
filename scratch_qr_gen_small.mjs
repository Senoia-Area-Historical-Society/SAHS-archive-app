import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import fs from "fs";

const firebaseConfig = {
    projectId: "sahs-archives",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "sahs-archives");

const targetIds = ["1096", "1113", "1145", "1178", "1208", "1209", "1218", "1219", "1387", "1396", "1402", "1425"];

async function main() {
    console.log("Fetching documents...");
    const snapshot = await getDocs(collection(db, "archive_items"));
    const items = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.artifact_id && targetIds.includes(data.artifact_id.toString())) {
            items.push({ id: doc.id, ...data });
        }
    });
    
    // Sort items by artifact_id or the original requested order
    // Let's keep them in the requested order:
    items.sort((a, b) => {
        return targetIds.indexOf(a.artifact_id.toString()) - targetIds.indexOf(b.artifact_id.toString());
    });
    
    console.log(`Found ${items.length} items out of ${targetIds.length} requested.`);
    
    const doc = new PDFDocument({ margin: 36, size: 'letter' });
    doc.pipe(fs.createWriteStream('artifact_qrs_small_batch2.pdf'));
    
    const boxSize = 108; // 1.5 inches at 72 DPI
    const margin = 18;   // 0.25 inch space between boxes
    
    let x = 36;
    let y = 36;
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const url = `https://sahs-archives.web.app/items/${item.id}`;
        const label = item.title || "No Title";
        const subLabel = item.artifact_id || item.id;
        
        try {
            const qrBuffer = await QRCode.toBuffer(url, { width: 72, margin: 0 });
            
            if (y + boxSize > doc.page.height - 36) {
                doc.addPage();
                x = 36;
                y = 36;
            }
            
            // Draw box border
            doc.rect(x, y, boxSize, boxSize).lineWidth(0.5).stroke('#999999');
            
            // Image
            const imgX = x + (boxSize - 72) / 2;
            const imgY = y + 5;
            doc.image(qrBuffer, imgX, imgY, { width: 72, height: 72 });
            
            // H1 (label)
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor('black');
            doc.text(label, x + 5, y + 80, { width: boxSize - 10, height: 10, ellipsis: true, align: 'center' });
            
            // P (subLabel)
            doc.font('Courier').fontSize(6).fillColor('#666666');
            doc.text(subLabel, x + 5, y + 92, { width: boxSize - 10, height: 8, ellipsis: true, align: 'center' });
            
            x += boxSize + margin;
            if (x + boxSize > doc.page.width - 36) {
                x = 36;
                y += boxSize + margin;
            }
        } catch (e) {
            console.error(`Failed to generate QR for ${item.artifact_id}:`, e);
        }
    }
    
    doc.end();
    console.log("PDF generated successfully: artifact_qrs_small.pdf");
}

main().catch(console.error);
