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

const targetIds = ["429", "363", "365", "366", "379", "402", "409", "415", "490", "547", "563", "567", "568", "570", "617", "630", "633", "208", "233", "231", "262", "320", "359"];

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
    
    console.log(`Found ${items.length} items out of ${targetIds.length} requested.`);
    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(fs.createWriteStream('artifact_qrs.pdf'));
    
    let x = 50;
    let y = 50;
    const qrSize = 150;
    const margin = 20;
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const url = `https://sahs-archives.web.app/items/${item.id}`;
        
        try {
            const qrBuffer = await QRCode.toBuffer(url, { width: qrSize, margin: 1 });
            
            if (y + qrSize + 40 > doc.page.height - 50) {
                if (x + qrSize + margin > doc.page.width - 200) {
                    doc.addPage();
                    x = 50;
                    y = 50;
                } else {
                    x += qrSize + margin;
                    y = 50;
                }
            }
            
            doc.image(qrBuffer, x, y, { width: qrSize });
            
            doc.fontSize(10);
            doc.text(item.title ? item.title.substring(0, 30) : "No Title", x, y + qrSize + 5, { width: qrSize, align: 'center' });
            doc.fontSize(8);
            doc.text(`ID: ${item.artifact_id}`, x, y + qrSize + 18, { width: qrSize, align: 'center' });
            
            y += qrSize + 50;
        } catch (e) {
            console.error(`Failed to generate QR for ${item.artifact_id}:`, e);
        }
    }
    
    doc.end();
    console.log("PDF generated successfully: artifact_qrs.pdf");
}

main().catch(console.error);
