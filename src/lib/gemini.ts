import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { ArchiveItem } from '../types/database';

/**
 * Calls a secure Firebase Cloud Function to extract metadata from a file using Gemini.
 * This keeps the API key hidden from the client-side.
 */
export async function extractMetadataFromFile(file: File): Promise<Partial<ArchiveItem> & { dc_type?: string }> {
    try {
        // 1. Convert File to Base64 String
        const base64Data = await fileToBase64(file);

        // Remove the data URL prefix (e.g. "data:image/jpeg;base64,") to just leave the raw payload
        const base64Payload = base64Data.split(',')[1];

        // Extract the mime type
        const mimeType = file.type;

        // 2. Call the Cloud Function
        const extractMetadataFn = httpsCallable<{ base64Payload: string; mimeType: string }, any>(functions, 'extractMetadata');
        
        const result = await extractMetadataFn({
            base64Payload,
            mimeType
        });

        return result.data;

    } catch (error) {
        console.error("Error calling extractMetadata Cloud Function:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to extract metadata. Please try again.");
    }
}

/**
 * Utility function to convert a File object to a Base64 string
 */
function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
}
