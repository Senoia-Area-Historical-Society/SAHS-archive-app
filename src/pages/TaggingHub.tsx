import { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { Camera, MapPin, Box, CheckCircle2, AlertCircle, ArrowRight, History, Loader2, X, Search, Trash2, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { ArchiveItem, MuseumLocation } from '../types/database';
import { QRScanner } from '../components/QRScanner';

export function TaggingHub() {
    const { user } = useAuth();
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    
    // State for the tagging process
    const [selectedItems, setSelectedItems] = useState<ArchiveItem[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<MuseumLocation | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchId, setSearchId] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Conflict State
    const [conflictedItems, setConflictedItems] = useState<ArchiveItem[]>([]);
    const [currentConflictIndex, setCurrentConflictIndex] = useState(-1);

    const parseIdFromData = (data: string): { type: 'item' | 'loc' | 'unknown', id: string } => {
        // Handle full URLs (e.g. https://domain.com/items/ID)
        if (data.includes('/items/')) {
            const parts = data.split('/items/');
            // Get the ID after /items/ and before any query params
            const potentialId = parts[parts.length - 1].split('?')[0].split('/')[0];
            return { type: 'item', id: potentialId };
        }
        
        // Handle legacy/internal formats
        if (data.startsWith('item:')) return { type: 'item', id: data.replace('item:', '') };
        if (data.startsWith('loc:')) return { type: 'loc', id: data.replace('loc:', '') };
        
        return { type: 'unknown', id: '' };
    };

    const handleScan = async (data: string) => {
        setIsScannerOpen(false);
        setIsLoading(true);
        setMessage(null);

        const { type, id } = parseIdFromData(data);

        try {
            if (type === 'item') {
                const itemDoc = await getDoc(doc(db, 'archive_items', id));
                if (itemDoc.exists()) {
                    const newItem = { id: itemDoc.id, ...itemDoc.data() } as ArchiveItem;
                    setSelectedItems(prev => {
                        if (!prev.find(i => i.id === newItem.id)) {
                            return [...prev, newItem];
                        }
                        setMessage({ type: 'error', text: "Item already in list." });
                        return prev;
                    });
                } else {
                    setMessage({ type: 'error', text: "Item not found in database." });
                }
            } else if (type === 'loc') {
                const locQuery = query(collection(db, 'locations'), where('id', '==', id));
                const locSnapshot = await getDocs(locQuery);
                
                if (!locSnapshot.empty) {
                    const locData = { id: locSnapshot.docs[0].id, ...locSnapshot.docs[0].data() } as MuseumLocation;
                    setSelectedLocation(locData);
                } else {
                    setMessage({ type: 'error', text: "Location code not recognized." });
                }
            } else {
                setMessage({ type: 'error', text: "Invalid QR code format. Please scan a SAHS tracking code or Item URL." });
            }
        } catch (error) {
            console.error("Scan processing error:", error);
            setMessage({ type: 'error', text: "An error occurred while processing the scan." });
        } finally {
            setIsLoading(false);
        }
    };

    const handleManualSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchId.trim()) return;

        setIsLoading(true);
        setMessage(null);

        try {
            const trimmedId = searchId.trim();
            const numericId = parseInt(trimmedId, 10);

            // Fetch either by exact string or exact number if applicable
            const queries = [
                query(collection(db, 'archive_items'), where('artifact_id', '==', trimmedId))
            ];

            if (!isNaN(numericId)) {
                queries.push(query(collection(db, 'archive_items'), where('artifact_id', '==', numericId)));
            }

            let foundDoc = null;
            for (const qry of queries) {
                const snap = await getDocs(qry);
                if (!snap.empty) {
                    foundDoc = snap.docs[0];
                    break;
                }
            }

            if (foundDoc) {
                const newItem = { id: foundDoc.id, ...foundDoc.data() } as ArchiveItem;
                if (!selectedItems.find(i => i.id === newItem.id)) {
                    setSelectedItems(prev => [...prev, newItem]);
                    setSearchId('');
                } else {
                    setMessage({ type: 'error', text: "Item already in list." });
                }
            } else {
                // If not found by artifact_id, try searching by Firestore Doc ID
                const itemDoc = await getDoc(doc(db, 'archive_items', trimmedId));
                if (itemDoc.exists()) {
                    const newItem = { id: itemDoc.id, ...itemDoc.data() } as ArchiveItem;
                    if (!selectedItems.find(i => i.id === newItem.id)) {
                        setSelectedItems(prev => [...prev, newItem]);
                        setSearchId('');
                    } else {
                        setMessage({ type: 'error', text: "Item already in list." });
                    }
                } else {
                    setMessage({ type: 'error', text: "Item not found by ID or system ID." });
                }
            }
        } catch (error) {
            console.error("Manual search error:", error);
            setMessage({ type: 'error', text: "Search failed." });
        } finally {
            setIsLoading(false);
        }
    };

    const removeItem = (id: string) => {
        setSelectedItems(prev => prev.filter(item => item.id !== id));
    };

    const performTagging = async (forceResolution?: { itemId: string, mode: 'move' | 'both' }[]) => {
        if (selectedItems.length === 0 || !selectedLocation) return;

        // 1. Check for conflicts if not already resolving
        if (!forceResolution) {
            const conflicts = selectedItems.filter(item => {
                const hasExisting = (item.museum_location_id && item.museum_location_id !== selectedLocation.id) || 
                                   (item.museum_location_ids && item.museum_location_ids.length > 0 && !item.museum_location_ids.includes(selectedLocation.id)) ||
                                   (item.museum_location && !item.museum_location_ids?.includes(selectedLocation.id) && item.museum_location_id !== selectedLocation.id);
                return hasExisting;
            });

            if (conflicts.length > 0) {
                setConflictedItems(conflicts);
                setCurrentConflictIndex(0);
                return;
            }
        }

        setIsLoading(true);
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const email = user?.email || 'unknown';

            selectedItems.forEach(item => {
                const itemRef = doc(db, 'archive_items', item.id);
                const resolution = forceResolution?.find(r => r.itemId === item.id);
                
                let newLocationIds: string[] = [];
                if (resolution?.mode === 'both') {
                    const existing = item.museum_location_ids || [];
                    const legacy = item.museum_location_id;
                    newLocationIds = Array.from(new Set([...existing, ...(legacy ? [legacy] : []), selectedLocation.id]));
                } else {
                    newLocationIds = [selectedLocation.id];
                }

                batch.update(itemRef, {
                    museum_location_id: selectedLocation.id,
                    museum_location_ids: newLocationIds,
                    last_tagged_at: now,
                    last_tagged_by: email,
                    stage: 'Housed'
                });
            });

            await batch.commit();

            setMessage({ 
                type: 'success', 
                text: `Successfully tagged ${selectedItems.length} item(s) to "${selectedLocation.name}"` 
            });
            
            // Reset
            setSelectedItems([]);
            setSelectedLocation(null);
            setConflictedItems([]);
            setCurrentConflictIndex(-1);
        } catch (error) {
            console.error("Tagging error:", error);
            setMessage({ type: 'error', text: "Failed to update item locations." });
        } finally {
            setIsLoading(false);
        }
    };

    const resetFlow = () => {
        setSelectedItems([]);
        setSelectedLocation(null);
        setMessage(null);
    };

    return (
        <div className="max-w-5xl mx-auto flex flex-col h-full animate-in fade-in duration-500 pb-20">
            {/* Conflict Resolution Modal */}
            {currentConflictIndex >= 0 && conflictedItems[currentConflictIndex] && (
                <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-tan/10 p-8 border-b border-tan/20 text-center">
                            <div className="w-16 h-16 bg-tan/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <MapPin size={32} className="text-tan" />
                            </div>
                            <h2 className="text-2xl font-serif font-bold text-charcoal mb-2">Location Conflict</h2>
                            <p className="text-charcoal/60 text-sm italic">"{conflictedItems[currentConflictIndex].title}"</p>
                        </div>
                        
                        <div className="p-8">
                            <p className="text-charcoal/80 mb-6 leading-relaxed">
                                This artifact is currently listed in <span className="font-bold text-tan">{conflictedItems[currentConflictIndex].museum_location_id || conflictedItems[currentConflictIndex].museum_location_ids?.[0]}</span>. 
                                How would you like to update its records?
                            </p>
                            
                            <div className="grid gap-3">
                                <button 
                                    onClick={() => {
                                        if (currentConflictIndex + 1 < conflictedItems.length) {
                                            setCurrentConflictIndex(currentConflictIndex + 1);
                                        } else {
                                            performTagging([]); // Proceed as default move
                                        }
                                    }}
                                    className="w-full py-4 px-6 bg-tan text-white rounded-xl font-bold hover:bg-charcoal transition-all shadow-md flex items-center justify-between group"
                                >
                                    <span>Relocate to {selectedLocation?.name}</span>
                                    <ArrowRight size={18} className="opacity-40 group-hover:opacity-100" />
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        const resolutions = conflictedItems.map((item, idx) => ({
                                            itemId: item.id!,
                                            mode: idx === currentConflictIndex ? 'both' : 'move'
                                        } as { itemId: string, mode: 'move' | 'both' }));
                                        
                                        performTagging(resolutions);
                                    }}
                                    className="w-full py-4 px-6 bg-white border-2 border-tan-light text-tan rounded-xl font-bold hover:bg-tan/5 transition-all flex items-center justify-between group"
                                >
                                    <span>List in Both Locations</span>
                                    <Plus size={18} className="opacity-40 group-hover:opacity-100" />
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        setConflictedItems([]);
                                        setCurrentConflictIndex(-1);
                                        setIsLoading(false);
                                    }}
                                    className="w-full py-3 px-6 text-charcoal/40 font-bold hover:text-red-500 transition-colors text-sm"
                                >
                                    Cancel Operation
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end mb-8 border-b border-tan-light/50 pb-6 gap-6">
                <div className="flex-1">
                    <h1 className="text-3xl md:text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <History className="text-tan" size={32} />
                        Tagging Hub
                    </h1>
                    <p className="text-charcoal/70 text-base md:text-lg max-w-2xl">
                        Batch process artifacts by scanning or entering their ID numbers.
                    </p>
                </div>
                
                <form onSubmit={handleManualSearch} className="flex gap-2 w-full lg:w-auto">
                    <div className="relative flex-1 lg:min-w-[350px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/30" size={20} />
                        <input
                            type="text"
                            placeholder="Enter Artifact ID # (e.g. 1429)"
                            value={searchId}
                            onChange={(e) => setSearchId(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 md:py-5 bg-white border-2 border-tan-light/50 text-lg md:text-xl font-serif rounded-2xl focus:ring-2 focus:ring-tan/20 shadow-md transition-all outline-none placeholder:text-charcoal/20"
                        />
                    </div>
                    <button 
                        type="submit"
                        disabled={!searchId.trim() || isLoading}
                        className="bg-tan text-white px-8 py-3 rounded-xl font-bold hover:bg-charcoal transition-all disabled:opacity-50 shadow-sm active:scale-95"
                    >
                        Add
                    </button>
                </form>
            </div>

            {message && (
                <div className={`mb-8 p-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-2 duration-300 ${
                    message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-800 border border-red-100'
                }`}>
                    {message.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                    <p className="font-medium">{message.text}</p>
                    <button onClick={() => setMessage(null)} className="ml-auto opacity-50 hover:opacity-100 p-1">
                        <X size={18} />
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 mb-8">
                {/* Items Selection Panel */}
                <div className="md:col-span-2 space-y-4">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-sm font-black text-charcoal/40 uppercase tracking-[0.2em]">Selected Artifacts ({selectedItems.length})</h2>
                        {selectedItems.length > 0 && (
                            <button onClick={() => setSelectedItems([])} className="text-xs font-bold text-red-500 hover:underline">Clear All</button>
                        )}
                    </div>
                    
                    <div className={`min-h-[300px] rounded-3xl border-2 border-dashed flex flex-col ${
                        selectedItems.length > 0 ? 'bg-tan/5 border-tan/30' : 'bg-white border-tan-light/40'
                    }`}>
                        {selectedItems.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-charcoal/40">
                                <Box size={48} className="mb-4 opacity-20" />
                                <p className="font-serif italic mb-6">No artifacts staged for tagging yet.</p>
                                <button 
                                    onClick={() => { setIsScannerOpen(true); }}
                                    className="bg-charcoal text-white px-8 py-3 rounded-xl font-bold hover:bg-charcoal-light transition-all flex items-center gap-2 shadow-sm"
                                >
                                    <Camera size={20} /> Scan Artifacts
                                </button>
                            </div>
                        ) : (
                            <div className="p-4 space-y-2">
                                {selectedItems.map(item => (
                                    <div key={item.id} className="bg-white p-4 rounded-2xl border border-tan-light/30 shadow-sm flex items-center justify-between group animate-in slide-in-from-left-2 duration-300">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-cream rounded-lg flex items-center justify-center text-tan">
                                                <Box size={20} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-charcoal leading-tight">{item.title}</h4>
                                                <p className="text-[10px] font-black text-tan/60 uppercase tracking-widest">{item.artifact_id || 'ID UNKNOWN'}</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => removeItem(item.id)}
                                            className="p-3 text-charcoal/20 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                ))}
                                <button 
                                    onClick={() => { setIsScannerOpen(true); }}
                                    className="w-full py-5 bg-tan/10 border-4 border-dashed border-tan/40 rounded-2xl flex items-center justify-center gap-3 text-tan font-black text-lg hover:bg-tan hover:text-white hover:border-tan transition-all duration-300 mt-4 shadow-sm"
                                >
                                    <Plus size={24} /> Add More via Scan
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Location Panel */}
                <div className="space-y-4">
                    <h2 className="text-sm font-black text-charcoal/40 uppercase tracking-[0.2em]">Target Location</h2>
                    <div className={`p-8 rounded-3xl border-2 transition-all flex flex-col items-center text-center gap-4 h-full min-h-[300px] ${
                        selectedLocation 
                            ? 'bg-tan/5 border-tan shadow-sm' 
                            : 'bg-white border-tan-light/5 border-dashed hover:border-tan/30 cursor-pointer'
                    }`} onClick={() => !selectedLocation && (setIsScannerOpen(true))}>
                        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-2 ${
                            selectedLocation ? 'bg-tan text-white' : 'bg-cream text-tan'
                        }`}>
                            <MapPin size={40} />
                        </div>
                        
                        {selectedLocation ? (
                            <>
                                <div className="flex-1">
                                    <h3 className="font-serif font-bold text-2xl text-charcoal mb-2">{selectedLocation.name}</h3>
                                    <p className="text-xs font-black text-tan uppercase tracking-widest">Active Destination</p>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setSelectedLocation(null); }}
                                    className="text-xs text-charcoal/40 hover:text-red-500 font-bold uppercase tracking-wider bg-black/5 px-4 py-2 rounded-lg"
                                >
                                    Change Location
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="flex-1">
                                    <h3 className="font-serif font-bold text-xl text-charcoal mb-2">Identify Place</h3>
                                    <p className="text-sm text-charcoal/60 px-4 leading-relaxed italic">
                                        Scan the destination code to stage the batch move.
                                    </p>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setIsScannerOpen(true); }}
                                    className="bg-tan text-white px-8 py-5 rounded-2xl font-black text-lg hover:bg-charcoal transition-all duration-300 flex items-center gap-3 shadow-[0_8px_30px_rgb(180,165,145,0.4)] hover:shadow-xl hover:-translate-y-1 w-full justify-center"
                                >
                                    <Camera size={24} /> Scan Case/Shelf
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Confirmation Section */}
            <div className={`bg-white rounded-[2rem] md:rounded-[2.5rem] border border-tan-light/50 p-6 md:p-10 flex flex-col items-center transition-all duration-700 shadow-xl ${
                selectedItems.length > 0 && selectedLocation ? 'opacity-100 translate-y-0' : 'opacity-20 pointer-events-none translate-y-8 grayscale'
            }`}>
                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10 mb-8 md:mb-12 w-full justify-center">
                    <div className="flex -space-x-4 overflow-hidden p-2">
                        {selectedItems.slice(0, 5).map((item, idx) => (
                            <div key={item.id} className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-cream border-4 border-white flex items-center justify-center text-tan shadow-sm" style={{ zIndex: 10 - idx }}>
                                <Box size={24} />
                            </div>
                        ))}
                        {selectedItems.length > 5 && (
                            <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-tan text-white border-4 border-white flex items-center justify-center font-bold text-sm md:text-base shadow-sm" style={{ zIndex: 0 }}>
                                +{selectedItems.length - 5}
                            </div>
                        )}
                    </div>

                    <div className="hidden md:block">
                        <ArrowRight className="text-tan/20" size={48} />
                    </div>
                    <div className="md:hidden">
                        <ArrowRight className="text-tan/20 rotate-90" size={32} />
                    </div>

                    <div className="bg-tan/10 px-8 py-4 rounded-3xl border border-tan/20 text-center w-full md:w-auto">
                        <p className="text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-1">Destination</p>
                        <p className="font-serif font-bold text-xl md:text-2xl text-charcoal">{selectedLocation?.name}</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full">
                    <button 
                        onClick={resetFlow}
                        className="px-10 py-4 md:py-5 rounded-2xl font-bold text-charcoal-light bg-cream hover:bg-tan/10 transition-all order-2 sm:order-1"
                    >
                        Reset Process
                    </button>
                    <button 
                        onClick={() => performTagging()}
                        disabled={isLoading || selectedItems.length === 0 || !selectedLocation}
                        className="flex-1 bg-tan text-white px-10 py-4 md:py-5 rounded-2xl font-bold text-lg md:text-xl hover:bg-charcoal transition-all shadow-xl flex items-center justify-center gap-4 active:scale-[0.98] order-1 sm:order-2"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={24} /> : (
                            <>
                                <CheckCircle2 size={24} /> Tag {selectedItems.length} Artifacts
                            </>
                        )}
                    </button>
                </div>
            </div>

            {isScannerOpen && (
                <QRScanner 
                    active={isScannerOpen} 
                    onScan={handleScan} 
                    onClose={() => setIsScannerOpen(false)} 
                />
            )}
        </div>
    );
}
