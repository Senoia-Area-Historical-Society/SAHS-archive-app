import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, writeBatch, query, orderBy, deleteField } from 'firebase/firestore';
import { MapPin, Plus, Trash2, Loader2, HelpCircle, Edit2, X, Folder, FolderPlus, GripVertical, ChevronRight, Archive } from 'lucide-react';
import type { MuseumLocation, Room } from '../types/database';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

// --- Sub-components ---

// Location Card Component (Draggable)
const LocationCard = ({ 
    loc, 
    handleEditClick, 
    handleDeleteLocation,
    isGeneral = false
}: { 
    loc: MuseumLocation, 
    handleEditClick: (loc: MuseumLocation) => void, 
    handleDeleteLocation: (docId: string | undefined, name: string) => void,
    isGeneral?: boolean
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
            className={`group relative bg-white border border-tan-light/50 rounded-2xl p-2 transition-all hover:shadow-md hover:border-tan/30 cursor-grab active:cursor-grabbing ${isGeneral ? 'border-indigo-100 shadow-sm' : ''}`}
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
                            title="Edit Location"
                        >
                            <Edit2 size={14} />
                        </button>
                        <button 
                            onClick={(e) => { e.preventDefault(); handleDeleteLocation(loc.docId, loc.name); }}
                            className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                            title="Delete Location"
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
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Page Component ---

export function ManageLocations() {
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // UI state
    const [activeTab, setActiveTab] = useState<'locations' | 'rooms'>('locations');
    const [mode, setMode] = useState<'add' | 'edit'>('add');
    const [editingDocId, setEditingDocId] = useState<string | null>(null);

    // Form state
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newId, setNewId] = useState('');
    const [selectedRoomId, setSelectedRoomId] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [locSnapshot, roomSnapshot] = await Promise.all([
                getDocs(collection(db, 'locations')),
                getDocs(query(collection(db, 'rooms'), orderBy('name')))
            ]);

            const locData = locSnapshot.docs.map(doc => ({
                docId: doc.id,
                ...doc.data()
            })) as MuseumLocation[];
            setLocations(locData.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));

            const roomData = roomSnapshot.docs.map(doc => ({
                docId: doc.id,
                ...doc.data()
            })) as Room[];

            // Auto-Migration check: If rooms collection is empty, check settings
            if (roomData.length === 0) {
                try {
                    const settingsDoc = await getDoc(doc(db, 'settings', 'interactive_map'));
                    if (settingsDoc.exists() && settingsDoc.data().rooms) {
                        const legacyRooms = settingsDoc.data().rooms;
                        const batch = writeBatch(db);
                        const migratedRooms: Room[] = [];
                    
                    legacyRooms.forEach((r: any) => {
                        const newRoomRef = doc(collection(db, 'rooms'));
                        const roomObj = {
                            id: r.id.toString(),
                            name: r.name,
                            map_coordinates: r.map_coordinates || null,
                            created_at: new Date().toISOString()
                        };
                        batch.set(newRoomRef, roomObj);
                        migratedRooms.push({ ...roomObj, docId: newRoomRef.id });
                    });
                    
                    await batch.commit();
                    setRooms(migratedRooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
                    } else {
                        setRooms([]);
                    }
                } catch (err) {
                    console.warn("Map Diagnostics: Failed to read legacy settings (possibly insufficient permissions). Defaulting to empty rooms.", err);
                    setRooms([]);
                }
            } else {
                setRooms(roomData.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || (!newId && activeTab === 'locations')) return;

        setIsSubmitting(true);
        try {
            const targetColl = activeTab === 'locations' ? 'locations' : 'rooms';
            if (mode === 'edit' && editingDocId) {
                const updateData: any = {
                    name: newName,
                    description: newDesc
                };
                if (activeTab === 'locations') {
                    updateData.room_id = selectedRoomId || deleteField();
                }
                await updateDoc(doc(db, targetColl, editingDocId), updateData);
            } else {
                const slug = newId.toLowerCase().replace(/\s+/g, '-').trim() || Date.now().toString();
                const newData: any = {
                    name: newName,
                    description: newDesc,
                    id: slug,
                    created_at: new Date().toISOString()
                };
                if (activeTab === 'locations') {
                    newData.room_id = selectedRoomId || undefined;
                }
                await addDoc(collection(db, targetColl), newData);
            }
            
            handleCancel();
            fetchData();
        } catch (error) {
            console.error("Error saving:", error);
            alert("Failed to save.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditRoom = (room: Room) => {
        setActiveTab('rooms');
        setMode('edit');
        setEditingDocId(room.docId!);
        setNewName(room.name);
        setNewDesc(room.description || '');
        setNewId(room.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleEditLocation = (loc: MuseumLocation) => {
        setActiveTab('locations');
        setMode('edit');
        setEditingDocId(loc.docId!);
        setNewName(loc.name);
        setNewDesc(loc.description || '');
        setNewId(loc.id);
        setSelectedRoomId(loc.room_id || '');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setMode('add');
        setEditingDocId(null);
        setNewName('');
        setNewDesc('');
        setNewId('');
        setSelectedRoomId('');
    };

    const handleDelete = async (target: 'locations' | 'rooms', docId: string | undefined, name: string) => {
        if (!docId) return;
        const msg = target === 'rooms' 
            ? `Are you sure you want to delete the room "${name}"? Locations inside will move to unassigned.`
            : `Are you sure you want to delete "${name}"?`;
            
        if (!window.confirm(msg)) return;
        
        try {
            await deleteDoc(doc(db, target, docId));
            fetchData();
        } catch (error) {
            console.error("Error deleting:", error);
        }
    };

    const handleDropOnGeneral = async (e: React.DragEvent) => {
        e.preventDefault();
        const locationDocId = e.dataTransfer.getData('locationDocId');
        if (locationDocId) {
            // Optimistic update
            setLocations(prev => prev.map(loc => 
                loc.docId === locationDocId ? { ...loc, room_id: undefined } : loc
            ));

            try {
                await updateDoc(doc(db, 'locations', locationDocId), {
                    room_id: deleteField()
                });
            } catch (error) {
                console.error("Error resetting location room:", error);
                fetchData();
            }
        }
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b border-tan-light/50 pb-6 pr-4 gap-4">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <Archive className="text-tan" size={32} />
                        Curator Dashboard
                    </h1>
                    <p className="text-charcoal/70 text-lg max-w-2xl">
                        Organize your collection by dragging locations into museum wings.
                    </p>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="h-10 w-px bg-tan-light/30 hidden md:block" />
                    <button 
                        onClick={() => { setActiveTab('locations'); setMode('add'); handleCancel(); }}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'locations' && mode === 'add' ? 'bg-tan text-white shadow-lg shadow-tan/20' : 'bg-white text-tan border border-tan/20 hover:border-tan'}`}
                    >
                        <Plus size={14} /> New Location
                    </button>
                    <button 
                        onClick={() => { setActiveTab('rooms'); setMode('add'); handleCancel(); }}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'rooms' && mode === 'add' ? 'bg-tan text-white shadow-lg shadow-tan/20' : 'bg-white text-tan border border-tan/20 hover:border-tan'}`}
                    >
                        <FolderPlus size={14} /> New Wing
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Form Section */}
                <div className="lg:col-span-4">
                    <div className="bg-white p-6 rounded-3xl border border-tan-light/50 shadow-sm sticky top-24">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-serif font-bold text-charcoal flex items-center gap-2">
                                {mode === 'edit' ? <Edit2 size={20} className="text-tan" /> : <Plus size={20} className="text-tan" />}
                                {mode === 'edit' ? `Edit ${activeTab === 'locations' ? 'Location' : 'Room'}` : `New ${activeTab === 'locations' ? 'Location' : 'Room'}`}
                            </h2>
                            {mode === 'edit' && (
                                <button onClick={handleCancel} className="text-charcoal/40 hover:text-red-500 transition-colors p-1">
                                    <X size={20} />
                                </button>
                            )}
                        </div>
                        
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">
                                    {activeTab === 'locations' ? 'Location Name' : 'Room Name'}
                                </label>
                                <input 
                                    type="text" required 
                                    placeholder={activeTab === 'locations' ? "e.g. Shelf 1, Case 4" : "e.g. Gallery A, Library"}
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="w-full bg-cream px-4 py-3 rounded-xl border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal"
                                />
                            </div>

                            {activeTab === 'locations' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans flex items-center gap-2">
                                            Location ID / Slug
                                            <HelpCircle size={14} className="text-charcoal/30" />
                                        </label>
                                        <input 
                                            type="text" required 
                                            placeholder="e.g. shelf-1"
                                            value={newId}
                                            onChange={(e) => setNewId(e.target.value)}
                                            disabled={mode === 'edit'}
                                            className={`w-full px-4 py-3 rounded-xl border outline-none transition-all font-sans text-charcoal font-mono text-sm ${mode === 'edit' ? 'bg-grey-50 cursor-not-allowed border-transparent opacity-50' : 'bg-cream border-transparent focus:bg-white focus:border-tan'}`}
                                        />
                                        {mode === 'edit' && (
                                            <p className="text-[10px] bg-red-50 text-red-600 font-bold p-2 mt-2 rounded">
                                                Location Slug cannot be modified to prevent breaking printed physical asset tags.
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">
                                            Assign to Room
                                        </label>
                                        <select
                                            value={selectedRoomId}
                                            onChange={(e) => setSelectedRoomId(e.target.value)}
                                            className="w-full bg-cream px-4 py-3 rounded-xl border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal"
                                        >
                                            <option value="">No Room (Unassigned)</option>
                                            {rooms.map(room => (
                                                <option key={room.docId} value={room.docId}>{room.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">
                                    Description (Optional)
                                </label>
                                <textarea 
                                    placeholder="Details..."
                                    value={newDesc}
                                    onChange={(e) => setNewDesc(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSave(e as any);
                                        }
                                    }}
                                    rows={3}
                                    className="w-full bg-cream px-4 py-3 rounded-xl border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal resize-none"
                                />
                            </div>
                            
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-tan text-white px-5 py-4 rounded-xl font-bold hover:bg-charcoal transition-all mt-4 flex items-center justify-center gap-2 shadow-sm"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : (
                                    <>{mode === 'edit' ? 'Update' : 'Create'}</>
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Folders & Draggable Section */}
                <div className="lg:col-span-8 space-y-8">
                    {loading ? (
                        <div className="p-12 text-center text-charcoal/60 font-serif flex flex-col items-center gap-4">
                            <Loader2 className="animate-spin text-tan" size={32} />
                            Fetching archive folders...
                        </div>
                    ) : (
                        <div className="space-y-12 pb-32">
                            {/* Room Folders Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {rooms.map(room => (
                                    <Link 
                                        key={room.docId}
                                        to={`/manage-locations/rooms/${room.docId}`}
                                        className="group relative bg-white rounded-[40px] border border-tan-light/20 p-8 transition-all hover:shadow-2xl hover:shadow-tan/10 hover:-translate-y-1 flex flex-col gap-6 text-left shadow-sm overflow-hidden"
                                    >
                                        {/* Background Accent */}
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-tan/5 rounded-bl-[100px] -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-700" />
                                        
                                        <div className="flex justify-between items-start relative z-10">
                                            <div className="w-20 h-20 bg-tan/5 text-tan rounded-[24px] flex items-center justify-center group-hover:bg-tan group-hover:text-white transition-all duration-500 shadow-inner">
                                                <Folder size={36} />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <button 
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditRoom(room as Room); }}
                                                    className="p-3 text-charcoal/20 hover:text-tan hover:bg-tan/5 rounded-2xl transition-all"
                                                    title="Edit Wing"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete('rooms', room.docId, room.name); }}
                                                    className="p-3 text-charcoal/20 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                                                    title="Delete Wing"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="relative z-10">
                                            <h3 className="text-2xl font-serif font-bold text-charcoal mb-2 leading-tight group-hover:text-tan transition-colors">
                                                {room.name}
                                            </h3>
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-tan animate-pulse" />
                                                    <span className="text-[10px] font-black text-tan uppercase tracking-widest">
                                                        Active Wing
                                                    </span>
                                                </div>
                                                <div className="w-1 h-1 rounded-full bg-charcoal/10" />
                                                <span className="text-[10px] font-black text-charcoal/40 uppercase tracking-widest">
                                                    {locations.filter((l: MuseumLocation) => l.room_id === room.docId).length} Artifact Hubs
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-4 relative z-10">
                                            <span className="text-[10px] font-bold text-charcoal/30 flex items-center gap-1 group-hover:text-charcoal transition-colors">
                                                Manage Contents
                                            </span>
                                            <div className="w-10 h-10 rounded-full bg-cream flex items-center justify-center group-hover:bg-tan group-hover:text-white transition-all transform group-hover:translate-x-2">
                                                <ChevronRight size={20} />
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                                
                                {rooms.length === 0 && !loading && (
                                    <div className="col-span-full py-20 text-center border-4 border-dashed border-tan-light/10 rounded-[40px] flex flex-col items-center gap-4">
                                        <FolderPlus size={48} className="text-tan/20" />
                                        <p className="text-charcoal/30 font-serif text-lg">No folders created yet. Add your first room to begin organizing.</p>
                                    </div>
                                )}
                            </div>

                            {/* Unassigned Area */}
                            <div 
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                onDrop={handleDropOnGeneral}
                                className="bg-white border-2 border-dashed border-tan/20 rounded-[48px] p-12 mt-20 group hover:border-tan/40 transition-all shadow-sm"
                            >
                                <div className="flex flex-col items-center text-center gap-6 mb-12">
                                    <div className="w-24 h-24 bg-tan/5 text-tan rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Archive size={40} />
                                    </div>
                                    <div>
                                        <h3 className="text-3xl font-serif font-bold text-charcoal mb-2 leading-tight">General Repository</h3>
                                        <p className="text-xs text-charcoal/40 font-bold uppercase tracking-[0.2em]">Drag locations here to unassign them from any wing</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {locations.filter(l => !l.room_id || !rooms.find(r => r.docId === l.room_id)).map(loc => (
                                        <LocationCard 
                                            key={loc.docId} 
                                            loc={loc} 
                                            handleEditClick={handleEditLocation} 
                                            handleDeleteLocation={(id, name) => handleDelete('locations', id, name)}
                                            isGeneral={true}
                                        />
                                    ))}
                                    {locations.filter(l => !l.room_id || !rooms.find(r => r.docId === l.room_id)).length === 0 && (
                                        <div className="col-span-full py-12 text-center text-indigo-300 italic text-sm">
                                            All locations are currently organized into rooms.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
