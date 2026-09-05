const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { Client } = require("@googlemaps/google-maps-services-js");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

admin.initializeApp();
const db = getFirestore("sahs-archives");

// Initialize Google Maps client
const mapsClient = new Client({});

/**
 * Cloud Function to automatically geocode the "historical_address" field 
 * into a "coordinates" object on the archive_items collection.
 * 
 * Replaces the deprecated official Firebase Extension.
 */
exports.geocodeArchiveItemAddress = onDocumentWritten({
    document: "archive_items/{itemId}",
    database: "sahs-archives",
    maxInstances: 10
}, async (event) => {
    const change = event.data;
    if (!change) return;

    // Get the documents before and after the change
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // The document was deleted
    if (!afterData) return;

    // The address hasn't changed (prevents infinite loops)
    const beforeAddress = beforeData ? beforeData.historical_address : null;
    const afterAddress = afterData.historical_address;

    if (beforeAddress === afterAddress) {
        logger.debug("Address hasn't changed. Skipping.");
        return;
    }

    // If address was cleared, clear coordinates
    if (!afterAddress || afterAddress.trim() === "") {
        logger.info(`Address removed for item ${event.params.itemId}. Clearing coordinates.`);
        return change.after.ref.update({
            coordinates: null
        });
    }

    // Geocode the new address
    try {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            logger.error("GOOGLE_MAPS_API_KEY environment variable is not set.");
            return;
        }

        logger.info(`Geocoding address: "${afterAddress}" for item ${event.params.itemId}`);
        const response = await mapsClient.geocode({
            params: {
                address: afterAddress,
                key: apiKey,
            },
        });

        if (response.data.results.length > 0) {
            const location = response.data.results[0].geometry.location;
            logger.info(`Geocoding successful. Location: ${location.lat}, ${location.lng}`);

            // Update the document with new coordinates
            return change.after.ref.update({
                coordinates: {
                    lat: location.lat,
                    lng: location.lng
                }
            });
        } else {
            logger.warn(`No geocoding results found for address: "${afterAddress}"`);
            return; // Or clear coordinates if you prefer
        }
    } catch (error) {
        logger.error(`Error geocoding address "${afterAddress}":`, error);
        return;
    }
});

/**
 * Cloud Function to create a notification when a new comment is posted.
 * Triggers on any document created in archive_items/{itemId}/comments/{commentId}.
 */
exports.onCommentCreated = onDocumentCreated({
    document: "archive_items/{itemId}/comments/{commentId}",
    database: "sahs-archives",
    maxInstances: 10
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const commentData = snapshot.data();
    const itemId = event.params.itemId;

    logger.info(`New comment posted on item ${itemId} by ${commentData.authorEmail}`);

    try {
        // Fetch the parent archive item to get its title
        const itemRef = db.collection("archive_items").doc(itemId);
        const itemSnap = await itemRef.get();
        let itemTitle = "Unknown Archive Item";
        if (itemSnap.exists) {
            itemTitle = itemSnap.data().title || "Untitled Item";
        }

        // Create the notification document
        const notificationRef = db.collection("notifications").doc();
        await notificationRef.set({
            id: notificationRef.id,
            type: "new_comment",
            itemId: itemId,
            itemTitle: itemTitle,
            authorName: commentData.authorName || "Anonymous",
            authorEmail: commentData.authorEmail || "",
            commentText: commentData.content || "",
            createdAt: commentData.createdAt || new Date().toISOString(),
            readBy: [],
            parentId: commentData.parentId || null
        });

        logger.info(`Notification created with ID ${notificationRef.id}`);
    } catch (error) {
        logger.error("Error creating notification on comment creation:", error);
    }
});

/**
 * Parses HTML from isbnsearch.org to extract book metadata.
 */
function parseIsbnSearchHtml(html) {
    let title = "";
    const titleMatch = html.match(/<h1>([^<]+)<\/h1>/i);
    if (titleMatch) title = titleMatch[1].trim();

    let coverUrl = "";
    const imgMatch = html.match(/<div class="image">\s*<img src="([^"]+)"/i);
    if (imgMatch) coverUrl = imgMatch[1].trim();

    let authors = "";
    const authorsMatch = html.match(/<strong>Authors:<\/strong>\s*([^<]+)/i);
    if (authorsMatch) authors = authorsMatch[1].trim();

    let publisher = "";
    const publisherMatch = html.match(/<strong>Publisher:<\/strong>\s*([^<]+)/i);
    if (publisherMatch) publisher = publisherMatch[1].trim();

    let publishYear = "";
    const publishedMatch = html.match(/<strong>Published:<\/strong>\s*([^<]+)/i);
    if (publishedMatch) {
        const publishedVal = publishedMatch[1].trim();
        const yearMatch = publishedVal.match(/\d{4}/);
        publishYear = yearMatch ? yearMatch[0] : publishedVal;
    }

    if (!title && !authors && !publisher) {
        return null;
    }

    return {
        title,
        coverUrl,
        authors,
        publisher,
        publishYear
    };
}

/**
 * Callable Cloud Function to lookup book details from isbnsearch.org when standard APIs fail.
 */
exports.lookupIsbnFallback = onCall({
    memory: "256MiB",
    timeoutSeconds: 30,
    maxInstances: 10
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Unauthorized. You must be logged in.");
    }

    const { isbn } = request.data;
    if (!isbn) {
        throw new HttpsError("invalid-argument", "Missing isbn parameter.");
    }

    const cleanedIsbn = isbn.replace(/[^0-9X]/gi, '').trim();
    if (!cleanedIsbn) {
        throw new HttpsError("invalid-argument", "Invalid ISBN format.");
    }

    try {
        logger.info(`Fetching ISBN metadata from isbnsearch.org for ${cleanedIsbn}`);
        const response = await fetch(`https://isbnsearch.org/isbn/${cleanedIsbn}`);
        if (!response.ok) {
            logger.warn(`isbnsearch.org returned status: ${response.status}`);
            return { success: false, error: "NotFound" };
        }

        const html = await response.text();
        const book = parseIsbnSearchHtml(html);
        if (!book) {
            return { success: false, error: "ParseError" };
        }

        return { success: true, book };
    } catch (err) {
        logger.error(`Error in lookupIsbnFallback for ${cleanedIsbn}:`, err);
        throw new HttpsError("internal", `Internal error fetching ISBN: ${err.message}`);
    }
});



// Short-lived signed URLs for media the public may not read. Restricted objects
// have no download token by design, and getDownloadURL() cannot mint one, so the
// client has no other way to display them to an authorised curator.
exports.restrictedMediaUrl = require("./restrictedMedia").restrictedMediaUrl;

// Mirrors user_roles onto Auth custom claims, so a role granted in Admin
// Settings is visible to Storage Rules (which cannot query this named
// Firestore database the way firestore.rules can).
// Keeps archive_items.is_private in step with the privacy of the collections an
// item belongs to. `is_private` is what firestore.rules and every public query
// read, so it is a denormalised value with a sync obligation — see
// functions/collectionPrivacy.js.
exports.syncItemPrivacy = require("./collectionPrivacy").syncItemPrivacy;
exports.syncCollectionPrivacy = require("./collectionPrivacy").syncCollectionPrivacy;

exports.syncUserRoleClaims = require("./userRoles").syncUserRoleClaims;
exports.syncMyRoleClaim = require("./userRoles").syncMyRoleClaim;


// Server-rendered <head> for archive detail pages. Social scrapers don't execute
// JavaScript, so without this every shared link previews as the generic site title.
exports.renderMeta = require("./renderMeta").renderMeta;
