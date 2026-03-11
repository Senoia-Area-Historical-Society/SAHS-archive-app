const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { Client } = require("@googlemaps/google-maps-services-js");
const { logger } = require("firebase-functions");

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
