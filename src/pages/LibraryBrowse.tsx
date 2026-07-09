import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, BookOpen, Plus, MapPin, Tag, RefreshCw, Info } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { LibraryBook, MuseumLocation } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';

export function LibraryBrowse() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { isSAHSUser } = useAuth();
    const { settings } = useAppearance();

    if (settings.featureToggles?.enableLibrary === false) {
        return (
            <div className="flex-1 p-8 font-sans text-center flex flex-col justify-center items-center min-h-[400px]">
                <h1 className="text-3xl font-serif font-bold text-charcoal mb-4">Module Disabled</h1>
                <p className="text-charcoal/60 max-w-md">The Book Library module is not active for this archive site.</p>
            </div>
        );
    }

    // Search and filter parameters from URL
    const search = searchParams.get('q') || '';
    const selectedLocation = searchParams.get('location') || 'All';
    const selectedStatus = searchParams.get('status') || 'All';
    const selectedCondition = searchParams.get('condition') || 'All';
    const sortBy = searchParams.get('sort') || 'title_asc';

    const [books, setBooks] = useState<LibraryBook[]>([]);
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [localSearch, setLocalSearch] = useState(search);
    const [visibleCount, setVisibleCount] = useState(24);
    const PAGE_SIZE = 24;

    // Sync local search input with URL search param
    useEffect(() => {
        setLocalSearch(search);
    }, [search]);

    // Debounce updating URL parameter for search
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
        const fetchData = async () => {
            try {
                // Fetch books
                const booksSnapshot = await getDocs(query(collection(db, 'library_books'), orderBy('title', 'asc')));
                const booksData = booksSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as LibraryBook[];
                setBooks(booksData);

                // Fetch locations for filter
                const locationsSnapshot = await getDocs(collection(db, 'locations'));
                const locationsData = locationsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as MuseumLocation[];
                locationsData.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
                setLocations(locationsData);
            } catch (err) {
                console.error("Error fetching library data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Create a map of location id to display name
    const locationMap = useMemo(() => {
        const map: Record<string, string> = {};
        locations.forEach(loc => {
            map[loc.id] = loc.name;
        });
        return map;
    }, [locations]);

    // Filter books
    const filteredBooks = useMemo(() => {
        return books.filter(book => {
            const queryLower = search.toLowerCase();
            const matchesSearch = 
                book.title?.toLowerCase().includes(queryLower) ||
                book.authors?.some(author => author.toLowerCase().includes(queryLower)) ||
                book.description?.toLowerCase().includes(queryLower) ||
                book.isbn?.toLowerCase().includes(queryLower) ||
                book.call_number?.toLowerCase().includes(queryLower) ||
                book.subjects?.some(sub => sub.toLowerCase().includes(queryLower));

            const matchesLocation = selectedLocation === 'All' || 
                book.museum_location_ids?.includes(selectedLocation);

            const matchesStatus = selectedStatus === 'All' || book.status === selectedStatus;
            const matchesCondition = selectedCondition === 'All' || book.condition === selectedCondition;

            return matchesSearch && matchesLocation && matchesStatus && matchesCondition;
        });
    }, [books, search, selectedLocation, selectedStatus, selectedCondition]);

    // Sort books
    const sortedBooks = useMemo(() => {
        return [...filteredBooks].sort((a, b) => {
            switch (sortBy) {
                case 'title_asc':
                    return (a.title || '').localeCompare(b.title || '');
                case 'title_desc':
                    return (b.title || '').localeCompare(a.title || '');
                case 'author_asc': {
                    const authA = a.authors?.[0] || '';
                    const authB = b.authors?.[0] || '';
                    return authA.localeCompare(authB);
                }
                case 'publish_desc': {
                    const yrA = parseInt(String(a.publish_year || 0)) || 0;
                    const yrB = parseInt(String(b.publish_year || 0)) || 0;
                    return yrB - yrA;
                }
                case 'created_desc':
                    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                default:
                    return 0;
            }
        });
    }, [filteredBooks, sortBy]);

    const handleClearFilters = () => {
        setSearchParams(new URLSearchParams(), { replace: true });
        setLocalSearch('');
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                <p className="font-serif text-charcoal/60 text-lg italic">Loading library catalog...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-tan-light/30 pb-6">
                <div>
                    <h1 className="font-serif text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
                        SAHS Library Catalog
                    </h1>
                    <p className="font-serif text-charcoal-light/80 italic mt-1.5 text-base">
                        Browse, search, and find reference books within the museum collections.
                    </p>
                </div>
                {isSAHSUser && (
                    <Link
                        to="/library/add"
                        className="flex items-center gap-2 bg-tan text-white hover:bg-tan-dark px-5 py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg text-sm tracking-wide"
                    >
                        <Plus size={18} />
                        Add Library Book
                    </Link>
                )}
            </div>

            {/* Lending Notice Banner */}
            <div className="bg-amber-50/70 border border-amber-200/50 rounded-2xl p-4 flex items-start gap-3 text-amber-800 text-sm animate-in fade-in slide-in-from-top-4 duration-300 shadow-sm">
                <Info size={18} className="shrink-0 mt-0.5 text-amber-600" />
                <div className="space-y-0.5">
                    <h4 className="font-bold text-amber-900">Research & Reference Library Notice</h4>
                    <p className="text-amber-800/90 leading-relaxed font-medium">
                        Books in our collection are reference-only and are currently <strong>not available for check out</strong>. However, all items can be browsed and enjoyed here in person at the Senoia Area Historical Society library.
                    </p>
                </div>
            </div>

            {/* Search and Filters panel */}
            <div className="bg-white border border-tan-light/50 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* Search field */}
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={20} />
                        <input
                            type="text"
                            placeholder="Search by Title, Author, ISBN, Call Number or Subject..."
                            value={localSearch}
                            onChange={(e) => setLocalSearch(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-cream/20 border border-tan-light/50 rounded-xl outline-none focus:ring-4 focus:ring-tan/10 focus:border-tan transition-all font-sans text-charcoal text-base font-medium placeholder-charcoal/40"
                        />
                    </div>

                    {/* Sorting */}
                    <div className="w-full lg:w-64">
                        <select
                            value={sortBy}
                            onChange={(e) => updateParam('sort', e.target.value)}
                            className="w-full px-4 py-3 bg-cream/20 border border-tan-light/50 rounded-xl outline-none focus:border-tan font-sans text-charcoal font-semibold text-sm transition-all cursor-pointer h-[48px]"
                        >
                            <option value="title_asc">Sort: Title (A-Z)</option>
                            <option value="title_desc">Sort: Title (Z-A)</option>
                            <option value="author_asc">Sort: Author (A-Z)</option>
                            <option value="publish_desc">Sort: Publication Year (Newest)</option>
                            <option value="created_desc">Sort: Recently Cataloged</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                    {/* Location Filter */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wider">Museum Location</label>
                        <select
                            value={selectedLocation}
                            onChange={(e) => updateParam('location', e.target.value)}
                            className="w-full px-4 py-2.5 bg-cream/20 border border-tan-light/50 rounded-lg outline-none focus:border-tan text-sm transition-all text-charcoal font-medium"
                        >
                            <option value="All">All Locations</option>
                            {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wider">Lending Status</label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => updateParam('status', e.target.value)}
                            className="w-full px-4 py-2.5 bg-cream/20 border border-tan-light/50 rounded-lg outline-none focus:border-tan text-sm transition-all text-charcoal font-medium"
                        >
                            <option value="All">All Statuses</option>
                            <option value="Available">Available</option>
                            <option value="Reference Only">Reference Only</option>
                            <option value="Checked Out">Checked Out</option>
                            <option value="Missing">Missing</option>
                        </select>
                    </div>

                    {/* Condition Filter */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wider">Book Condition</label>
                        <select
                            value={selectedCondition}
                            onChange={(e) => updateParam('condition', e.target.value)}
                            className="w-full px-4 py-2.5 bg-cream/20 border border-tan-light/50 rounded-lg outline-none focus:border-tan text-sm transition-all text-charcoal font-medium"
                        >
                            <option value="All">All Conditions</option>
                            <option value="Excellent">Excellent</option>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                            <option value="Poor">Poor</option>
                            <option value="Fragile">Fragile</option>
                        </select>
                    </div>

                    {/* Clear Filters */}
                    <div className="flex items-end">
                        <button
                            onClick={handleClearFilters}
                            className="w-full py-2.5 px-4 bg-charcoal/5 hover:bg-charcoal/10 border border-tan-light/30 rounded-lg font-bold text-charcoal text-sm transition-all flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={16} />
                            Reset Filters
                        </button>
                    </div>
                </div>
            </div>

            {/* Results status */}
            <div className="flex justify-between items-center px-2">
                <p className="text-sm font-semibold text-charcoal/60">
                    Showing {Math.min(sortedBooks.length, visibleCount)} of {sortedBooks.length} books found
                </p>
            </div>

            {/* Books Grid */}
            {sortedBooks.length === 0 ? (
                <div className="bg-white border border-dashed border-tan-light/60 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4">
                    <div className="w-16 h-16 bg-tan/10 text-tan rounded-full flex items-center justify-center mx-auto">
                        <BookOpen size={28} />
                    </div>
                    <h3 className="font-serif text-xl font-bold text-charcoal">No books match your criteria</h3>
                    <p className="text-charcoal/60 text-sm max-w-md mx-auto">
                        Try modifying your search keywords or resetting your location and status filters.
                    </p>
                    <button
                        onClick={handleClearFilters}
                        className="bg-tan text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-tan-dark transition-all"
                    >
                        Reset Search Filters
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {sortedBooks.slice(0, visibleCount).map((book) => {
                        const hasCover = !!book.cover_image_url;
                        const statusColors: Record<string, string> = {
                            'Available': 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
                            'Reference Only': 'bg-amber-50 text-amber-700 border-amber-200/50',
                            'Checked Out': 'bg-blue-50 text-blue-700 border-blue-200/50',
                            'Missing': 'bg-rose-50 text-rose-700 border-rose-200/50',
                        };

                        return (
                            <Link
                                key={book.id}
                                to={`/library/${book.id}`}
                                className="group bg-white border border-tan-light/40 rounded-2xl overflow-hidden flex flex-col hover:-translate-y-1 transition-all duration-300 hover:shadow-lg shadow-sm"
                            >
                                {/* Cover Image Container */}
                                <div className="aspect-[4/5] bg-cream/10 border-b border-tan-light/10 relative overflow-hidden flex items-center justify-center">
                                    {hasCover ? (
                                        <img
                                            src={book.cover_image_url!}
                                            alt={book.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            loading="lazy"
                                        />
                                    ) : (
                                        /* Heritage Book Placeholder Cover */
                                        <div className="w-full h-full bg-gradient-to-tr from-tan-dark/10 to-tan/5 p-6 flex flex-col justify-between text-center select-none">
                                            <div className="text-center">
                                                <BookOpen size={32} className="text-tan/40 mx-auto mt-2" />
                                            </div>
                                            <div className="space-y-2">
                                                <p className="font-serif text-sm font-bold text-charcoal/80 line-clamp-3 leading-snug">
                                                    {book.title}
                                                </p>
                                                <p className="text-[11px] font-sans font-semibold text-charcoal/50 uppercase tracking-wider">
                                                    {book.authors?.join(', ')}
                                                </p>
                                            </div>
                                            <div className="text-xs text-charcoal/40 font-mono">
                                                {book.call_number || "NO CALL #"}
                                            </div>
                                        </div>
                                    )}

                                    {/* Availability Status Badge */}
                                    <span className={`absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full border shadow-sm backdrop-blur-[1px] ${statusColors[book.status] || 'bg-gray-100 text-gray-800'}`}>
                                        {book.status}
                                    </span>
                                    
                                    {/* Call Number Badge */}
                                    {book.call_number && (
                                        <span className="absolute bottom-3 left-3 bg-charcoal/80 text-cream text-[10px] font-mono px-2 py-0.5 rounded shadow-sm">
                                            {book.call_number}
                                        </span>
                                    )}
                                </div>

                                {/* Content Details */}
                                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                                    <div className="space-y-1">
                                        <h3 className="font-serif text-base font-bold text-charcoal line-clamp-2 leading-tight group-hover:text-tan transition-colors">
                                            {book.title}
                                        </h3>
                                        <p className="text-sm font-sans font-medium text-charcoal-light line-clamp-1">
                                            {book.authors?.join(', ')}
                                        </p>
                                    </div>

                                    <div className="space-y-2 border-t border-tan-light/20 pt-3">
                                        {/* Physical Locations */}
                                        {book.museum_location_ids && book.museum_location_ids.length > 0 ? (
                                            <div className="flex items-center gap-1.5 text-xs text-charcoal/60">
                                                <MapPin size={14} className="text-tan shrink-0" />
                                                <span className="truncate font-semibold">
                                                    {book.museum_location_ids.map(id => locationMap[id] || id).join(', ')}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-xs text-charcoal/40 italic">
                                                <MapPin size={14} className="shrink-0" />
                                                <span>Unspecified location</span>
                                            </div>
                                        )}

                                        {/* Subjects Tags */}
                                        {book.subjects && book.subjects.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {book.subjects.slice(0, 2).map((subject, idx) => (
                                                    <span key={idx} className="flex items-center gap-0.5 bg-cream/35 text-charcoal/60 px-1.5 py-0.5 rounded text-[10px] font-bold border border-tan-light/20">
                                                        <Tag size={8} />
                                                        {subject}
                                                    </span>
                                                ))}
                                                {book.subjects.length > 2 && (
                                                    <span className="bg-cream/35 text-charcoal/50 px-1 py-0.5 rounded text-[9px] font-bold border border-tan-light/10">
                                                        +{book.subjects.length - 2}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}

            {/* Load More Button */}
            {sortedBooks.length > visibleCount && (
                <div className="text-center pt-4">
                    <button
                        onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                        className="px-6 py-3 bg-white hover:bg-cream/20 text-charcoal border border-tan-light rounded-xl font-bold transition-all shadow-sm hover:shadow"
                    >
                        Load More Books
                    </button>
                </div>
            )}
        </div>
    );
}
