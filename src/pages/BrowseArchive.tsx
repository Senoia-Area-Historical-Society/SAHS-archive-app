import { useState, useEffect } from 'react';
import { Search, Filter, Folder } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { ArchiveItem, ItemType, Collection } from '../types/database';

export function BrowseArchive() {
    const [search, setSearch] = useState('');
    const [selectedType, setSelectedType] = useState<ItemType | 'All Items'>('All Items');
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [selectedCollection, setSelectedCollection] = useState<string>('All Collections');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchItems = async () => {
            try {
                // Fetch all unified archive_items
                const q = query(collection(db, 'archive_items'), orderBy('created_at', 'desc'));
                const querySnapshot = await getDocs(q);
                const itemsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArchiveItem[];
                setItems(itemsData);
            } catch (error) {
                console.error("Error fetching items: ", error);
            } finally {
                setLoading(false);
            }
        };

        const fetchCollections = async () => {
            try {
                const q = query(collection(db, 'collections'), orderBy('title', 'asc'));
                const querySnapshot = await getDocs(q);
                const collectionsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Collection[];
                setCollections(collectionsData);
            } catch (error) {
                console.error("Error fetching collections:", error);
            }
        };

        fetchItems();
        fetchCollections();
    }, []);

    // Unified client-side filtering
    const filteredItems = items.filter(item => {
        const searchLower = search.toLowerCase();
        const matchesSearch =
            item.title?.toLowerCase().includes(searchLower) ||
            item.description?.toLowerCase().includes(searchLower) ||
            item.subject?.toLowerCase().includes(searchLower) ||
            item.tags?.some(tag => tag.toLowerCase().includes(searchLower));

        const matchesType = selectedType === 'All Items' || item.item_type === selectedType;
        const matchesCollection = selectedCollection === 'All Collections' || item.collection_id === selectedCollection;

        return matchesSearch && matchesType && matchesCollection;
    });

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading archive...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col">
            <div className="mb-8">
                <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight">Browse the Archive</h1>
                <p className="text-charcoal/70 text-lg">Explore our unified collection of historical documents, photographs, and figures</p>
            </div>

            <div className="bg-white p-2 rounded-xl border border-tan-light/50 flex flex-col md:flex-row gap-2 shadow-sm mb-8">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={20} />
                    <input
                        type="text"
                        placeholder="Search by title, description, subject, or tags..."
                        className="w-full bg-cream/50 pl-12 pr-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="w-px bg-tan-light/50 hidden md:block" />
                <div className="relative min-w-[200px]">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                    <select
                        className="w-full bg-cream/50 pl-10 pr-10 py-3 rounded-lg outline-none appearance-none cursor-pointer focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-medium text-charcoal font-sans"
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value as ItemType | 'All Items')}
                    >
                        <option value="All Items">All Types</option>
                        <option value="Document">Documents & Media</option>
                        <option value="Historic Figure">Historic Figures</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-charcoal/60"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
                <div className="w-px bg-tan-light/50 hidden lg:block" />
                <div className="relative min-w-[200px]">
                    <Folder className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                    <select
                        className="w-full bg-cream/50 pl-10 pr-10 py-3 rounded-lg outline-none appearance-none cursor-pointer focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-medium text-charcoal font-sans"
                        value={selectedCollection}
                        onChange={(e) => setSelectedCollection(e.target.value)}
                    >
                        <option value="All Collections">All Collections</option>
                        {collections.map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-charcoal/60"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
            </div>

            <div className="flex-1">
                {filteredItems.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                        {filteredItems.map(item => (
                            <DocumentCard key={item.id} item={item} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <p className="text-charcoal/50 text-lg font-serif italic">No items found matching your search.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
