import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { MapPin, Box, ChevronLeft, Folder, Loader2 } from 'lucide-react';
import type { MuseumLocation, Room } from '../types/database';

export function RoomDetail() {
    const { id } = useParams();
    const [room, setRoom] = useState<Room | null>(null);
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRoomData = async () => {
            if (!id) return;
            setLoading(true);
            try {
                // Fetch Room
                const roomRef = doc(db, 'rooms', id);
                const roomSnap = await getDoc(roomRef);
                
                if (roomSnap.exists()) {
                    setRoom({ docId: roomSnap.id, ...roomSnap.data() } as Room);
                }

                // Fetch Locations in this Room
                const q = query(collection(db, 'locations'), where('room_id', '==', id));
                const querySnapshot = await getDocs(q);
                const locData = querySnapshot.docs.map(doc => ({
                    docId: doc.id,
                    ...doc.data()
                })) as MuseumLocation[];
                
                setLocations(locData);
            } catch (error) {
                console.error("Error fetching room details:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRoomData();
    }, [id]);

    if (loading) {
        return (
            <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-12 h-12 text-tan animate-spin" />
                <p className="font-serif text-charcoal/60 text-lg">Exploring the museum wing...</p>
            </div>
        );
    }

    if (!room) {
        return (
            <div className="max-w-6xl mx-auto py-24 text-center">
                <h2 className="text-3xl font-serif text-charcoal mb-4">Wing not found</h2>
                <Link to="/interactive-map" className="text-tan font-bold hover:underline">
                    &larr; Return to Museum Map
                </Link>
            </div>
        );
    }

    const topLevelLocations = locations.filter(l => !l.parent_location_id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    return (
        <div className="min-h-screen bg-cream animate-in fade-in duration-700 pb-20">
            {/* Header / Breadcrumbs */}
            <div className="max-w-7xl mx-auto px-6 pt-12">
                <Link to="/interactive-map" className="inline-flex items-center text-[10px] font-black text-tan uppercase tracking-[0.3em] mb-12 hover:text-charcoal transition-all group">
                    <ChevronLeft size={14} className="mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Museum Map
                </Link>

                <div className="bg-white rounded-[60px] border border-tan-light/20 overflow-hidden shadow-2xl shadow-tan/5 mb-20 flex flex-col lg:flex-row relative">
                    {/* Decorative Element */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-tan/5 rounded-bl-[200px] -mr-20 -mt-20 pointer-events-none" />
                    
                    <div className="lg:w-2/5 bg-tan-light/5 p-16 flex items-center justify-center border-b lg:border-b-0 lg:border-r border-tan-light/10">
                        <div className="relative group/icon">
                            <div className="absolute inset-0 bg-tan/20 blur-3xl rounded-full scale-0 group-hover/icon:scale-100 transition-transform duration-1000 opacity-30" />
                            <Folder size={160} className="text-tan/10 relative z-10" fill="currentColor" />
                            <MapPin size={56} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-tan relative z-20 transition-transform duration-500 group-hover/icon:scale-110" />
                        </div>
                    </div>
                    <div className="p-12 md:p-20 lg:p-24 flex-1 flex flex-col justify-center relative z-10">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="h-px w-10 bg-tan/30" />
                            <span className="text-[10px] font-black text-tan uppercase tracking-[0.4em]">The SAHS Archive</span>
                        </div>
                        <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif font-bold mb-8 text-charcoal tracking-tight leading-[0.9]">
                            {room.name}
                        </h1>
                        <p className="text-charcoal/60 text-xl md:text-2xl font-serif italic mb-12 max-w-2xl leading-relaxed">
                            {room.description || `A curated collection of historical artifacts maintained within the ${room.name}.`}
                        </p>
                        <div className="flex items-center gap-8">
                            <div className="flex items-center gap-3 px-6 py-3 bg-cream rounded-2xl border border-tan-light/20">
                                <MapPin size={20} className="text-tan" /> 
                                <span className="text-sm font-bold text-charcoal tracking-wide">{topLevelLocations.length} Display Areas</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <h2 className="text-4xl font-serif font-bold text-charcoal tracking-tight mb-2">
                            Exhibition Contents
                        </h2>
                        <p className="text-charcoal/40 text-sm font-serif italic">Browse the specific locations within this wing</p>
                    </div>
                    <div className="h-px flex-1 bg-tan-light/20 hidden md:block mx-8 mb-4" />
                </div>

                {topLevelLocations.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {topLevelLocations.map(loc => {
                            const nestedCount = locations.filter(l => l.parent_location_id === loc.docId || l.parent_location_id === loc.id).length;
                            return (
                            <Link 
                                key={loc.docId}
                                to={`/locations/${loc.id}`}
                                className="group bg-white rounded-[40px] border border-tan-light/10 p-10 hover:shadow-[0_32px_64px_-12px_rgba(157,126,94,0.15)] hover:border-tan/40 transition-all duration-500 flex flex-col h-full relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-tan/5 rounded-bl-[60px] -mr-8 -mt-8 group-hover:scale-110 transition-transform duration-700" />
                                
                                <div className="flex justify-between items-start mb-10 relative z-10">
                                    <div className="p-5 bg-tan/5 text-tan rounded-2xl group-hover:bg-tan group-hover:text-white shadow-inner transition-all duration-500">
                                        <MapPin size={28} />
                                    </div>
                                    <span className="text-[10px] font-mono font-bold text-tan/40 uppercase tracking-[0.2em]">{loc.id}</span>
                                </div>
                                
                                <div className="relative z-10 flex-grow">
                                    <h3 className="text-3xl font-serif font-bold text-charcoal mb-4 group-hover:text-tan transition-colors leading-tight">
                                        {loc.name}
                                    </h3>
                                    <p className="text-charcoal/50 text-base font-serif italic mb-8 line-clamp-2 leading-relaxed">
                                        {loc.description || `A dedicated exhibition space within the ${room.name}.`}
                                    </p>
                                </div>

                                <div className="flex items-center justify-between pt-8 border-t border-tan-light/10 relative z-10">
                                    <div className="flex flex-col gap-1 text-xs font-black text-charcoal/30 uppercase tracking-[0.2em] group-hover:text-charcoal transition-colors">
                                        <div className="flex items-center gap-3">
                                            <Box size={16} /> View Collection
                                        </div>
                                        {nestedCount > 0 && (
                                            <div className="text-tan/60 text-[9px] mt-1 group-hover:text-tan">
                                                Includes {nestedCount} Nested Box{nestedCount !== 1 ? 'es' : ''}
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-cream flex items-center justify-center group-hover:bg-tan group-hover:text-white transition-all transform group-hover:translate-x-2">
                                        <ChevronLeft size={20} className="rotate-180" />
                                    </div>
                                </div>
                            </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-white/50 border-2 border-dashed border-tan-light/30 rounded-[40px] py-32 text-center">
                        <MapPin size={48} className="mx-auto text-tan/20 mb-6" />
                        <h3 className="text-2xl font-serif font-bold text-charcoal/40 mb-2">No locations established</h3>
                        <p className="text-charcoal/30 max-w-sm mx-auto">This room hasn't been populated with display cases or shelves yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
