const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { Client } = require("@googlemaps/google-maps-services-js");
const { logger } = require("firebase-functions");
const { GoogleGenerativeAI } = require("@google/generative-ai");

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

    const { base64Payload, mimeType } = request.data;

    if (!base64Payload || !mimeType) {
        throw new HttpsError("invalid-argument", "Missing base64Payload or mimeType.");
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
