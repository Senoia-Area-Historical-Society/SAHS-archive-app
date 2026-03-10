export interface Collection {
    id: string;
    title: string;
    description: string;
    featured_image_url?: string;
    file_urls?: string[];
    created_at: string;
}

export type ItemType = 'Document' | 'Historic Figure' | 'Historic Organization' | 'Artifact';

// Dublin Core Metadata Element Set (v1.1)
export interface ArchiveItem {
    id: string;

    // System Fields
    item_type: ItemType;
    collection_id?: string;
    tags: string[];
    category?: string;
    file_urls: string[]; // For documents, scans, or portraits
    created_at: string;

    // Figure specific
    full_name?: string;
    also_known_as?: string;
    birth_date?: string;
    death_date?: string;
    birthplace?: string;
    occupation?: string;

    // Organization specific
    org_name?: string;
    alternative_names?: string;
    founding_date?: string;
    dissolved_date?: string;

    // DC Core Elements
    title: string;          // Name given to the resource
    subject?: string;       // Topic of the resource (keywords/phrases)
    description: string;    // An account of the resource
    transcription?: string; // OCR text transcription of the resource
    archive_reference?: string; // Archive reference ID
    creator?: string;       // Entity primarily responsible for making the resource
    source?: string;        // The resource from which the described resource is derived
    publisher?: string;     // Entity responsible for making the resource available
    date?: string;          // A point or period of time associated with an event in the lifecycle of the resource
    contributor?: string;   // Entity responsible for making contributions to the resource
    rights?: string;        // Information about rights held in and over the resource
    relation?: string;      // A related resource
    format?: string;        // The file format, physical medium, or dimensions of the resource
    language?: string;      // A language of the resource
    type?: string;          // The nature or genre of the resource (Dublin Core 'Type' is distinct from our 'item_type')
    identifier?: string;    // An unambiguous reference to the resource within a given context (Archive Ref)
    coverage?: string;      // The spatial or temporal topic of the resource

    // SAHS Specific
    condition?: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Fragile' | 'Needs to be rescanned';
    physical_location?: string;
    related_figures?: string[]; // IDs of Historic Figures
    related_documents?: string[]; // IDs of Documents/Photos for Figures
    related_organizations?: string[]; // IDs of Historic Organizations
    donor?: string;         // Original donor of the item (specifically requested for Artifacts)
    artifact_id?: string;   // Unique ID for artifacts (e.g. ID #)
    artifact_type?: string; // Sub-type for artifacts (textile, photo, etc.)
    museum_location?: string; // Specific location in the museum (e.g. Box 4, Shelf 2)
    featured_image_url?: string; // Primary display image selected from file_urls
}
