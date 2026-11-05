import type { ArchiveItem } from '../types/database';

export const mockDocuments: Partial<ArchiveItem>[] = [
    {
        id: '1',
        title: 'Hightower Petroleum Report',
        description: 'A corporate report to the shareholders of the Hightower Petroleum company outlining annual revenue and operations.',
        date: 'c. 1950',
        file_urls: ['https://images.unsplash.com/photo-1544830215-200742d4a6de?auto=format&fit=crop&w=800&q=80'],
        created_at: new Date().toISOString()
    }
];

export const mockFigures: Partial<ArchiveItem>[] = [
    {
        id: '1',
        title: 'Dr. John Baggarly',
        description: 'A prominent physician in the area during the late 19th century.',
        date: '1850 - 1920',
        file_urls: ['https://images.unsplash.com/photo-1555529733-0e67056058ab?auto=format&fit=crop&w=800&q=80'],
        created_at: new Date().toISOString()
    }
];
