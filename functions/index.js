const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { Client } = require("@googlemaps/google-maps-services-js");
const { logger } = require("firebase-functions");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

admin.initializeApp();
const db = getFirestore("sahs-archives");

// Initialize Google Maps client
const mapsClient = new Client({});

/**
 * Cloud Function to extract metadata from an image or PDF using Gemini.
 * Uses the Gemini 2.5 Flash model for fast, accurate extraction.
 */
exports.extractMetadata = onCall({
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: ["GEMINI_API_KEY"] // Best practice: Use Secret Manager
}, async (request) => {
    // 1. Verify Authentication (Only SAHS users can call this)
    if (!request.auth || !request.auth.token.email.endsWith('@senoiahistory.com')) {
        throw new HttpsError("unauthenticated", "Unauthorized. You must be an @senoiahistory.com user.");
    }

    let { base64Payload, mimeType, url } = request.data;

    if (url && !base64Payload) {
        try {
            logger.info(`Fetching image from URL: ${url}`);
            const fetchResponse = await fetch(url);
            if (!fetchResponse.ok) {
                throw new Error(`Failed to fetch image from URL: ${fetchResponse.statusText}`);
            }
            const arrayBuffer = await fetchResponse.arrayBuffer();
            base64Payload = Buffer.from(arrayBuffer).toString('base64');
            mimeType = fetchResponse.headers.get('content-type') || 'image/jpeg';
        } catch (error) {
            logger.error("Error fetching image from URL:", error);
            throw new HttpsError("internal", `Failed to download image from the provided URL: ${error.message}`);
        }
    }

    if (!base64Payload || !mimeType) {
        throw new HttpsError("invalid-argument", "Missing base64Payload, mimeType, or url.");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new HttpsError("failed-precondition", "GEMINI_API_KEY secret is not configured.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
        },
    });

    const prompt = `Analyze this archival document or photograph. Please extract all available Dublin Core metadata elements and generate a comprehensive historical description. 
    CRITICAL: If there is legible text, extract it verbatim into the 'transcription' field. DO NOT put the transcription in the 'description' field.
    Also specifically look for formal archive reference identification numbers or labels, and put them in the 'archive_reference' field.`;

    try {
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Payload,
                    mimeType: mimeType
                }
            }
        ]);

        const response = await result.response;
        const text = response.text();

        if (!text) {
            throw new HttpsError("internal", "Received empty response from Gemini.");
        }

        return JSON.parse(text);
    } catch (error) {
        logger.error("Error in extractMetadata:", error);
        throw new HttpsError("internal", "Failed to extract metadata from Gemini.");
    }
});

/**
 * Cloud Function to automatically geocode the "historical_address" field 
 * into a "coordinates" object on the archive_items collection.
 * 
 * Replaces the deprecated official Firebase Extension.
 */
exports.geocodeArchiveItemAddress = onDocumentWritten({
    document: "archive_items/{itemId}",
    database: "sahs-archives"
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
    database: "sahs-archives"
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
    timeoutSeconds: 30
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


