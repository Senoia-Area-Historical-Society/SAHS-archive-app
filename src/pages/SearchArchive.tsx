import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Calendar, MapPin, Tag, SlidersHorizontal } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { ArchiveItem, ItemType } from '../types/database';

export function SearchArchive() {
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [keyword, setKeyword] = useState('');
    const [selectedType, setSelectedType] = useState<ItemType | 'All Items'>('All Items');
    const [searchYear, setSearchYear] = useState('');
    const [searchPlace, setSearchPlace] = useState('');
    const [searchTag, setSearchTag] = useState('');

    useEffect(() => {
        const fetchItems = async () => {
            try {
                const q = query(collection(db, 'archive_items'), orderBy('created_at', 'desc'));
                const querySnapshot = await getDocs(q);
                const itemsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArchiveItem[];
                setItems(itemsData);
            } catch (error) {
                console.error("Error fetching items:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchItems();
    }, []);

    // Extract unique tags for the dropdown
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        items.forEach(item => {
            if (item.tags) {
                item.tags.forEach(t => tags.add(t));
            }
        });
        return Array.from(tags).sort();
    }, [items]);

    const filteredItems = items.filter(item => {
        // Keyword match across multiple fields
        const kw = keyword.toLowerCase();
        const matchesKeyword = !keyword ||
            item.title?.toLowerCase().includes(kw) ||
            item.description?.toLowerCase().includes(kw) ||
            item.subject?.toLowerCase().includes(kw) ||
            item.transcription?.toLowerCase().includes(kw) ||
            item.creator?.toLowerCase().includes(kw) ||
            item.full_name?.toLowerCase().includes(kw) ||
            item.also_known_as?.toLowerCase().includes(kw) ||
            item.birthplace?.toLowerCase().includes(kw) ||
            item.occupation?.toLowerCase().includes(kw) ||
            item.org_name?.toLowerCase().includes(kw) ||
            item.alternative_names?.toLowerCase().includes(kw) ||
            item.founding_date?.toLowerCase().includes(kw) ||
            item.dissolved_date?.toLowerCase().includes(kw);

        // Type match
        const matchesType = selectedType === 'All Items' || item.item_type === selectedType;

        // Year / Date match (simple substring search on the date field)
        const matchesYear = !searchYear || (item.date && item.date.toLowerCase().includes(searchYear.toLowerCase()));

        // Place / Coverage match
        const matchesPlace = !searchPlace || (item.coverage && item.coverage.toLowerCase().includes(searchPlace.toLowerCase()));

        // Tag match (partial match)
        const matchesTag = !searchTag || (item.tags && item.tags.some(t => t.toLowerCase().includes(searchTag.toLowerCase())));

        return matchesKeyword && matchesType && matchesYear && matchesPlace && matchesTag;
    });

    const resetFilters = () => {
        setKeyword('');
        setSelectedType('All Items');
        setSearchYear('');
        setSearchPlace('');
        setSearchTag('');
    };

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading search engine...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col pb-12">
            <div className="mb-10">
                <h1 className="text-5xl font-serif font-bold mb-4 text-charcoal tracking-tight flex items-center gap-4">
                    <SlidersHorizontal className="text-tan" size={40} />
                    Advanced Search
                </h1>
                <p className="text-charcoal-light text-xl">
                    Query the entire database of documents, figures, and organizations using specific criteria.
                </p>
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    // Filters are already reactive via state, but this enables 'Enter' key support
                }}
                className="bg-white p-6 md:p-8 rounded-2xl border border-tan-light shadow-sm mb-10"
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Keyword Search */}
                    <div className="lg:col-span-3 pb-6 border-b border-tan-light/50">
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Keyword Search</label>
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={20} />
                                <input
                                    type="text"
                                    placeholder="Search by title, description, transcriptions, or creator..."
                                    className="w-full bg-cream pl-12 pr-4 py-4 rounded-xl border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal text-lg shadow-inner"
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                className="bg-tan text-white px-8 py-4 rounded-xl font-bold hover:bg-charcoal transition-all shadow-md hidden md:block"
                            >
                                Search
                            </button>
                        </div>
                    </div>

                    {/* Filter: Item Type */}
                    <div>
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Item Type</label>
                        <div className="relative">
                            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                            <select
                                className="w-full bg-cream pl-11 pr-10 py-3 rounded-lg border border-transparent outline-none appearance-none cursor-pointer focus:bg-white focus:border-tan-light transition-all font-sans text-charcoal"
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value as ItemType | 'All Items')}
                            >
                                <option value="All Items">All Types</option>
                                <option value="Document">Documents</option>
                                <option value="Historic Figure">Historic Figures</option>
                                <option value="Historic Organization">Historic Organizations</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronDownIcon />
                            </div>
                        </div>
                    </div>

                    {/* Filter: Date/Year */}
                    <div>
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Year / Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                            <input
                                type="text"
                                placeholder="e.g. 1920, 1850-1900..."
                                className="w-full bg-cream pl-11 pr-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal"
                                value={searchYear}
                                onChange={(e) => setSearchYear(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Filter: Place */}
                    <div>
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Place / Location</label>
                        <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                            <input
                                type="text"
                                placeholder="e.g. Main Street, Newnan..."
                                className="w-full bg-cream pl-11 pr-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal"
                                value={searchPlace}
                                onChange={(e) => setSearchPlace(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="md:col-span-2 lg:col-span-1">
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Subject Tag</label>
                        <div className="relative">
                            <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                            <input
                                type="text"
                                placeholder="Search by tag..."
                                className="w-full bg-cream pl-11 pr-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal"
                                value={searchTag}
                                onChange={(e) => setSearchTag(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Reset Button */}
                    <div className="md:col-span-2 lg:col-span-3 flex justify-between items-center mt-2">
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="text-sm font-bold text-charcoal hover:text-tan underline underline-offset-4 transition-colors p-2"
                        >
                            Reset Filters
                        </button>
                        <button
                            type="submit"
                            className="bg-tan text-white px-8 py-3 rounded-lg font-bold hover:bg-charcoal transition-all md:hidden"
                        >
                            Search
                        </button>
                    </div>
                </div>
            </form>

            <div className="flex-1">
                <div className="mb-6 flex justify-between items-end">
                    <h2 className="text-2xl font-serif font-bold text-charcoal">Search Results</h2>
                    <p className="text-charcoal-light font-medium">{filteredItems.length} {filteredItems.length === 1 ? 'result' : 'results'} found</p>
                </div>

                {filteredItems.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                        {filteredItems.map(item => (
                            <DocumentCard key={item.id} item={item} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-24 bg-white rounded-xl border border-tan-light/50 shadow-sm">
                        <p className="text-charcoal-light text-xl font-serif italic mb-2">No matching items found.</p>
                        <p className="text-charcoal-light/70 font-sans">Try broadening your search criteria.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function ChevronDownIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-charcoal-light">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    );
}
