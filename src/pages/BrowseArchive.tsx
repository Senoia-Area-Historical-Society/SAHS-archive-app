import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Filter, ArrowUpDown, LayoutGrid, Map as MapIcon } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard';
import { ArchiveMap } from '../components/ArchiveMap';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { ArchiveItem, ItemType, Collection } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';

export function BrowseArchive() {
    const [searchParams, setSearchParams] = useSearchParams();

    const search = searchParams.get('q') || '';
    const selectedType = (searchParams.get('type') as ItemType | null) || 'All Items';
    const viewMode = (searchParams.get('view') as 'grid'|'map' | null) || 'grid';
    const selectedCollection = searchParams.get('collection') || 'All Collections';
    const sortBy = searchParams.get('sort') || 'created_desc';

    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [collectionPrivacyMap, setCollectionPrivacyMap] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [localSearch, setLocalSearch] = useState(search);
    const { isSAHSUser } = useAuth();
    const { settings } = useAppearance();

    // Pagination state
    const [visibleCount, setVisibleCount] = useState(24);
    const PAGE_SIZE = 24;

    // Sync local search with URL search param initially
    useEffect(() => {
        setLocalSearch(search);
    }, [search]);

    // Debounce updating the search URL parameter
    useEffect(() => {
        const handler = setTimeout(() => {
            if (localSearch !== search) {
                updateParam('q', localSearch);
            }
        }, 300);

        return () => clearTimeout(handler);
    }, [localSearch, search]);

    const updateParam = (key: string, value: string, defaultValue: string = '') => {
        const params = new URLSearchParams(searchParams);
        if (!value || value === defaultValue) {
            params.delete(key);
        } else {
            params.set(key, value);
        }
        setSearchParams(params, { replace: true });
    };

    useEffect(() => {
        const fetchItems = async () => {
            try {
                // Fetch collections to determine privacy status
                const collectionsSnapshot = await getDocs(collection(db, 'collections'));
                const privacyMap: Record<string, boolean> = {};
                collectionsSnapshot.docs.forEach(doc => {
                    const data = doc.data() as Collection;
                    if (data.is_private) {
                        privacyMap[doc.id] = true;
                    }
                });
                setCollectionPrivacyMap(privacyMap);

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

        fetchItems();
    }, []);

    // Unified client-side filtering - Memoized to prevent heavy re-calculations
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const searchLower = search.toLowerCase();
            const matchesSearch =
                item.title?.toLowerCase().includes(searchLower) ||
                item.description?.toLowerCase().includes(searchLower) ||
                item.subject?.toLowerCase().includes(searchLower) ||
                item.tags?.some(tag => tag.toLowerCase().includes(searchLower));

            const matchesType = selectedType === 'All Items' || item.item_type === selectedType;
            const matchesCollection = selectedCollection === 'All Collections' || 
                item.collection_id === selectedCollection || 
                item.collection_ids?.includes(selectedCollection);

            if (!isSAHSUser) {
                const isItemPrivate = item.is_private === true;
                const cIds = item.collection_ids || (item.collection_id ? [item.collection_id] : []);
                const isCollectionPrivate = cIds.some(cid => collectionPrivacyMap[cid] === true);
                if (isItemPrivate || isCollectionPrivate) return false;
            }

            return matchesSearch && matchesType && matchesCollection;
        });
    }, [items, search, selectedType, selectedCollection, isSAHSUser, collectionPrivacyMap]);

    // Unified client-side sorting - Memoized
    const sortedItems = useMemo(() => {
        return [...filteredItems].sort((a, b) => {
            switch (sortBy) {
                case 'created_desc':
                    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                case 'created_asc':
                    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
                case 'date_desc':
                    return (b.date || '').localeCompare(a.date || '');
                case 'date_asc':
                    return (a.date || '').localeCompare(b.date || '');
                case 'title_asc':
                    return (a.title || '').localeCompare(b.title || '');
                case 'title_desc':
                    return (b.title || '').localeCompare(a.title || '');
                case 'id_asc': {
                    const idA = parseInt(a.artifact_id || '0', 10);
                    const idB = parseInt(b.artifact_id || '0', 10);
                    if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
                    return (a.artifact_id || '').localeCompare(a.artifact_id || '');
                }
                case 'id_desc': {
                    const idA = parseInt(a.artifact_id || '0', 10);
                    const idB = parseInt(b.artifact_id || '0', 10);
                    if (!isNaN(idA) && !isNaN(idB)) return idB - idA;
                    return (b.artifact_id || '').localeCompare(b.artifact_id || '');
                }
                default:
                    return 0;
            }
        });
    }, [filteredItems, sortBy]);

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
            case 'Artifact':
                return {
                    title: 'Artifact Collection',
                    description: `Browse ${filteredItems.length} historic artifacts and physical items`,
                    placeholder: 'Search artifacts by title, description, or origin...'
                };
            case 'Oral History':
                return {
                    title: 'Oral Histories',
                    description: `Listen and read along with ${filteredItems.length} personal stories from the ${settings.museumShortName || "Senoia"} community`,
                    placeholder: 'Search oral histories by narrator, interviewer, tags, or transcript...'
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

    useEffect(() => {
        document.title = `${headerText.title} | SAHS Digital Archive`;
    }, [headerText.title]);

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading archive...</div>;
    }

    return (
        <div className="max-w-full mx-auto h-full flex flex-col">
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
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                    />
                </div>
                <div className="w-px bg-tan-light hidden md:block" />
                <div className="relative min-w-[220px]">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                    <select
                        className="w-full bg-cream pl-10 pr-10 py-3.5 rounded-lg border border-transparent outline-none appearance-none cursor-pointer focus:bg-white focus:border-tan-light transition-all font-sans text-charcoal"
                        value={selectedType}
                        onChange={(e) => updateParam('type', e.target.value, 'All Items')}
                    >
                        <option value="All Items">All Categories</option>
                        <option value="Document">Documents</option>
                        <option value="Historic Figure">Historic Figures</option>
                        <option value="Historic Organization">Historic Organizations</option>
                        <option value="Artifact">Artifacts</option>
                        <option value="Oral History">Oral Histories</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-charcoal-light"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
                <div className="w-px bg-tan-light/50 hidden lg:block" />
                <div className="relative min-w-[200px]">
                    <ArrowUpDown className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                    <select
                        className="w-full bg-cream/50 pl-10 pr-10 py-3 rounded-lg outline-none appearance-none cursor-pointer focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-medium text-charcoal font-sans"
                        value={sortBy}
                        onChange={(e) => updateParam('sort', e.target.value, 'created_desc')}
                    >
                        <option value="created_desc">Date Added (Newest)</option>
                        <option value="created_asc">Date Added (Oldest)</option>
                        <option value="date_desc">Date of Origin (Newest)</option>
                        <option value="date_asc">Date of Origin (Oldest)</option>
                        <option value="title_asc">Alphabetical (A-Z)</option>
                        <option value="title_desc">Alphabetical (Z-A)</option>
                        <option value="id_asc">Numerical (ID # Low-High)</option>
                        <option value="id_desc">Numerical (ID # High-Low)</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-charcoal/60"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>

                <div className="w-px bg-tan-light/50 hidden md:block" />
                
                {/* View Selector */}
                <div className="flex bg-cream/50 p-1 rounded-lg border border-tan-light/30">
                    <button
                        onClick={() => updateParam('view', 'grid', 'grid')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/40 hover:text-charcoal'}`}
                        title="Grid View"
                    >
                        <LayoutGrid size={20} />
                    </button>
                    <button
                        onClick={() => updateParam('view', 'map', 'grid')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'map' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/40 hover:text-charcoal'}`}
                        title="Map View"
                    >
                        <MapIcon size={20} />
                    </button>
                </div>
            </div>

            <div className="flex-1">
                {sortedItems.length > 0 ? (
                    viewMode === 'grid' ? (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                                {sortedItems.slice(0, visibleCount).map(item => (
                                    <DocumentCard key={item.id} item={item} galleryIds={sortedItems.map(i => i.id || '')} />
                                ))}
                            </div>
                            
                            {sortedItems.length > visibleCount && (
                                <div className="mt-12 flex justify-center pb-12">
                                    <button 
                                        onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                                        className="px-12 py-4 bg-tan text-white rounded-full font-bold hover:bg-charcoal transition-all shadow-xl hover:shadow-tan/20 hover:-translate-y-1 active:translate-y-0.5 active:shadow-inner"
                                    >
                                        Show More Archive Records
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <ArchiveMap items={sortedItems} />
                    )
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

