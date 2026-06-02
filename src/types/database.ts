export interface Room {
    id: string;      // Unique slug/ID
    docId?: string;  // Firebase Document ID
    name: string;    // Display name
    description?: string;
    created_at: string;
    map_coordinates?: {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation?: number;
        z_index?: number;
        display_type?: 'pin' | 'block';
    } | null;
    geometries?: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        rotation?: number;
        z_index?: number;
        display_type?: 'pin' | 'block';
    }>;
    group_id?: string;
    floor_id?: string;
}

export interface MapFloor {
    id: string;
    name: string;
    level: number;
}

export interface Collection {
    id: string;
    title: string;
    description: string;
    featured_image_url?: string | null;
    file_urls?: string[];
    created_at: string;
    item_count?: number;
    is_private?: boolean;
}

export interface MuseumLocation {
    id: string;      // Unique slug/ID (e.g. "gallery-a-shelf-1")
    docId?: string;  // The actual Firebase Document ID (for updateDoc/setDoc)
    name: string;    // Display name (e.g. "Gallery A, Shelf 1")
    description?: string;
    created_at: string;
    room_id?: string;
    parent_location_id?: string; // Links a Box to a parent Shelf/Case Location
    display_type?: 'pin' | 'block';
    map_coordinates?: {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation?: number;
        z_index?: number;
        display_type?: 'pin' | 'block';
    } | null;
    floor_id?: string;
}

export type ItemType = 'Document' | 'Historic Figure' | 'Historic Organization' | 'Artifact' | 'Oral History';

// Dublin Core Metadata Element Set (v1.1)
export interface ArchiveItem {
    id: string;

    // System Fields
    item_type: ItemType;
    collection_id?: string | null;
    collection_ids?: string[];
    tags: string[];
    category?: string | null;
    file_urls: string[]; // For documents, scans, or portraits
    file_captions?: string[]; // Corresponding captions for file_urls
    created_at: string;
    uploaded_by_email?: string | null;
    uploaded_by_name?: string | null;
    updated_at?: string | null;
    updated_by_email?: string | null;
    updated_by_name?: string | null;
    is_private?: boolean;

    // Figure specific
    full_name?: string | null;
    also_known_as?: string | null;
    birth_date?: string | null;
    death_date?: string | null;
    birthplace?: string | null;
    occupation?: string | null;
    biography_sources?: string | null;

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
    related_documents?: string[]; // IDs of Documents/Photos/Artifacts related to this item
    related_organizations?: string[]; // IDs of Historic Organizations
    donor?: string | null;         // Original donor of the item (specifically requested for Artifacts)
    artifact_id?: string | null;   // Unique ID for artifacts (e.g. ID #)
    artifact_type?: string | null; // Sub-type for artifacts (textile, photo, etc.)
    museum_location?: string | null; // Legacy specific location in the museum (e.g. Box 4, Shelf 2)
    museum_location_id?: string | null; // Legacy specific location in the museum (e.g. Box 4, Shelf 2)
    museum_location_ids?: string[];     // Support for multiple active locations
    last_tagged_at?: string | null;
    last_tagged_by?: string | null;
    stage?: 'Housed' | 'Staged' | 'In Processing' | null;
    featured_image_url?: string | null; // Primary display image selected from file_urls
    accession_paperwork_urls?: string[]; // Admin/Curator only scans of paperwork
    additional_media_urls?: string[]; // Video/Audio recordings for artifacts
    accession_date?: string | null;
    collection_status?: 'permanent' | 'pending' | 'deaccessioned' | 'loan' | null;

    // Oral History specific
    narrator_id?: string | null;        // ID of the narrator (Historic Figure)
    interviewer?: string | null;        // Name of the interviewer
    interview_date?: string | null;     // Date of the interview
    audio_url?: string | null;          // URL of the audio recording
    youtube_video_id?: string | null;   // Optional YouTube video ID
    transcript?: string | null;         // Full text transcription of the interview
}
