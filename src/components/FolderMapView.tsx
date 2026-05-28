import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { ArrowRight, Eye, Trash2, X, MapPin } from 'lucide-react';
import type { ArchiveItem } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, addDoc, deleteDoc, doc } from 'firebase/firestore';

// Cluster Styles
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';

// Fix for default Leaflet icon inclusion in build environments
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom Cluster Icon Generator (Matching SAHS brand)
const createClusterCustomIcon = (cluster: any) => {
    return L.divIcon({
        html: `<div class="flex items-center justify-center w-10 h-10 rounded-full bg-charcoal text-white font-black text-xs shadow-xl border-2 border-tan-light ring-2 ring-charcoal/10 backdrop-blur-sm transition-transform hover:scale-110">
                 <span>${cluster.getChildCount()}</span>
               </div>`,
        className: 'custom-marker-cluster',
        iconSize: L.point(40, 40, true),
    });
};

// Premium Custom DivIcon for Personal Private Pins (Crimson red styled bouncing marker)
const PersonalPinIcon = L.divIcon({
    html: `<div class="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-600 text-white shadow-xl border-2 border-white ring-4 ring-emerald-600/20 animate-bounce cursor-pointer transition-transform hover:scale-110">
             <span class="text-sm">📌</span>
           </div>`,
    className: 'custom-personal-pin',
    iconSize: L.point(36, 36),
    iconAnchor: L.point(18, 36),
    popupAnchor: L.point(0, -36)
});

// Map Controller Subcomponent to handle programmatic panning
function MapController({ activeCoord }: { activeCoord: [number, number] | null }) {
    const map = useMap();
    
    useEffect(() => {
        if (activeCoord) {
            map.setView(activeCoord, 16, { animate: true, duration: 1.2 });
        }
    }, [activeCoord, map]);
    
    return null;
}

// React Leaflet event handler component for map clicks (Pin Dropping Mode)
function MapEventsHandler({ 
    enabled, 
    onMapClick 
}: { 
    enabled: boolean; 
    onMapClick: (lat: number, lng: number) => void 
}) {
    useMapEvents({
        click(e) {
            if (enabled) {
                onMapClick(e.latlng.lat, e.latlng.lng);
            }
        }
    });
    return null;
}

interface PersonalPin {
    id: string;
    ownerEmail: string;
    coordinates: {
        lat: number;
        lng: number;
    };
    title: string;
    description: string;
    date?: string;
    historical_address?: string;
    createdAt: string;
}

interface FolderMapViewProps {
    items: ArchiveItem[];
    folderId?: string;
}

export function FolderMapView({ items, folderId }: FolderMapViewProps) {
    const { isEditingMode, user, hasResearchAccess } = useAuth();
    
    const [activeCoord, setActiveCoord] = useState<[number, number] | null>(null);
    const markerRefs = useRef<Record<string, L.Marker | null>>({});
    const personalMarkerRefs = useRef<Record<string, L.Marker | null>>({});

    // Personal Pins States
    const [personalPins, setPersonalPins] = useState<PersonalPin[]>([]);
    const [isDropPinMode, setIsDropPinMode] = useState(false);
    const [clickedLocation, setClickedLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Modal Form States
    const [pinTitle, setPinTitle] = useState('');
    const [pinDescription, setPinDescription] = useState('');
    const [pinDate, setPinDate] = useState('');
    const [pinAddress, setPinAddress] = useState('');
    const [isSavingPin, setIsSavingPin] = useState(false);

    // Filter items with valid coordinates
    const mappedItems = items.filter(item => 
        item.coordinates && 
        typeof item.coordinates.lat === 'number' && 
        typeof item.coordinates.lng === 'number'
    );

    const unmappedItems = items.filter(item => 
        !item.coordinates || 
        typeof item.coordinates.lat !== 'number' || 
        typeof item.coordinates.lng !== 'number'
    );

    // Fetch personal private pins from Firestore
    const fetchPersonalPins = async () => {
        if (!user || !user.email || !hasResearchAccess) return;
        const email = user.email.toLowerCase();
        try {
            const q = query(
                collection(db, 'personal_pins'),
                where('ownerEmail', '==', email)
            );
            const snap = await getDocs(q);
            const pinsList = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as PersonalPin[];
            
            // Sort by createdAt descending
            pinsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setPersonalPins(pinsList);
        } catch (err) {
            console.error("Error loading personal pins:", err);
        }
    };

    useEffect(() => {
        fetchPersonalPins();
    }, [user, hasResearchAccess]);

    // Default center to Senoia, GA
    const senoiaCenter: [number, number] = [33.3001, -84.5544];

    // Determine initial map center
    const initialCenter: [number, number] = mappedItems.length > 0 
        ? [mappedItems[0].coordinates!.lat, mappedItems[0].coordinates!.lng]
        : personalPins.length > 0
            ? [personalPins[0].coordinates.lat, personalPins[0].coordinates.lng]
            : senoiaCenter;

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // Locate standard item
    const handleLocateItem = (item: ArchiveItem) => {
        if (!item.coordinates || !item.coordinates.lat || !item.coordinates.lng) return;
        
        const pos: [number, number] = [item.coordinates.lat, item.coordinates.lng];
        setActiveCoord(pos);
        
        setTimeout(() => {
            const marker = markerRefs.current[item.id || ''];
            if (marker) {
                marker.openPopup();
            }
        }, 350);
    };

    // Locate personal pin
    const handleLocatePersonalPin = (pin: PersonalPin) => {
        const pos: [number, number] = [pin.coordinates.lat, pin.coordinates.lng];
        setActiveCoord(pos);
        
        setTimeout(() => {
            const marker = personalMarkerRefs.current[pin.id];
            if (marker) {
                marker.openPopup();
            }
        }, 350);
    };

    // Trigger pin dropped click handler
    const handleMapClick = (lat: number, lng: number) => {
        setClickedLocation({ lat, lng });
        setIsDropPinMode(false); // Disable crosshair immediately
    };

    // Save Personal Pin to Firestore
    const handleSavePersonalPin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !clickedLocation || !pinTitle.trim() || !pinDescription.trim()) return;
        
        setIsSavingPin(true);
        try {
            const pinData = {
                ownerEmail: user.email.toLowerCase(),
                coordinates: {
                    lat: clickedLocation.lat,
                    lng: clickedLocation.lng
                },
                title: pinTitle.trim(),
                description: pinDescription.trim(),
                date: pinDate.trim() || null,
                historical_address: pinAddress.trim() || null,
                createdAt: new Date().toISOString()
            };

            await addDoc(collection(db, 'personal_pins'), pinData);
            
            showToast(`Saved private pin "${pinTitle}"!`);
            setPinTitle('');
            setPinDescription('');
            setPinDate('');
            setPinAddress('');
            setClickedLocation(null);
            
            // Reload pins
            fetchPersonalPins();
        } catch (err) {
            console.error("Error saving personal pin:", err);
            showToast("Failed to save personal pin.");
        } finally {
            setIsSavingPin(false);
        }
    };

    // Delete Personal Pin
    const handleDeletePersonalPin = async (pinId: string, title: string) => {
        if (!window.confirm(`Are you sure you want to delete your personal pin "${title}"? This action is private and cannot be undone.`)) return;
        
        try {
            await deleteDoc(doc(db, 'personal_pins', pinId));
            showToast(`Deleted pin "${title}"`);
            fetchPersonalPins();
        } catch (err) {
            console.error("Error deleting personal pin:", err);
            showToast("Failed to delete pin.");
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 w-full bg-beige/30 p-4 md:p-6 border border-tan-light/30 rounded-3xl relative z-0">
            
            {/* Left Column: Interactive Sidebar Item List */}
            <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4 max-h-[600px] overflow-hidden">
                <div className="bg-white border border-tan-light/30 p-4 rounded-2xl shadow-xs shrink-0 flex flex-col gap-3">
                    <div>
                        <h3 className="font-serif font-bold text-lg text-charcoal flex items-center gap-2">
                            🗺️ Spatial Directory
                        </h3>
                        <p className="text-xs text-charcoal/60 font-sans mt-1 leading-relaxed">
                            Select a historical site or landmark to locate it instantly on the interactive map.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-tan-light/10 pt-2.5 text-[11px] font-sans font-semibold text-charcoal-light">
                        <span className="flex items-center gap-1">
                            📍 {mappedItems.length} Mapped
                        </span>
                        <span className="flex items-center gap-1 text-emerald-600">
                            📌 {personalPins.length} Private Pins
                        </span>
                        <span className="flex items-center gap-1 text-charcoal/50">
                            ❓ {unmappedItems.length} Unmapped
                        </span>
                    </div>
                </div>

                {/* Scrollable list */}
                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 min-h-[250px] lg:min-h-0 note-scrollbar">
                    {items.length === 0 && personalPins.length === 0 ? (
                        <div className="text-center py-12 text-charcoal/50 italic font-sans bg-white border border-tan-light/20 rounded-2xl">
                            No items or personal pins to display.
                        </div>
                    ) : (
                        <>
                            {/* Personal Pins Section */}
                            {personalPins.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest px-1">
                                        📌 Personal Research Pins (Private)
                                    </h4>
                                    <div className="flex flex-col gap-2.5">
                                        {personalPins.map(pin => (
                                            <div 
                                                key={pin.id} 
                                                onClick={() => handleLocatePersonalPin(pin)}
                                                className="group flex gap-3 p-3 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-200/50 hover:border-emerald-400 rounded-2xl cursor-pointer transition-all active:scale-[0.99] text-left"
                                            >
                                                <div className="w-12 h-12 shrink-0 bg-emerald-500/10 text-emerald-600 border border-emerald-200/30 rounded-xl flex items-center justify-center text-xl">
                                                    📌
                                                </div>

                                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <h4 className="text-sm font-bold text-charcoal font-serif group-hover:text-emerald-700 transition-colors line-clamp-1 leading-snug">
                                                            {pin.title}
                                                        </h4>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeletePersonalPin(pin.id, pin.title);
                                                            }}
                                                            className="p-1 text-charcoal/30 hover:text-red-600 rounded hover:bg-black/5 transition-colors shrink-0"
                                                            title="Delete Personal Pin"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                    
                                                    <p className="text-[10px] text-charcoal/60 font-sans mt-0.5 line-clamp-2 leading-normal">
                                                        {pin.description}
                                                    </p>

                                                    <div className="flex justify-between items-center mt-2 border-t border-emerald-200/20 pt-1.5 shrink-0 text-[10px]">
                                                        <span className="text-[9px] bg-emerald-500/15 text-emerald-700 px-2 py-0.5 rounded font-black font-sans uppercase tracking-wider">
                                                            Private Pin
                                                        </span>
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleLocatePersonalPin(pin);
                                                            }}
                                                            className="font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-0.5"
                                                        >
                                                            Locate <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Mapped Section */}
                            {mappedItems.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <h4 className="text-[10px] font-bold text-charcoal/40 uppercase tracking-widest px-1">
                                        📁 Folder Archive Items
                                    </h4>
                                    <div className="flex flex-col gap-2.5">
                                        {mappedItems.map(item => {
                                            const imageUrl = item.featured_image_url || (item.file_urls && item.file_urls.length > 0 ? item.file_urls[0] : null);
                                            return (
                                                <div 
                                                    key={item.id} 
                                                    onClick={() => handleLocateItem(item)}
                                                    className="group flex gap-3 p-3 bg-white border border-tan-light/20 hover:border-tan rounded-2xl hover:shadow-md cursor-pointer transition-all active:scale-[0.99] text-left"
                                                >
                                                    <div className="w-16 h-16 shrink-0 bg-tan-light/10 border border-tan-light/20 rounded-xl overflow-hidden relative">
                                                        {imageUrl ? (
                                                            <img 
                                                                src={imageUrl} 
                                                                alt={item.title} 
                                                                className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-tan/40 bg-charcoal/5 font-serif text-lg">
                                                                {item.title.charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                        <div>
                                                            <h4 className="text-sm font-bold text-charcoal font-serif group-hover:text-tan transition-colors line-clamp-1 leading-snug">
                                                                {item.title}
                                                            </h4>
                                                            <p className="text-[10px] text-charcoal/60 font-sans mt-0.5 line-clamp-1">
                                                                📍 {item.historical_address || `${item.coordinates?.lat.toFixed(4)}, ${item.coordinates?.lng.toFixed(4)}`}
                                                            </p>
                                                        </div>

                                                        <div className="flex justify-between items-center mt-1 border-t border-tan-light/10 pt-1.5 shrink-0 text-[10px]">
                                                            <span className="text-[9px] bg-tan/10 text-tan px-2 py-0.5 rounded font-black font-sans uppercase tracking-wider">
                                                                {item.artifact_type || item.type || item.item_type}
                                                            </span>
                                                            <button 
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleLocateItem(item);
                                                                }}
                                                                className="font-bold text-tan hover:text-tan-dark flex items-center gap-0.5"
                                                            >
                                                                Locate <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Unmapped Section */}
                            {unmappedItems.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <h4 className="text-[10px] font-bold text-charcoal/40 uppercase tracking-widest px-1">Unmapped Archive Items</h4>
                                    <div className="flex flex-col gap-2 opacity-70">
                                        {unmappedItems.map(item => (
                                            <div 
                                                key={item.id}
                                                className="flex items-center justify-between p-3 bg-white/70 border border-dashed border-tan-light/20 rounded-xl text-left"
                                            >
                                                <div className="min-w-0 pr-4">
                                                    <h4 className="text-xs font-bold text-charcoal font-serif truncate">{item.title}</h4>
                                                    <p className="text-[9px] text-charcoal/40 font-sans mt-0.5">No geographic location metadata</p>
                                                </div>
                                                <Link 
                                                    to={isEditingMode ? `/edit-item/${item.id}` : `/items/${item.id}`}
                                                    state={{ folderId }}
                                                    className="p-1.5 bg-black/5 hover:bg-tan/10 rounded-lg text-charcoal/50 hover:text-tan transition-colors shrink-0"
                                                    title="View Details"
                                                >
                                                    <Eye size={12} />
                                                </Link>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Right Column: Interactive Leaflet Map Canvas */}
            <div className={`flex-1 h-[400px] lg:h-[600px] rounded-3xl border border-tan-light/40 overflow-hidden shadow-sm bg-white relative z-0 ${
                isDropPinMode ? 'cursor-crosshair' : ''
            }`}>
                
                {/* Custom Overlay Control Bar for Pin Dropping */}
                <div className="absolute top-4 left-16 z-[1000] flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsDropPinMode(!isDropPinMode)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold font-sans text-xs uppercase tracking-wider shadow-md transition-all active:scale-95 border ${
                            isDropPinMode 
                                ? 'bg-emerald-600 border-emerald-500 text-white animate-pulse' 
                                : 'bg-white border-tan-light/40 hover:bg-beige/40 text-charcoal'
                        }`}
                    >
                        <MapPin size={14} />
                        {isDropPinMode ? 'Cancel Pin Drop' : 'Drop Personal Pin'}
                    </button>
                    
                    {isDropPinMode && (
                        <div className="hidden sm:flex items-center bg-emerald-600/90 text-white font-sans text-[11px] font-bold px-3 py-2 rounded-xl backdrop-blur-sm border border-emerald-500 shadow-md animate-in fade-in slide-in-from-left-4 duration-300">
                            📍 Click anywhere on the map to drop a private pin
                        </div>
                    )}
                </div>

                <MapContainer 
                    center={initialCenter} 
                    zoom={15} 
                    scrollWheelZoom={true}
                    dragging={true}
                    doubleClickZoom={true}
                    className="w-full h-full"
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    
                    {/* Controller to handle panning trigger */}
                    <MapController activeCoord={activeCoord} />

                    {/* Handler to capture map click in drop pin mode */}
                    <MapEventsHandler enabled={isDropPinMode} onMapClick={handleMapClick} />

                    <MarkerClusterGroup
                        chunkedLoading
                        iconCreateFunction={createClusterCustomIcon}
                        maxClusterRadius={40}
                        spiderfyOnMaxZoom={true}
                    >
                        {/* 1. Render standard bookmarked items */}
                        {mappedItems.map((item) => (
                            <Marker 
                                key={item.id} 
                                position={[item.coordinates!.lat, item.coordinates!.lng]}
                                ref={(el) => {
                                    markerRefs.current[item.id || ''] = el;
                                }}
                            >
                                <Popup>
                                    <div className="p-1 max-w-[210px] text-left">
                                        {item.featured_image_url && (
                                            <img 
                                                src={item.featured_image_url} 
                                                alt={item.title} 
                                                className="w-full h-24 object-cover rounded-lg mb-2 border border-tan-light/30"
                                            />
                                        )}
                                        <h4 className="font-serif font-bold text-charcoal mb-0.5 text-xs leading-snug break-words">
                                            {item.title}
                                        </h4>
                                        {item.historical_address && (
                                            <p className="text-[9px] text-tan-dark font-sans leading-none mb-1.5 italic">
                                                📍 {item.historical_address}
                                            </p>
                                        )}
                                        <p className="text-[9px] text-charcoal/60 mb-2.5 line-clamp-2 leading-relaxed">
                                            {item.description}
                                        </p>
                                        <Link 
                                            to={isEditingMode ? `/edit-item/${item.id}` : `/items/${item.id}`}
                                            state={{ folderId }}
                                            className="inline-flex items-center justify-center gap-1 w-full py-1.5 bg-charcoal hover:bg-tan text-white text-[10px] font-bold rounded-lg transition-colors no-underline uppercase tracking-wider font-sans active:scale-95 shadow-xs"
                                        >
                                            View Details <ArrowRight size={10} />
                                        </Link>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        {/* 2. Render user's personal private pins */}
                        {personalPins.map((pin) => (
                            <Marker
                                key={pin.id}
                                position={[pin.coordinates.lat, pin.coordinates.lng]}
                                icon={PersonalPinIcon}
                                ref={(el) => {
                                    personalMarkerRefs.current[pin.id] = el;
                                }}
                            >
                                <Popup>
                                    <div className="p-2 max-w-[230px] text-left flex flex-col gap-2">
                                        <div className="flex justify-between items-center border-b border-emerald-100 pb-1.5 shrink-0">
                                            <span className="text-[9px] bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded font-black font-sans uppercase tracking-wider">
                                                🔒 Private Annotation
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleDeletePersonalPin(pin.id, pin.title)}
                                                className="p-1 hover:bg-emerald-500/10 rounded text-charcoal/40 hover:text-red-600 transition-colors shrink-0"
                                                title="Delete Pin"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>

                                        <div>
                                            <h4 className="font-serif font-bold text-charcoal text-xs leading-snug break-words">
                                                {pin.title}
                                            </h4>
                                            {pin.historical_address && (
                                                <p className="text-[9px] text-emerald-700 font-sans leading-none mt-0.5 italic">
                                                    📍 {pin.historical_address}
                                                </p>
                                            )}
                                            {pin.date && (
                                                <p className="text-[9px] text-charcoal/40 font-mono mt-0.5">
                                                    📅 Historical Era: {pin.date}
                                                </p>
                                            )}
                                        </div>

                                        <p className="text-[10px] text-charcoal/70 bg-emerald-500/5 border border-emerald-200/20 p-2 rounded-lg leading-relaxed italic break-words">
                                            "{pin.description}"
                                        </p>
                                        
                                        <span className="text-[8px] text-charcoal/30 self-end font-mono">
                                            Added {new Date(pin.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MarkerClusterGroup>
                </MapContainer>
            </div>

            {/* Drop Personal Pin Form Modal Overlay */}
            {clickedLocation && (
                <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <form
                        onSubmit={handleSavePersonalPin}
                        className="bg-cream border border-tan/30 w-full max-w-md rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col gap-5 animate-in zoom-in duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center border-b border-tan/20 pb-3 shrink-0">
                            <div className="flex items-center gap-2 text-emerald-600">
                                <MapPin size={20} />
                                <h3 className="font-serif font-bold text-lg text-charcoal">Drop Private Map Pin</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setClickedLocation(null)}
                                className="p-1.5 hover:bg-black/5 rounded-full text-charcoal/60 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Latitude / Longitude info */}
                        <div className="bg-white/60 border border-tan-light/20 p-2.5 rounded-xl text-[10px] font-mono text-charcoal-light flex justify-between">
                            <span>Latitude: {clickedLocation.lat.toFixed(6)}</span>
                            <span>Longitude: {clickedLocation.lng.toFixed(6)}</span>
                        </div>

                        {/* Title Input */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black text-tan uppercase tracking-widest font-sans">
                                Location Title <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. Historic Barn site, ancestral home..."
                                value={pinTitle}
                                onChange={e => setPinTitle(e.target.value)}
                                className="w-full bg-white border border-tan-light/40 p-3 rounded-xl text-xs outline-none focus:border-tan font-sans font-semibold text-charcoal"
                                maxLength={50}
                                autoFocus
                            />
                        </div>

                        {/* Description Input */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black text-tan uppercase tracking-widest font-sans">
                                Description & Research Notes <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                required
                                rows={3}
                                placeholder="Write historical context or personal findings here. Strictly visible only to you."
                                value={pinDescription}
                                onChange={e => setPinDescription(e.target.value)}
                                className="w-full bg-white border border-tan-light/40 p-3 rounded-xl text-xs outline-none focus:border-tan font-sans font-semibold text-charcoal leading-relaxed resize-none"
                            />
                        </div>

                        {/* Optional Date */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black text-tan uppercase tracking-widest font-sans">
                                Historical Date / Period (Optional)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. c. 1895, 1910s, June 12, 1943"
                                value={pinDate}
                                onChange={e => setPinDate(e.target.value)}
                                className="w-full bg-white border border-tan-light/40 p-3 rounded-xl text-xs outline-none focus:border-tan font-sans font-semibold text-charcoal"
                                maxLength={30}
                            />
                        </div>

                        {/* Optional Address */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black text-tan uppercase tracking-widest font-sans">
                                Physical Address (Optional)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. 102 Main Street"
                                value={pinAddress}
                                onChange={e => setPinAddress(e.target.value)}
                                className="w-full bg-white border border-tan-light/40 p-3 rounded-xl text-xs outline-none focus:border-tan font-sans font-semibold text-charcoal"
                                maxLength={80}
                            />
                        </div>

                        {/* Form Buttons */}
                        <div className="flex gap-3 justify-end border-t border-tan/20 pt-4 mt-1 shrink-0">
                            <button
                                type="button"
                                onClick={() => setClickedLocation(null)}
                                className="px-5 py-2.5 rounded-xl text-xs font-bold font-sans bg-white border border-tan-light hover:bg-beige/40 text-charcoal transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSavingPin}
                                className="px-5 py-2.5 rounded-xl text-xs font-bold font-sans bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                            >
                                {isSavingPin ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Saving Pin...
                                    </>
                                ) : (
                                    <>Save Private Pin</>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Toast Message Notification */}
            {toastMessage && (
                <div className="fixed bottom-8 right-8 z-[2500] bg-charcoal text-cream border border-tan/30 px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300 font-serif font-semibold text-[15px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    {toastMessage}
                </div>
            )}
        </div>
    );
}
