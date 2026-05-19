import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where } from 'firebase/firestore';
import { MapPin, Plus, Trash2, Loader2, Edit2, X, ChevronLeft, GripVertical, Archive, Folder } from 'lucide-react';
import type { MuseumLocation, Room } from '../types/database';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

// Reusable Location Card for Admin view
const LocationCard = ({ 
    loc, 
    childBoxes,
    handleEditClick, 
    handleDeleteLocation 
}: { 
    loc: MuseumLocation, 
    childBoxes: MuseumLocation[],
    handleEditClick: (loc: MuseumLocation) => void, 
    handleDeleteLocation: (docId: string | undefined, name: string) => void 
}) => {
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('locationDocId', loc.docId || '');
        e.dataTransfer.effectAllowed = 'move';
        const target = e.currentTarget as HTMLElement;
        target.style.opacity = '0.5';
    };

    const handleDragEnd = (e: React.DragEvent) => {
        const target = e.currentTarget as HTMLElement;
        target.style.opacity = '1';
    };

    return (
        <div 
            draggable 
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className="group relative bg-white border border-tan-light/50 rounded-2xl p-2 transition-all hover:shadow-md hover:border-tan/30 cursor-grab active:cursor-grabbing shadow-sm"
        >
            <div className="flex flex-col">
                <div className="p-3 flex justify-between items-start mb-1">
                    <div className="flex gap-2 min-w-0">
                        <GripVertical size={16} className="text-charcoal/20 mt-1 flex-shrink-0 group-hover:text-tan transition-colors" />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="font-serif font-bold text-base text-charcoal leading-tight">{loc.name}</h3>
                            </div>
                            <p className="text-[10px] font-mono font-bold text-tan/60 uppercase tracking-widest leading-tight">{loc.id}</p>
                        </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button 
                            onClick={(e) => { e.preventDefault(); handleEditClick(loc); }}
                            className="p-1.5 text-charcoal hover:bg-black/5 rounded-full transition-colors"
                        >
                            <Edit2 size={14} />
                        </button>
                        <button 
                            onClick={(e) => { e.preventDefault(); handleDeleteLocation(loc.docId, loc.name); }}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
                
                <div className="px-1 pb-1">
                    <div className="bg-cream/20 p-3 rounded-xl flex flex-col items-center justify-center gap-3">
                        <QRCodeDisplay 
                            value={`loc:${loc.id}`} 
                            label={loc.name} 
                            subLabel="Museum Location Tag"
                            size={80}
                        />

                        <Link 
                            to={`/locations/${loc.id}`}
                            className="flex items-center gap-1.5 px-4 py-2 bg-tan/10 text-tan hover:bg-tan hover:text-white rounded-lg text-[10px] font-bold transition-all w-full justify-center"
                        >
                            <MapPin size={12} /> View Page
                        </Link>

                        {childBoxes.length > 0 && (
                            <div className="w-full mt-1 pt-3 border-t border-tan/10 flex flex-col items-center">
                                <span className="text-[10px] font-bold text-tan/60 px-1">{childBoxes.length} Nested Box{childBoxes.length !== 1 ? 'es' : ''}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export function ManageRoomLocations() {
    const { roomId } = useParams();
    const [room, setRoom] = useState<Room | null>(null);
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<'add' | 'edit'>('add');
    const [editingLoc, setEditingLoc] = useState<MuseumLocation | null>(null);
    const [newName, setNewName] = useState('');
    const [newId, setNewId] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (!roomId) return;
            setLoading(true);
            try {
                // Fetch Room
                const roomSnap = await getDocs(query(collection(db, 'rooms')));
                const roomDoc = roomSnap.docs.find(d => d.id === roomId);
                if (roomDoc) {
                    setRoom({ docId: roomDoc.id, ...roomDoc.data() } as Room);
                }

                // Fetch Locations for this room
                const locQ = query(collection(db, 'locations'), where('room_id', '==', roomId));
                const locSnap = await getDocs(locQ);
                const locData = locSnap.docs.map(d => ({ docId: d.id, ...d.data() } as MuseumLocation));
                setLocations(locData.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [roomId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomId || isSubmitting) return;

        setIsSubmitting(true);
        try {
            if (mode === 'add') {
                const newLoc = {
                    id: newId.toLowerCase().replace(/\s+/g, '-'),
                    name: newName,
                    description: newDesc,
                    room_id: roomId,
                    created_at: new Date().toISOString()
                };
                const docRef = await addDoc(collection(db, 'locations'), newLoc);
                setLocations(prev => [...prev, { docId: docRef.id, ...newLoc } as MuseumLocation]);
            } else if (editingLoc?.docId) {
                await updateDoc(doc(db, 'locations', editingLoc.docId), { 
                    name: newName,
                    description: newDesc 
                });
                setLocations(prev => prev.map(l => l.docId === editingLoc.docId ? { ...l, name: newName, description: newDesc } : l));
            }
            setNewName('');
            setNewDesc('');
            setNewId('');
            setMode('add');
            setEditingLoc(null);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (docId: string | undefined, name: string) => {
        if (!docId || !window.confirm(`Delete "${name}"? This will UNLINK all related artifacts.`)) return;
        try {
            await deleteDoc(doc(db, 'locations', docId));
            setLocations(prev => prev.filter(l => l.docId !== docId));
        } catch (err) {
            console.error(err);
        }
    };

    const handleEditClick = (loc: MuseumLocation) => {
        setMode('edit');
        setEditingLoc(loc);
        setNewName(loc.name);
        setNewDesc(loc.description || '');
        setNewId(loc.id);
    };

    const handleDropToGeneral = async (e: React.DragEvent) => {
        e.preventDefault();
        const docId = e.dataTransfer.getData('locationDocId');
        if (!docId) return;
        try {
            await updateDoc(doc(db, 'locations', docId), { room_id: null });
            setLocations(prev => prev.filter(l => l.docId !== docId));
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) return <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-tan" size={40}/></div>;
    if (!room) return <div className="p-12 text-center">Room not found.</div>;

    return (
        <div className="flex flex-col h-full bg-cream min-h-screen px-6 py-8 animate-in fade-in duration-500">
            <div className="max-w-7xl mx-auto w-full">
                <Link to="/manage-locations" className="flex items-center gap-2 text-tan font-bold uppercase tracking-widest text-[10px] mb-4 hover:text-charcoal transition-colors group">
                    <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
                </Link>

                <div className="flex flex-col xl:flex-row justify-between items-start gap-8 mb-10">
                    <div className="flex-1">
                        <div className="inline-flex items-center gap-3 bg-tan/10 text-tan px-4 py-1.5 rounded-2xl mb-4">
                            <Folder size={18} />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Curator Management</span>
                        </div>
                        <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-charcoal mb-3 tracking-tight">
                            {room.name}
                        </h1>
                        <p className="text-charcoal/50 text-base md:text-lg font-serif italic max-w-2xl leading-relaxed">
                            Organizing the sub-locations and display areas within this wing.
                        </p>
                    </div>

                    <div className="w-full xl:w-[380px] bg-white rounded-[32px] p-8 shadow-2xl shadow-tan/5 border border-tan-light/20 relative overflow-hidden group">
                        {/* Decorative Corner */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-tan/5 rounded-bl-[60px] -mr-8 -mt-8 group-hover:scale-110 transition-transform duration-1000" />
                        
                        <h2 className="text-lg font-serif font-bold text-charcoal mb-6 flex items-center gap-2 relative z-10">
                            <Plus size={20} className="text-tan" />
                            {mode === 'add' ? 'Add Shelf/Case' : 'Update Location'}
                        </h2>
                        <form onSubmit={handleSave} className="space-y-4">
                            <input 
                                className="w-full bg-cream px-4 py-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-tan/30 transition-all"
                                placeholder="Name (e.g. Case 4)"
                                value={newName}
                                onChange={e=>setNewName(e.target.value)}
                                required
                            />
                            {mode === 'add' && (
                                <input 
                                    className="w-full bg-cream px-4 py-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-tan/30 transition-all font-mono text-sm uppercase"
                                    placeholder="Slug (e.g. case-4)"
                                    value={newId}
                                    onChange={e=>setNewId(e.target.value)}
                                    required
                                />
                            )}
                            <textarea 
                                className="w-full bg-cream px-4 py-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-tan/30 transition-all font-sans text-sm resize-none"
                                placeholder="Description (Optional)"
                                value={newDesc}
                                onChange={e=>setNewDesc(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSave(e as any);
                                    }
                                }}
                                rows={3}
                            />
                            
                            <div className="flex gap-2 pt-2">
                                <button type="submit" disabled={isSubmitting} className="flex-1 bg-tan text-white py-3 rounded-xl font-bold shadow-lg shadow-tan/20 hover:bg-charcoal transition-all">
                                    {isSubmitting ? '...' : mode === 'add' ? 'Create' : 'Save'}
                                </button>
                                {mode === 'edit' && (
                                    <button onClick={(e)=>{e.preventDefault(); setMode('add');setNewName('');setNewDesc('');setNewId('');}} className="p-3 bg-cream text-charcoal/40 rounded-xl hover:text-red-500">
                                        <X size={20}/>
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {locations.filter(l => !l.parent_location_id).map(loc => (
                        <LocationCard 
                            key={loc.docId} 
                            loc={loc} 
                            childBoxes={locations.filter(child => child.parent_location_id === loc.docId)}
                            handleEditClick={handleEditClick} 
                            handleDeleteLocation={handleDelete} 
                        />
                    ))}
                    
                    {locations.length === 0 && (
                        <div className="col-span-full py-20 text-center border-4 border-dashed border-tan-light/10 rounded-[40px] flex flex-col items-center gap-4">
                            <MapPin size={48} className="text-tan/20" />
                            <p className="text-charcoal/30 font-serif text-lg">No locations established in this room yet.</p>
                        </div>
                    )}
                </div>

                {/* Drop zone to remove from room */}
                <div 
                    onDragOver={e=>{e.preventDefault(); e.dataTransfer.dropEffect='move';}}
                    onDrop={handleDropToGeneral}
                    className="mt-32 p-20 border-2 border-dashed border-tan/10 rounded-[60px] text-center bg-white/50 group hover:border-tan/40 hover:bg-tan/5 transition-all duration-700 active:scale-[0.98]"
                >
                    <div className="w-20 h-20 bg-cream rounded-full flex items-center justify-center mx-auto mb-8 group-hover:scale-110 group-hover:bg-tan group-hover:text-white transition-all duration-500 shadow-sm">
                        <Archive size={32} className="text-tan group-hover:text-white transition-colors" />
                    </div>
                    <h3 className="text-charcoal/60 font-serif font-bold text-2xl mb-3">Re-file to Repository</h3>
                    <p className="text-charcoal/30 text-[10px] font-black uppercase tracking-[0.3em] max-w-xs mx-auto leading-loose">
                        Drag any card here to unassign it from <span className="text-tan">{room.name}</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
