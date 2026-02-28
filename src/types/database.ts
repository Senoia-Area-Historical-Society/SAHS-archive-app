export interface Collection {
    id: string;
    title: string;
    description: string;
    cover_image_url?: string;
    created_at: string;
}

export type ItemType = 'Document' | 'Historic Figure';

// Dublin Core Metadata Element Set (v1.1)
export interface ArchiveItem {
    id: string;

    // System Fields
    item_type: ItemType;
    collection_id?: string;
    tags: string[];
    file_urls: string[]; // For documents, scans, or portraits
    created_at: string;

    // Dublin Core Elements
    title: string;          // Name given to the resource
    subject?: string;       // Topic of the resource (keywords/phrases)
    description: string;    // An account of the resource
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
    coverage?: string;      // The spatial or temporal topic of the resource, the spatial applicability of the resource, or the jurisdiction under which the resource is relevant
}
