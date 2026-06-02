import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'sahs-archives');

console.log("PROJECT ID:", process.env.VITE_FIREBASE_PROJECT_ID);

async function check() {
    const snap = await getDocs(collection(db, "archive_items"));
    console.log(`Total DB items: ${snap.docs.length}`);
    let count = 0;
    snap.docs.forEach(d => {
        const data = d.data();
        const dataString = JSON.stringify(data).toLowerCase();
        
        if (dataString.includes('charter')) {
            console.log(`\nFOUND: ${data.title}`);
            console.log(`ID: ${d.id}`);
            console.log(`Fields with charter:`);
            for (const [key, val] of Object.entries(data)) {
                if (String(val).toLowerCase().includes('charter')) {
                    console.log(` - ${key}: ${val}`);
                }
            }
            console.log(`Legacy Loc: ${data.museum_location_id}`);
            console.log(`Array Locs: ${JSON.stringify(data.museum_location_ids)}`);
            count++;
        }
    });
    console.log(`\nTotal matched: ${count}`);
    process.exit(0);
}

check();
