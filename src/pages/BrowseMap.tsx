import { useState, useEffect } from 'react';
import { MapPin, Info } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { ArchiveItem } from '../types/database';
import { ArchiveMap } from '../components/ArchiveMap';
import { useAuth } from '../contexts/AuthContext';

export function BrowseMap() {
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const { isSAHSUser } = useAuth();

    useEffect(() => {
        const fetchItems = async () => {
            try {
                // Fetch items
                const q = query(collection(db, 'archive_items'), orderBy('created_at', 'desc'));
                const querySnapshot = await getDocs(q);
                const itemsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArchiveItem[];

                // Fetch collections to determine privacy
                const collectionsSnapshot = await getDocs(collection(db, 'collections'));
                const privateCollections = new Set(
                    collectionsSnapshot.docs
                        .filter(doc => doc.data().is_private === true)
                        .map(doc => doc.id)
                );

                // Filter for public view if not curator
                const visibleItems = isSAHSUser ? itemsData : itemsData.filter(item => {
                    const isItemPrivate = item.is_private === true;
                    const isCollectionPrivate = item.collection_id ? privateCollections.has(item.collection_id) : false;
                    return !isItemPrivate && !isCollectionPrivate;
                });

                setItems(visibleItems);
            } catch (error) {
                console.error("Error fetching map items:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchItems();
    }, [isSAHSUser]);

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto py-24 text-center">
                <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-charcoal/60 font-serif text-xl italic">Loading Map View...</p>
            </div>
        );
    }

    const mapItems = items.filter(item => item.coordinates);

    return (
        <div className="max-w-7xl mx-auto h-full flex flex-col pb-12 animate-in fade-in duration-500">
            <div className="mb-10 text-center md:text-left">
                <div className="inline-flex items-center gap-2 text-tan font-black uppercase tracking-[0.25em] mb-4">
                    <MapPin size={20} />
                    Discovery Tools
                </div>
                <h1 className="text-4xl md:text-6xl font-serif font-bold text-charcoal mb-4 tracking-tight">
                    Map View
                </h1>
                <p className="text-xl text-charcoal-light max-w-3xl leading-relaxed">
                    Explore the history of Senoia through space. This map displays archive items, historic figures, and organizations based on their historical geographic locations.
                </p>
            </div>

            <div className="relative group">
                <div className="absolute inset-0 bg-tan/5 rounded-3xl blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                <div className="relative bg-white p-4 md:p-6 rounded-[2rem] border border-tan-light shadow-xl overflow-hidden">
                    <ArchiveMap items={mapItems} />
                    
                    <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4 px-2">
                        <div className="flex items-center gap-3 text-charcoal/60 text-sm">
                            <Info size={18} className="text-tan" />
                            <span>Showing {mapItems.length} locations across the archive.</span>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-charcoal border border-tan-light"></div>
                                <span className="text-xs font-bold text-charcoal/60 uppercase tracking-widest">Multiple Items</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-blue-500 border border-white"></div>
                                <span className="text-xs font-bold text-charcoal/60 uppercase tracking-widest">Single Item</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="bg-cream/30 p-8 rounded-2xl border border-tan-light/50">
                    <h3 className="font-serif font-bold text-2xl text-charcoal mb-4">How to use the Map</h3>
                    <ul className="space-y-4 text-charcoal-light leading-relaxed">
                        <li className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-tan text-white flex items-center justify-center shrink-0 font-bold text-xs mt-1">1</span>
                            <span><strong>Clusters:</strong> Large circles with numbers represent multiple items in an area. Click them to zoom in.</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-tan text-white flex items-center justify-center shrink-0 font-bold text-xs mt-1">2</span>
                            <span><strong>Markers:</strong> Click individual markers to see a preview of the historical item, photo, or figure.</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-tan text-white flex items-center justify-center shrink-0 font-bold text-xs mt-1">3</span>
                            <span><strong>Details:</strong> Use the "View Details" link inside a marker popup to open the full archive entry.</span>
                        </li>
                    </ul>
                </div>
                <div className="flex flex-col justify-center">
                    <h3 className="font-serif font-bold text-2xl text-charcoal mb-4">A Note on Accuracy</h3>
                    <p className="text-charcoal-light leading-relaxed italic">
                        The locations shown on this map are based on historical records, property deeds, and biographical information. While we strive for geographic precision, some markers represent general areas (like "Main Street") if a specific street number was not available in our records.
                    </p>
                </div>
            </div>
        </div>
    );
}
