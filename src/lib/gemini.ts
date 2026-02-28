import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import type { ArchiveItem } from '../types/database';

// Initialize the API using the new @google/genai SDK
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

// We define the schema we want Gemini to return to ensure it fits our item entry form
const archiveItemSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        title: {
            type: Type.STRING,
            description: "A succinct, descriptive title for the item.",
        },
        description: {
            type: Type.STRING,
            description: "A detailed description or biography. If the image contains legible text (like a letter or newspaper), please provide a full transcription here as well, separated from the description by a clear header '--- Transcription ---'.",
        },
        date: {
            type: Type.STRING,
            description: "The creation date of the item, e.g., '1920', 'c. 1905', 'October 4, 1850'.",
        },
        creator: {
            type: Type.STRING,
            description: "The author, photographer, or originating body.",
        },
        subject: {
            type: Type.STRING,
            description: "The primary topic or keywords.",
        },
        tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of 3-5 relevant tags, e.g., 'Civil War', 'Main Street'.",
        },
        publisher: { type: Type.STRING },
        contributor: { type: Type.STRING },
        rights: { type: Type.STRING },
        relation: { type: Type.STRING },
        format: { type: Type.STRING },
        language: { type: Type.STRING },
        dc_type: {
            type: Type.STRING,
            description: "The nature or genre, e.g., 'StillImage' or 'Text'."
        },
        identifier: { type: Type.STRING },
        source: { type: Type.STRING },
        coverage: { type: Type.STRING },
    },
    required: ["title", "description", "date", "creator", "subject", "tags"],
};

export async function extractMetadataFromFile(file: File): Promise<Partial<ArchiveItem> & { dc_type?: string }> {
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
        throw new Error("VITE_GEMINI_API_KEY is not configured.");
    }

    try {
        // 1. Convert File to Base64 String
        const base64Data = await fileToBase64(file);

        // Remove the data URL prefix (e.g. "data:image/jpeg;base64,") to just leave the raw payload
        const base64Payload = base64Data.split(',')[1];

        // Extract the mime type
        const mimeType = file.type;

        // 2. Determine if it's an image or PDF and structure the prompt
        // Note: The new SDK requires inlineData to have data and mimeType
        const prompt = `Analyze this archival document or photograph. Please extract all available Dublin Core metadata elements and generate a comprehensive description. If there is legible text, include a full OCR transcription in the description field.`;

        // 3. Call the Gemini 2.5 Flash model and enforce JSON output
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                data: base64Payload,
                                mimeType: mimeType
                            }
                        }
                    ]
                }
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: archiveItemSchema,
                temperature: 0.2, // Keep it relatively deterministic for metadata extraction
            }
        });

        // 4. Parse the JSON response
        const text = response.text();
        if (!text) {
            throw new Error("Received empty response from Gemini.");
        }

        const metadata = JSON.parse(text);
        return metadata;

    } catch (error) {
        console.error("Error extracting metadata from Gemini:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to extract metadata. Please try again.");
    }
}

// Utility function to convert a File object to a Base64 string
function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
}
