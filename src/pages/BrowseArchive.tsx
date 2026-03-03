import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Filter, Folder } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { ArchiveItem, ItemType, Collection } from '../types/database';

export function BrowseArchive() {
    const [searchParams, setSearchParams] = useSearchParams();
    const typeParam = (searchParams.get('type') as ItemType) || 'All Items';

    const [search, setSearch] = useState('');
    const [selectedType, setSelectedType] = useState<ItemType | 'All Items'>(typeParam);

    useEffect(() => {
        setSelectedType(typeParam);
    }, [typeParam]);

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = e.target.value as ItemType | 'All Items';
        setSelectedType(newType);
        if (newType === 'All Items') {
            searchParams.delete('type');
        } else {
            searchParams.set('type', newType);
        }
        setSearchParams(searchParams);
    };

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

    const getHeaderText = () => {
        switch (selectedType) {
            case 'Document':
                return {
                    title: 'Document Archive',
                    description: `Browse and search through our collection of ${filteredItems.length} historical documents`,
                    placeholder: 'Search documents by title, description, or tag...'
                };
            case 'Historic Figure':
                return {
                    title: 'Historic Figures',
                    description: `Discover the people who shaped our history among ${filteredItems.length} profiles`,
                    placeholder: 'Search figures by name, occupation, or bio...'
                };
            case 'Historic Organization':
                return {
                    title: 'Historic Organizations',
                    description: `Explore ${filteredItems.length} organizations and institutions from our area's past`,
                    placeholder: 'Search organizations by name or description...'
                };
            default:
                return {
                    title: 'Archive Collection',
                    description: `Browse and search through our entire collection of ${items.length} historical items`,
                    placeholder: 'Search the archive by keyword, title, or tag...'
                };
        }
    };

    const headerText = getHeaderText();

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading archive...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col">
            <div className="mb-10">
                <h1 className="text-5xl font-serif font-bold mb-4 text-charcoal tracking-tight">{headerText.title}</h1>
                <p className="text-charcoal-light text-xl">{headerText.description}</p>
            </div>

            <div className="bg-white p-3 rounded-xl border border-tan-light flex flex-col md:flex-row gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mb-10">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={20} />
                    <input
                        type="text"
                        placeholder={headerText.placeholder}
                        className="w-full bg-cream pl-12 pr-4 py-3.5 rounded-lg border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="w-px bg-tan-light hidden md:block" />
                <div className="relative min-w-[220px]">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                    <select
                        className="w-full bg-cream pl-10 pr-10 py-3.5 rounded-lg border border-transparent outline-none appearance-none cursor-pointer focus:bg-white focus:border-tan-light transition-all font-sans text-charcoal"
                        value={selectedType}
                        onChange={handleTypeChange}
                    >
                        <option value="All Items">All Categories</option>
                        <option value="Document">Documents</option>
                        <option value="Historic Figure">Historic Figures</option>
                        <option value="Historic Organization">Historic Organizations</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-charcoal-light"><polyline points="6 9 12 15 18 9"></polyline></svg>
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
                    <div className="text-center py-24 bg-white rounded-xl border border-tan-light/50 shadow-sm">
                        <p className="text-charcoal-light text-xl font-serif italic mb-2">No items found.</p>
                        <p className="text-charcoal-light/70 font-sans">Try modifying your search or filters.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
