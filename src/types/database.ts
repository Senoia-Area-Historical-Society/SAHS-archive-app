export interface Collection {
    id: string;
    title: string;
    description: string;
    featured_image_url?: string | null;
    file_urls?: string[];
    created_at: string;
    item_count?: number;
}

export type ItemType = 'Document' | 'Historic Figure' | 'Historic Organization' | 'Artifact';

// Dublin Core Metadata Element Set (v1.1)
export interface ArchiveItem {
    id: string;

    // System Fields
    item_type: ItemType;
    collection_id?: string | null;
    tags: string[];
    category?: string | null;
    file_urls: string[]; // For documents, scans, or portraits
    created_at: string;
    updated_at?: string | null;

    // Figure specific
    full_name?: string | null;
    also_known_as?: string | null;
    birth_date?: string | null;
    death_date?: string | null;
    birthplace?: string | null;
    occupation?: string | null;

    // Organization specific
    org_name?: string | null;
    alternative_names?: string | null;
    founding_date?: string | null;
    dissolved_date?: string | null;

    // DC Core Elements
    title: string;          // Name given to the resource
    subject?: string | null;       // Topic of the resource (keywords/phrases)
    description: string;    // An account of the resource
    transcription?: string | null; // OCR text transcription of the resource
    archive_reference?: string | null; // Archive reference ID
    creator?: string | null;       // Entity primarily responsible for making the resource
    source?: string | null;        // The resource from which the described resource is derived
    publisher?: string | null;     // Entity responsible for making the resource available
    date?: string | null;          // A point or period of time associated with an event in the lifecycle of the resource
    contributor?: string | null;   // Entity responsible for making contributions to the resource
    rights?: string | null;        // Information about rights held in and over the resource
    relation?: string | null;      // A related resource
    format?: string | null;        // The file format, physical medium, or dimensions of the resource
    language?: string | null;      // A language of the resource
    type?: string | null;          // The nature or genre of the resource (Dublin Core 'Type' is distinct from our 'item_type')
    identifier?: string | null;    // An unambiguous reference to the resource within a given context (Archive Ref)
    coverage?: string | null;      // The spatial or temporal topic of the resource

    // SAHS Specific
    condition?: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Fragile' | 'Needs to be rescanned' | null;
    physical_location?: string | null;
    historical_address?: string | null; // Physical address for geolocation
    coordinates?: { // Automatically populated by Firebase Geocoding Extension
        lat: number;
        lng: number;
    } | null;
    related_figures?: string[]; // IDs of Historic Figures
    related_documents?: string[]; // IDs of Documents/Photos for Figures
    related_organizations?: string[]; // IDs of Historic Organizations
    donor?: string | null;         // Original donor of the item (specifically requested for Artifacts)
    artifact_id?: string | null;   // Unique ID for artifacts (e.g. ID #)
    artifact_type?: string | null; // Sub-type for artifacts (textile, photo, etc.)
    museum_location?: string | null; // Specific location in the museum (e.g. Box 4, Shelf 2)
    featured_image_url?: string | null; // Primary display image selected from file_urls
}
