import React, { useState, useEffect, useRef, Fragment } from 'react';
import { Rnd } from 'react-rnd';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, addDoc, updateDoc, getDoc, writeBatch, setDoc } from 'firebase/firestore';
import { Plus, MapPin, Square, ZoomIn, ZoomOut, Maximize, Edit3, X, BoxSelect, Maximize2, RotateCw, LayoutGrid, Compass, Layers } from 'lucide-react';
import type { MuseumLocation, Room, MapFloor } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { Link, useSearchParams } from 'react-router-dom';

type LayoutHistoryState = {
    rooms: Room[];
    localCoords: Record<string, {x: number, y: number, width: number, height: number, rotation?: number, z_index?: number, display_type?: 'box' | 'pin', scale?: number}>;
    compassRose?: { x: number, y: number, rotation: number, width?: number, height?: number };
    floors?: MapFloor[];
};

const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1600;
const PIXELS_PER_FOOT = 24; // 1 foot = 24 pixels (1 inch = 2 pixels)

const getSmartBorders = (current: any, all: any[], isSelected: boolean) => {
    const borderStyle = isSelected ? '2px solid #3b82f6' : '2px solid rgba(139, 115, 85, 0.3)';
    const style: any = {
        borderTop: borderStyle,
        borderBottom: borderStyle,
        borderLeft: borderStyle,
        borderRight: borderStyle
    };

    const threshold = 2; // px threshold for "touching"

    all.forEach(other => {
        if (other === current) return;

        // Check Left overlap
        if (Math.abs(current.x - (other.x + other.width)) < threshold && 
            current.y < other.y + other.height && current.y + current.height > other.y) {
            style.borderLeft = 'none';
        }
        // Check Right overlap
        if (Math.abs((current.x + current.width) - other.x) < threshold && 
            current.y < other.y + other.height && current.y + current.height > other.y) {
            style.borderRight = 'none';
        }
        // Check Top overlap
        if (Math.abs(current.y - (other.y + other.height)) < threshold && 
            current.x < other.x + other.width && current.x + current.width > other.x) {
            style.borderTop = 'none';
        }
        // Check Bottom overlap
        if (Math.abs((current.y + current.height) - other.y) < threshold && 
            current.x < other.x + other.width && current.x + current.width > other.x) {
            style.borderBottom = 'none';
        }
    });

    return style;
};

export function InteractiveMap() {
    const { isSAHSUser } = useAuth();
    const [searchParams] = useSearchParams();
    const highlightTargetId = searchParams.get('highlight');
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [scale, setScale] = useState(0.4);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [isSaving, setIsSaving] = useState(false);
    
    // Track changes locally before saving
    const [localCoords, setLocalCoords] = useState<Record<string, {x: number, y: number, width: number, height: number, rotation?: number, z_index?: number, display_type?: 'box' | 'pin', scale?: number}>>({});

    // For binding unmapped locations
    const [selectedLocationForBinding, setSelectedLocationForBinding] = useState<string>('');
    const [isBindingMode, setIsBindingMode] = useState(false);
    
    // New Feature States
    const [isSnapping] = useState(true);
    const [displayStyle, setDisplayStyle] = useState<'box' | 'pin'>('box');
    const absoluteSnap = (val: number) => isSnapping ? Math.round(val / 12) * 12 : val;

    // Structural Rooms
    const [rooms, setRooms] = useState<Room[]>([]);
    
    // Floors
    const [floors, setFloors] = useState<MapFloor[]>([{ id: 'default', name: 'Main Floor', level: 0 }]);
    const [currentFloorId, setCurrentFloorId] = useState<string>('default');
    const [showUnderlay, setShowUnderlay] = useState(false);
    
    // Multi-select and Drag tracking
    const selectedIdsRef = useRef<Set<string>>(new Set());
    const dirtyIdsRef = useRef<Set<string>>(new Set());
    const dragStartPosRef = useRef<Record<string, {x: number, y: number}>>({});
    const [, setSelectionTick] = useState(0); // For triggering UI buttons reacting to ref changes
    const [sidebarPos, setSidebarPos] = useState({ x: 16, y: 16 });
    const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
    const [hoveredBlock, setHoveredBlock] = useState<{ roomId: string, index: number } | null>(null);
    const [resizingRoomId, setResizingRoomId] = useState<string | null>(null);
    const [activeDimensions, setActiveDimensions] = useState<{ width: number, height: number } | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [groupDragOffset, setGroupDragOffset] = useState<{ x: number, y: number } | null>(null);

    // Compass Rose State (Overlay)
    const [compassRose, setCompassRose] = useState<{ x: number, y: number, rotation: number, width?: number, height?: number }>({ x: 32, y: 32, rotation: 0 });
    const [resizingCompassSize, setResizingCompassSize] = useState<number | null>(null);

    const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);

    // Pristine state for discarding changes
    const pristineStateRef = useRef<LayoutHistoryState | null>(null);
    const skipNextClickRef = useRef(false);

    // History and Undo tracking
    const [, setHistory] = useState<LayoutHistoryState[]>([]);
    
    const saveSnapshot = () => {
        setHistory(prev => {
            const next = [...prev, { 
                rooms: JSON.parse(JSON.stringify(rooms)), 
                localCoords: JSON.parse(JSON.stringify(localCoords)),
                compassRose: JSON.parse(JSON.stringify(compassRose)),
                floors: JSON.parse(JSON.stringify(floors))
            }];
            if (next.length > 30) return next.slice(next.length - 30);
            return next;
        });
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isEditMode) return;
            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                setHistory(prev => {
                    if (prev.length === 0) return prev;
                    const next = [...prev];
                    const lastState = next.pop();
                    if (lastState) {
                        setRooms(lastState.rooms);
                        setLocalCoords(lastState.localCoords);
                        if (lastState.compassRose) setCompassRose(lastState.compassRose);
                        if (lastState.floors) setFloors(lastState.floors);
                        selectedIdsRef.current.forEach(id => setSelectionDOM(id, false));
                        selectedIdsRef.current.clear();
                    }
                    return next;
                });
            }
            
            // Delete/Backspace to remove selected items
            if (e.key === 'Backspace' || e.key === 'Delete') {
                if (selectedIdsRef.current.size === 0) return;
                
                // Don't delete if we are typing in an input, textarea, or contenteditable
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
                
                e.preventDefault();
                const idsToDelete = Array.from(selectedIdsRef.current);
                
                const confirmMsg = idsToDelete.length > 1 
                    ? `Remove ${idsToDelete.length} selected items from the map?` 
                    : "Remove selected item from the map?";
                
                if (window.confirm(confirmMsg)) {
                    saveSnapshot();
                    setLocalCoords(prev => {
                        const next = { ...prev };
                        idsToDelete.forEach(id => {
                            if (next[id]) {
                                markDirty(id);
                                delete next[id];
                            }
                        });
                        return next;
                    });
                    
                    setRooms(prev => prev.map(r => {
                        const rid = r.docId || r.id;
                        if (idsToDelete.includes(rid)) {
                            markDirty(rid);
                            return { ...r, map_coordinates: null, geometries: undefined };
                        }
                        return r;
                    }));
                    
                    selectedIdsRef.current.clear();
                    setSelectionTick(t => t + 1);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditMode, rooms, localCoords]);

    useEffect(() => {
        fetchMapData();
    }, [isSAHSUser]);

    const handleFitToScreen = () => {
        if (!wrapperRef.current) return;
        const padding = 80;
        const availableW = wrapperRef.current.clientWidth - padding;
        const availableH = wrapperRef.current.clientHeight - padding;
        const scaleW = availableW / CANVAS_WIDTH;
        const scaleH = availableH / CANVAS_HEIGHT;
        const fitScale = Math.min(scaleW, scaleH);
        const finalScale = Math.max(0.2, Math.min(1, fitScale));
        setScale(parseFloat(finalScale.toFixed(2)));
    };

    const fetchMapData = async () => {
        setLoading(true);
        try {
            const snapshot = await getDocs(collection(db, 'locations'));
            const rawData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                docId: doc.id
            })) as MuseumLocation[];
            
            // Exclude nested boxes from the map entirely
            const data = rawData.filter(loc => !loc.parent_location_id);
            setLocations(data);
            
            const coords: Record<string, any> = {};
            data.forEach(loc => {
                if (loc.map_coordinates) {
                    coords[loc.id] = loc.map_coordinates;
                }
            });
            setLocalCoords(coords);

            // NEW: Fetch rooms from the collection instead of settings
            const roomSnapshot = await getDocs(collection(db, 'rooms'));
            let roomData = roomSnapshot.docs.map(doc => ({
                docId: doc.id,
                ...doc.data()
            })) as Room[];

            // Auto-Migration check: If rooms collection is empty OR any exist without coordinates, check legacy settings
            const needsMigration = roomData.length === 0 || roomData.some(r => !r.map_coordinates);
            if (needsMigration) {
                console.log("Map Diagnostics: Checking legacy settings for missing room coordinates...");
                try {
                    const settingsDoc = await getDoc(doc(db, 'settings', 'interactive_map'));
                
                if (settingsDoc.exists() && settingsDoc.data().rooms) {
                    const legacyRooms = settingsDoc.data().rooms;
                    console.log(`Map Diagnostics: Found ${legacyRooms.length} legacy rooms. Syncing...`);
                    const batch = writeBatch(db);
                    let syncCount = 0;
                    
                    legacyRooms.forEach((r: any) => {
                        const existing = roomData.find(ex => ex.name === r.name);
                        
                        // Smart Coordinate Discovery
                        const coords = r.map_coordinates || r.map_coords || r.coords || r.coordinates || 
                                     (r.x !== undefined ? { x: r.x, y: r.y, width: r.width || 360, height: r.height || 360, rotation: r.rotation ?? 0 } : null);

                        if (existing) {
                            // Update existing room if it's missing coordinates
                            if (!existing.map_coordinates && coords) {
                                console.log(`Map Diagnostics: Successfully recovered coordinates for: ${r.name}`);
                                batch.update(doc(db, 'rooms', existing.docId!), { 
                                    map_coordinates: JSON.parse(JSON.stringify(coords)) 
                                });
                                existing.map_coordinates = coords;
                                syncCount++;
                            }
                        } else {
                            // Create new room if it doesn't exist
                            console.log(`Map Diagnostics: Migrating NEW room from legacy: ${r.name}`);
                            const newRoomRef = doc(collection(db, 'rooms'));
                            const roomObj = {
                                id: r.id.toString(),
                                name: r.name,
                                map_coordinates: coords || null,
                                created_at: new Date().toISOString()
                            };
                            batch.set(newRoomRef, roomObj);
                            roomData.push({ ...roomObj, docId: newRoomRef.id });
                            syncCount++;
                        }
                    });
                    
                    if (syncCount > 0) {
                        await batch.commit();
                        console.log(`Map Diagnostics: Successfully synced ${syncCount} room(s).`);
                    }
                } else {
                    console.warn("Map Diagnostics: No legacy settings found in 'settings/interactive_map'.");
                }
                } catch (err) {
                    console.warn("Map Diagnostics: Failed to read legacy settings (possibly insufficient permissions). Skipping legacy map data sync.", err);
                }
            }
            
            setRooms(roomData);

            // Fetch Settings (Compass Rose & Floors)
            try {
                const settingsDoc = await getDoc(doc(db, 'settings', 'interactive_map'));
                if (settingsDoc.exists()) {
                    const data = settingsDoc.data();
                    if (data.compass_rose) setCompassRose(data.compass_rose);
                    if (data.floors && Array.isArray(data.floors) && data.floors.length > 0) {
                        const sortedFloors = data.floors.sort((a: MapFloor, b: MapFloor) => b.level - a.level);
                        setFloors(sortedFloors);
                        setCurrentFloorId(prev => sortedFloors.some((f: MapFloor) => f.id === prev) ? prev : sortedFloors[0].id);
                    }
                }
            } catch (err) {
                console.warn("Map Diagnostics: Failed to fetch map settings.", err);
            }
        } catch (error) {
            console.error("Error fetching map data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Deep Linking: Auto-scroll and highlight target from URL
    useEffect(() => {
        if (!loading && highlightTargetId && locations.length > 0 && wrapperRef.current) {
            // Find the target (could be a location or a room)
            const loc = locations.find(l => l.id === highlightTargetId || l.docId === highlightTargetId);
            const room = !loc ? rooms.find(r => r.docId === highlightTargetId || r.id === highlightTargetId) : null;
            
            const target = loc || room;
            if (!target) return;

            // Get coordinates
            let tx = 0, ty = 0;
            if (loc) {
                const coords = localCoords[loc.id] || loc.map_coordinates;
                if (!coords) return;
                tx = coords.x;
                ty = coords.y;
            } else if (room) {
                const geom = room.geometries?.[0] || room.map_coordinates;
                if (!geom) return;
                tx = geom.x;
                ty = geom.y;
            }

            // Apply highlight and scroll
            setActiveHighlightId(highlightTargetId);
            
            // Calculate centering
            const containerW = wrapperRef.current.clientWidth;
            const containerH = wrapperRef.current.clientHeight;
            
            // Scaled coordinates
            const sx = tx * scale;
            const sy = ty * scale;
            
            wrapperRef.current.scrollTo({
                left: sx - (containerW / 2),
                top: sy - (containerH / 2),
                behavior: 'smooth'
            });

            // Clear visual pulse after 5 seconds
            const timer = setTimeout(() => setActiveHighlightId(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [loading, highlightTargetId, locations, rooms, scale]);

    const handleSaveLayout = async () => {
        setIsSaving(true);
        try {
            const stripUndefined = (obj: any) => JSON.parse(JSON.stringify(obj));

            const updates = Array.from(dirtyIdsRef.current);
            console.log("Initiating Direct Commit for IDs:", updates);

            const promises = updates.map(async (id) => {
                try {
                    // 1. Check Locations (Pins/Blocks)
                    const loc = locations.find(l => l.id === id || l.docId === id);
                    const lCoords = localCoords[id];
                    
                    if (loc?.docId && lCoords) {
                        if (typeof lCoords.x === 'number' && !isNaN(lCoords.x)) {
                            console.log(`[COMMIT] Location: ${loc.name} at (${lCoords.x}, ${lCoords.y})`);
                            await updateDoc(doc(db, 'locations', loc.docId), { 
                                map_coordinates: stripUndefined({
                                    ...lCoords,
                                    rotation: lCoords.rotation ?? 0,
                                    display_type: lCoords.display_type || loc.display_type || (loc.map_coordinates?.display_type)
                                }),
                                floor_id: loc.floor_id || currentFloorId
                            });
                        } else {
                            console.warn(`[SKIP] Location ${id} has invalid coordinates:`, lCoords);
                        }
                        return; // Found and handled as location
                    }

                    // 2. Check Rooms
                    const room = rooms.find(r => r.docId === id || r.id === id);
                    if (room?.docId) {
                        const hasGeoms = room.geometries && room.geometries.length > 0;
                        const c = room.map_coordinates;

                        if (hasGeoms) {
                            console.log(`[COMMIT] Merged Room: ${room.name} (${room.geometries?.length} blocks)`);
                            await updateDoc(doc(db, 'rooms', room.docId), { 
                                geometries: stripUndefined(room.geometries),
                                map_coordinates: null, // Clear flat coords for merged rooms
                                display_type: 'room',
                                floor_id: room.floor_id || currentFloorId
                            });
                        } else if (c && typeof c.x === 'number' && !isNaN(c.x)) {
                            console.log(`[COMMIT] Room: ${room.name} at (${c.x}, ${c.y})`);
                            await updateDoc(doc(db, 'rooms', room.docId), { 
                                map_coordinates: stripUndefined(c), 
                                geometries: null,
                                display_type: 'room',
                                floor_id: room.floor_id || currentFloorId
                            });
                        } else if (c === null) {
                            console.log(`[COMMIT] Removing/Unplacing Room: ${room.name}`);
                            await updateDoc(doc(db, 'rooms', room.docId), { 
                                map_coordinates: null,
                                geometries: null
                            });
                        } else {
                            console.warn(`[SKIP] Room ${id} has invalid coordinates or state:`, c);
                        }
                    }
                } catch (err) {
                    console.error(`[ERROR] Failed to save item ${id}:`, err);
                }
            });

            // Special Case: Handle items removed from the map
            locations.forEach(loc => {
                if (!localCoords[loc.id] && loc.docId && dirtyIdsRef.current.has(loc.id)) {
                    promises.push(updateDoc(doc(db, 'locations', loc.docId), { 
                        map_coordinates: null 
                    }).catch(err => console.error(`[ERROR] Failed to remove item ${loc.id}:`, err)));
                }
            });
            
            // Save Compass Rose and Floors to Settings
            promises.push(setDoc(doc(db, 'settings', 'interactive_map'), {
                compass_rose: stripUndefined(compassRose),
                floors: stripUndefined(floors)
            }, { merge: true }).catch(err => {
                console.warn("Map Diagnostics: Failed to save settings.", err);
            }));

            await Promise.all(promises);
            
            // Re-sync local state with database to ensure no stale offsets or coordinates
            await fetchMapData();
            
            dirtyIdsRef.current.clear();
            pristineStateRef.current = null; // Clear pristine state after success
            setDraggingId(null);

            setIsEditMode(false);
            alert("Layout saved successfully!");
        } catch (error: any) {
            console.error("Error saving layout:", error);
            alert(`Error saving layout: ${error.message || error}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleEnterEditMode = () => {
        // Capture pristine state before any changes
        pristineStateRef.current = {
            rooms: JSON.parse(JSON.stringify(rooms)),
            localCoords: JSON.parse(JSON.stringify(localCoords)),
            compassRose: JSON.parse(JSON.stringify(compassRose))
        };
        setIsEditMode(true);
    };

    const handleDiscardChanges = () => {
        if (pristineStateRef.current) {
            if (dirtyIdsRef.current.size > 0 && !window.confirm("Discard all unsaved changes to the blueprint?")) {
                return;
            }
            
            // Revert to pristine state
            setRooms(pristineStateRef.current.rooms);
            setLocalCoords(pristineStateRef.current.localCoords);
            if (pristineStateRef.current.compassRose) setCompassRose(pristineStateRef.current.compassRose);
            
            // Clear dirty tracking
            dirtyIdsRef.current.clear();
            
            // Clear selection
            selectedIdsRef.current.forEach(id => setSelectionDOM(id, false));
            selectedIdsRef.current.clear();
            setDraggingId(null);
            setSelectionTick(t => t + 1);
        }
        
        setIsEditMode(false);
        pristineStateRef.current = null;
    };

    const addBlock = () => {
        if (!selectedLocationForBinding) {
            alert("Please select a location first.");
            return;
        }
        if (localCoords[selectedLocationForBinding]) {
            alert("Already on the map!");
            return;
        }

        const isPin = displayStyle === 'pin';
        // For pins, we center them so the 'tip' starts at the map center
        // Using the new 120px wide (60px offset) hit box
        const startX = Math.round((CANVAS_WIDTH / 2) / 12) * 12;
        const startY = Math.round((CANVAS_HEIGHT / 2) / 12) * 12;
        
        setLocations(prev => prev.map(l => l.id === selectedLocationForBinding ? { ...l, floor_id: currentFloorId } : l));
        markDirty(selectedLocationForBinding);
        setLocalCoords(prev => ({
            ...prev,
            [selectedLocationForBinding]: {
                x: startX,
                y: startY,
                width: isPin ? 60 : 150,
                height: isPin ? 60 : 100,
                display_type: displayStyle
            }
        }));

        // Smart Panning: Center the map on the new item
        if (wrapperRef.current) {
            const wrapper = wrapperRef.current;
            const targetX = (startX * scale) - (wrapper.clientWidth / 2) + (30 * scale);
            const targetY = (startY * scale) - (wrapper.clientHeight / 2) + (30 * scale);
            wrapper.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' });
        }

        setSelectedLocationForBinding('');
        setIsBindingMode(false);

        // Highlight the new item
        setTimeout(() => setDraggingId(selectedLocationForBinding), 100);
        setTimeout(() => setDraggingId(null), 1000);
    };

    const removeBlock = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("Remove this location from the map?")) {
            saveSnapshot();
            markDirty(id);
            selectedIdsRef.current.delete(id);
            setLocalCoords(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        }
    };

    // Updated addRoom to talk to the collection
    const addRoom = async () => {
        const roomName = window.prompt("Enter Room Name: \n\n(Note: Creating a new structural room is committed immediately to the database)");
        if (!roomName) return;

        const startX = Math.round((CANVAS_WIDTH / 2 - 150) / 12) * 12;
        const startY = Math.round((CANVAS_HEIGHT / 2 - 150) / 12) * 12;

        try {
            const newRoomData = {
                id: 'room_' + Date.now(),
                name: roomName,
                created_at: new Date().toISOString(),
                floor_id: currentFloorId,
                map_coordinates: {
                    x: startX,
                    y: startY,
                    width: 360, // 15ft
                    height: 360
                }
            };
            const docRef = await addDoc(collection(db, 'rooms'), newRoomData);
            saveSnapshot();
            setRooms(prev => [...prev, { ...newRoomData, docId: docRef.id }]);
        } catch (error) {
            console.error("Error creating room:", error);
        }
    };



    const removeFromMap = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("Hide this room from the map design? (Folder will remain in Locations)")) {
            saveSnapshot();
            markDirty(id);
            setRooms(prev => prev.map(r => (r.id === id || r.docId === id) ? { ...r, map_coordinates: null } : r));
        }
    };

    const placeExistingRoom = (roomDocId: string) => {
        const room = rooms.find(r => r.docId === roomDocId);
        if (!room) return;

        const startX = Math.round((CANVAS_WIDTH / 2 - 100) / 12) * 12;
        const startY = Math.round((CANVAS_HEIGHT / 2 - 100) / 12) * 12;

        saveSnapshot();
        markDirty(roomDocId);
        setRooms(prev => prev.map(r => r.docId === roomDocId ? {
            ...r,
            floor_id: currentFloorId,
            map_coordinates: { x: startX, y: startY, width: 200, height: 200 }
        } : r));

        // Smart Panning: Center the map on the new room
        if (wrapperRef.current) {
            const wrapper = wrapperRef.current;
            const targetX = (startX * scale) - (wrapper.clientWidth / 2) + (100 * scale);
            const targetY = (startY * scale) - (wrapper.clientHeight / 2) + (100 * scale);
            wrapper.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' });
        }
    };

    const placeAllUnplacedRooms = () => {
        const unplaced = rooms.filter(r => !r.map_coordinates);
        if (unplaced.length === 0) return;
        
        saveSnapshot();
        setRooms(prev => {
            let nextX = 120;
            let nextY = 120;
            const updated = [...prev];
            
            unplaced.forEach(room => {
                const idx = updated.findIndex(r => r.docId === room.docId);
                if (idx !== -1) {
                    updated[idx] = {
                        ...updated[idx],
                        floor_id: currentFloorId,
                        map_coordinates: { x: nextX, y: nextY, width: 360, height: 360 }
                    };
                    nextX += 400;
                    if (nextX > CANVAS_WIDTH - 400) {
                        nextX = 120;
                        nextY += 400;
                    }
                }
            });
            return updated;
        });
    };



    const handleMergeRooms = async () => {
        const selectedArr = Array.from(selectedIdsRef.current);
        const selectedRooms = rooms.filter(r => selectedArr.includes(r.docId || r.id));
        
        if (selectedRooms.length < 2) {
            alert("Please select at least 2 rooms to merge together.");
            return;
        }

        const confirmMsg = `Merge these ${selectedRooms.length} rooms ("${selectedRooms.map(r => r.name).join('", "')}") into ONE single room entity? \n\nThis will permanently: \n1. Reconcile all archive locations into the new room.\n2. Delete redundant room files from your database.\n\n(Note: This operation is committed immediately and cannot be discarded by clicking "Cancel")`;
        if (!window.confirm(confirmMsg)) return;

        setIsSaving(true);
        saveSnapshot();
        try {
            // Master room (the first one)
            const masterRoom = selectedRooms[0];
            const subRooms = selectedRooms.slice(1);
            
            // Collect all geometries
            const allGeometries: Array<any> = [];
            selectedRooms.forEach(room => {
                if (room.geometries && room.geometries.length > 0) {
                    allGeometries.push(...room.geometries);
                } else if (room.map_coordinates) {
                    allGeometries.push(room.map_coordinates);
                }
            });

            // 1. Update Master Room in Firestore
            await updateDoc(doc(db, 'rooms', masterRoom.docId!), {
                geometries: allGeometries,
                map_coordinates: null // Clear legacy flat coordinates
            });

            // 2. Reconcile Locations: Find all locations pointing to sub-rooms and point them to master room
            const locReconcilePromises: Promise<any>[] = [];
            subRooms.forEach(sub => {
                locations.filter(l => l.room_id === sub.docId).forEach(loc => {
                    locReconcilePromises.push(updateDoc(doc(db, 'locations', loc.docId!), {
                        room_id: masterRoom.docId
                    }));
                });
            });
            await Promise.all(locReconcilePromises);

            // 3. Delete Sub-Rooms from Firestore
            const deletePromises = subRooms.map(sub => deleteDoc(doc(db, 'rooms', sub.docId!)));
            await Promise.all(deletePromises);

            // 4. Update Local State
            setRooms(prev => {
                const filtered = prev.filter(r => !subRooms.some(sub => sub.docId === r.docId));
                return filtered.map(r => r.docId === masterRoom.docId ? { ...r, geometries: allGeometries, map_coordinates: null } : r);
            });

            // Clarify mapping of local locations
            setLocations(prev => prev.map(l => subRooms.some(sub => sub.docId === l.room_id) ? { ...l, room_id: masterRoom.docId } : l));

            selectedIdsRef.current.clear();
            setSelectionTick(t => t + 1);
            alert(`Drafting success! Rooms merged into "${masterRoom.name}".`);
        } catch (error) {
            console.error("Merging failed:", error);
            alert("Failed to merge rooms.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUnmergeRoom = async () => {
        if (!isEditMode || selectedIdsRef.current.size !== 1) return;
        const selectedId = Array.from(selectedIdsRef.current)[0];
        const roomToUnmerge = rooms.find(r => r.id === selectedId || r.docId === selectedId);
        
        if (!roomToUnmerge || !roomToUnmerge.geometries || roomToUnmerge.geometries.length <= 1) return;
        
        if(!window.confirm(`Unmerge "${roomToUnmerge.name}" back into ${roomToUnmerge.geometries.length} separate rooms? \n\n(Note: This operation is committed immediately and cannot be discarded by clicking "Cancel")`)) return;

        setIsSaving(true);
        saveSnapshot();
        try {
            const mainGeom = roomToUnmerge.geometries[0];
            const extractedGeoms = roomToUnmerge.geometries.slice(1);

            // 1. Restore the main room to basic coords
            await updateDoc(doc(db, 'rooms', roomToUnmerge.docId!), {
                map_coordinates: mainGeom,
                geometries: null
            });

            // 2. Spawn completely independent rooms for the broken off pieces
            const newRooms: Room[] = [];
            for (let i = 0; i < extractedGeoms.length; i++) {
                const geom = extractedGeoms[i];
                const newRoomRef = doc(collection(db, 'rooms'));
                const newData = {
                    id: 'room_ext_' + Date.now() + '_' + i,
                    name: `${roomToUnmerge.name} (Part ${i+2})`,
                    created_at: new Date().toISOString(),
                    map_coordinates: geom
                };
                await setDoc(newRoomRef, newData);
                newRooms.push({ ...newData, docId: newRoomRef.id } as any);
            }

            // 3. Update UI
            setRooms(prev => {
                const updatedMain = prev.map(r => r.docId === roomToUnmerge.docId ? {
                    ...r,
                    map_coordinates: mainGeom,
                    geometries: undefined
                } : r);
                return [...updatedMain, ...newRooms];
            });

            selectedIdsRef.current.clear();
            setSelectionTick(t => t + 1);
            alert("Rooms unmerged successfully. You can now rename and move them independently.");
        } catch (error) {
            console.error("Unmerging failed:", error);
            alert("Failed to unmerge rooms.");
        } finally {
            setIsSaving(false);
        }
    };

    const rotateItem = (id: string, type: 'room' | 'location', currentRotation: number, e: React.MouseEvent) => {
        e.stopPropagation();
        
        let deg = (currentRotation + 90) % 360;
        if (e.altKey || e.shiftKey) {
            const res = window.prompt("Enter rotation degrees:", currentRotation.toString());
            if (!res) return;
            const manual = parseInt(res, 10);
            if (isNaN(manual)) return;
            deg = manual;
        }

        saveSnapshot();
        markDirty(id);

        const is90Step = (deg % 90 === 0 && currentRotation % 90 === 0);
        const isSwapping = is90Step && (deg % 180 !== currentRotation % 180);

        if (type === 'room') {
            setRooms(prev => prev.map(r => {
                const rid = r.docId || r.id;
                if (rid === id) {
                    const updateCoords = (c: any) => {
                        if (!c) return null;
                        if (!isSwapping) return { ...c, rotation: deg };
                        
                        // Center-aware dimensional swap
                        const centerX = c.x + c.width / 2;
                        const centerY = c.y + c.height / 2;
                        const newW = c.height;
                        const newH = c.width;
                        
                        return {
                            ...c,
                            width: newW,
                            height: newH,
                            x: absoluteSnap(centerX - newW / 2),
                            y: absoluteSnap(centerY - newH / 2),
                            rotation: 0 // Dimensions are now vertical/horizontal correctly
                        };
                    };

                    return {
                        ...r,
                        map_coordinates: updateCoords(r.map_coordinates),
                        geometries: r.geometries ? r.geometries.map(updateCoords) : undefined
                    };
                }
                return r;
            }));
        } else {
            setLocalCoords(prev => {
                const c = prev[id];
                if (!c) return prev;
                
                if (!isSwapping) return { ...prev, [id]: { ...c, rotation: deg } };

                const centerX = c.x + c.width / 2;
                const centerY = c.y + c.height / 2;
                const newW = c.height;
                const newH = c.width;

                return {
                    ...prev,
                    [id]: {
                        ...c,
                        width: newW,
                        height: newH,
                        x: absoluteSnap(centerX - newW / 2),
                        y: absoluteSnap(centerY - newH / 2),
                        rotation: 0
                    }
                };
            });
        }
    };

    const setSelectionDOM = (id: string, select: boolean) => {
        const elements = document.querySelectorAll(`[data-selection-id="${id}"]`);
        elements.forEach(el => {
            el.setAttribute('data-selected', select ? 'true' : 'false');
        });
    };

    const handleItemSelection = (id: string, e: any) => {
        if (!isEditMode) return;
        const isShift = e.shiftKey;
        
        let stateChanged = false;

        // If not shift, clear previous selection...
        if (!isShift) {
            if (selectedIdsRef.current.size > 1 || !selectedIdsRef.current.has(id)) {
                selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
                selectedIdsRef.current.clear();
                stateChanged = true;
            }
        }

        if (selectedIdsRef.current.has(id)) {
            // Only toggle off if shift is held
            if (isShift) {
                selectedIdsRef.current.delete(id);
                setSelectionDOM(id, false);
                stateChanged = true;
            }
        } else {
            selectedIdsRef.current.add(id);
            setSelectionDOM(id, true);
            stateChanged = true;
        }
        
        if (stateChanged) {
            setSelectionTick(t => t + 1);
        }
    };

    const markDirty = (id: string) => {
        dirtyIdsRef.current.add(id);
    };

    const handleCanvasClick = (e: React.MouseEvent) => {
        if (skipNextClickRef.current) return;
        if ((e.target as HTMLElement).closest('.react-draggable') || (e.target as HTMLElement).closest('button')) return;
        selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
        selectedIdsRef.current.clear();
        setSelectionTick(t => t + 1);
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (!isEditMode) return;
        if ((e.target as HTMLElement).closest('.react-draggable') || (e.target as HTMLElement).closest('button')) return;
        
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        
        if (!e.shiftKey) {
            selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
            selectedIdsRef.current.clear();
            setSelectionTick(t => t + 1);
        }
        
        setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!selectionBox) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        setSelectionBox(prev => prev ? { ...prev, endX: x, endY: y } : null);
    };

    const handleCanvasMouseUp = (e: React.MouseEvent) => {
        if (!selectionBox) return;
        
        const left = Math.min(selectionBox.startX, selectionBox.endX);
        const top = Math.min(selectionBox.startY, selectionBox.endY);
        const right = Math.max(selectionBox.startX, selectionBox.endX);
        const bottom = Math.max(selectionBox.startY, selectionBox.endY);
        
        if (Math.abs(selectionBox.endX - selectionBox.startX) > 5 || Math.abs(selectionBox.endY - selectionBox.startY) > 5) {
            skipNextClickRef.current = true;
            setTimeout(() => { skipNextClickRef.current = false; }, 100);
            
            let stateChanged = false;

            // Check Rooms
            rooms.filter(r => r.name?.toLowerCase() !== 'compass rose' && (r.floor_id || 'default') === currentFloorId).forEach(room => {
                const geometries = room.geometries || (room.map_coordinates ? [room.map_coordinates] : []);
                geometries.forEach(g => {
                    if (g.x < right && (g.x + g.width) > left && g.y < bottom && (g.y + g.height) > top) {
                        if (!selectedIdsRef.current.has(room.docId!)) {
                            selectedIdsRef.current.add(room.docId!);
                            setSelectionDOM(room.docId!, true);
                            stateChanged = true;
                        }
                    }
                });
            });

            // Check Locations
            locations.filter(loc => (loc.floor_id || 'default') === currentFloorId && localCoords[loc.id]).forEach(loc => {
                const c = localCoords[loc.id];
                let cLeft = c.x;
                let cTop = c.y;
                let cRight = c.x + c.width;
                let cBottom = c.y + c.height;

                if (c.display_type === 'pin') {
                    cLeft = c.x - 24;
                    cTop = c.y - 48;
                    cRight = c.x + 24;
                    cBottom = c.y;
                }

                if (cLeft < right && cRight > left && cTop < bottom && cBottom > top) {
                    if (!selectedIdsRef.current.has(loc.id)) {
                        selectedIdsRef.current.add(loc.id);
                        setSelectionDOM(loc.id, true);
                        stateChanged = true;
                    }
                }
            });

            if (stateChanged) setSelectionTick(t => t + 1);
        }
        
        setSelectionBox(null);
    };

    const handleGroupDragStart = (draggedId: string, _draggedIndex?: number, e?: any) => {
        if (!isEditMode) return;

        // Safety: If dragging an unselected item without shift, force it to be the sole selection
        if (!selectedIdsRef.current.has(draggedId) && (!e || !e.shiftKey)) {
            selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
            selectedIdsRef.current.clear();
            selectedIdsRef.current.add(draggedId);
            setSelectionDOM(draggedId, true);
            // We consciously avoid setSelectionTick(t + 1) here to avoid resetting Rnd's internal drag state
        }

        setDraggingId(draggedId);
        setGroupDragOffset({ x: 0, y: 0 });
        dragStartPosRef.current = {};
        
        // Track start position for EVERY selected item (and internal room geometries)
        selectedIdsRef.current.forEach(id => {
            // Priority 1: Check if it's a structural room
            const room = rooms.find(r => r.docId === id || r.id === id);
            if (room) {
                if (room.geometries && room.geometries.length > 0) {
                    room.geometries.forEach((g, gi) => {
                        dragStartPosRef.current[`${id}-geom-${gi}`] = { x: g.x, y: g.y };
                    });
                    dragStartPosRef.current[id] = { x: room.geometries[0].x, y: room.geometries[0].y };
                } else if (room.map_coordinates) {
                    dragStartPosRef.current[`${id}-geom-0`] = { x: room.map_coordinates.x, y: room.map_coordinates.y };
                    dragStartPosRef.current[id] = { x: room.map_coordinates.x, y: room.map_coordinates.y };
                }
                return;
            }

            // Priority 2: Check if it's a location pin/block
            const lCoords = localCoords[id];
            if (lCoords) {
                dragStartPosRef.current[id] = { x: lCoords.x, y: lCoords.y };
                dragStartPosRef.current[`${id}-geom-0`] = { x: lCoords.x, y: lCoords.y };
            }
        });
    };

    const handleGroupDrag = (draggedId: string, draggedIndex: number | undefined, d: { x: number, y: number }) => {
        const start = draggedIndex !== undefined 
            ? dragStartPosRef.current[`${draggedId}-geom-${draggedIndex}`] 
            : dragStartPosRef.current[draggedId];
        
        // Safety: Prevent jumping to (0,0) or NaN
        if (!start || isNaN(d.x) || isNaN(d.y)) return;
        
        const offsetX = d.x - start.x;
        const offsetY = d.y - start.y;

        setGroupDragOffset({ x: offsetX, y: offsetY });
    };

    const handleGroupDragStopStateSync = (draggedId: string, draggedIndex: number | undefined, d: { x: number, y: number }) => {
        setGroupDragOffset(null);
        setDraggingId(null);

        const start = draggedIndex !== undefined 
            ? dragStartPosRef.current[`${draggedId}-geom-${draggedIndex}`] 
            : dragStartPosRef.current[draggedId];
        
        if (!start) return;
        
        const offsetX = d.x - start.x;
        const offsetY = d.y - start.y;

        // Capture snapshot of starting positions BEFORE state updates to avoid race conditions
        const snapshotPositions = { ...dragStartPosRef.current };

        saveSnapshot();

        // Update Rooms (including all internal geometries for merged rooms)
        setRooms(prev => prev.map(r => {
            const id = r.docId || r.id;
            if (selectedIdsRef.current.has(id)) {
                markDirty(id);
                // If it has geometries, update all of them by the offset
                if (r.geometries && r.geometries.length > 0) {
                    return {
                        ...r,
                        geometries: r.geometries.map((gc: any, gi: number) => {
                            const gStart = snapshotPositions[`${id}-geom-${gi}`] || gc;
                            return {
                                ...gc,
                                x: absoluteSnap(gStart.x + offsetX),
                                y: absoluteSnap(gStart.y + offsetY)
                            };
                        })
                    };
                }
                // Legacy single-coords room
                const sStart = snapshotPositions[id];
                if (r.map_coordinates && sStart) {
                    return {
                        ...r,
                        map_coordinates: {
                            ...r.map_coordinates,
                            x: absoluteSnap(sStart.x + offsetX),
                            y: absoluteSnap(sStart.y + offsetY)
                        }
                    };
                }
            }
            return r;
        }));

        // Update Locations (Shelves/Pins)
        setLocalCoords(prev => {
            const next = { ...prev };
            let hasChanges = false;
            
            Object.keys(next).forEach(id => {
                const sStart = snapshotPositions[id];
                if (selectedIdsRef.current.has(id) && sStart) {
                    const finalX = absoluteSnap(sStart.x + offsetX);
                    const finalY = absoluteSnap(sStart.y + offsetY);
                    
                    if (!isNaN(finalX) && !isNaN(finalY)) {
                        markDirty(id);
                        next[id] = {
                            ...next[id],
                            x: finalX,
                            y: finalY
                        };
                        hasChanges = true;
                    }
                }
            });
            return hasChanges ? next : prev;
        });
        
        // Clear manual transforms applied during drag
        selectedIdsRef.current.forEach(id => {
            const labelNode = document.getElementById(`room-label-${id}`);
            if (labelNode) {
                labelNode.style.transform = '';
            }
        });
        
        setDraggingId(null);
        setSelectionTick(t => t + 1); // Finally sync selection UI
    };

    const handleUpdateLocationProperty = (id: string, property: 'width' | 'height' | 'x' | 'y' | 'rotation' | 'scale', value: string | number) => {
        saveSnapshot();
        markDirty(id);
        
        const val = typeof value === 'string' && value !== "" ? parseFloat(value) : (typeof value === 'number' ? value : 0);
        if (isNaN(val)) return;

        // Units conversion: feet to pixels for spatial properties
        // NEW: 'scale' is a raw multiplier, rotation is raw degrees
        const pixels = (property === 'rotation' || property === 'scale') ? val : absoluteSnap(val * PIXELS_PER_FOOT);

        setLocalCoords(prev => {
            const c = prev[id];
            if (!c) return prev;

            // If rotation makes it vertical/horizontal, swap dimensions to match the physical box
            if (property === 'rotation' && val % 180 !== (c.rotation || 0) % 180 && val % 90 === 0) {
                const centerX = c.x + c.width / 2;
                const centerY = c.y + c.height / 2;
                return {
                    ...prev,
                    [id]: {
                        ...c,
                        width: c.height,
                        height: c.width,
                        x: absoluteSnap(centerX - c.height / 2),
                        y: absoluteSnap(centerY - c.width / 2),
                        rotation: 0
                    }
                };
            }

            return {
                ...prev,
                [id]: { ...c, [property]: pixels }
            };
        });
    };

    const handleUpdateRoomProperty = (id: string, property: 'name' | 'width' | 'height' | 'x' | 'y' | 'rotation', value: string | number, index?: number) => {
        // If it's a name update, don't snapshot every keystroke to avoid spam
        if (property !== 'name') saveSnapshot();
        
        markDirty(id);
        setRooms(prev => prev.map(r => {
            const rid = r.docId || r.id;
            if (rid === id) {
                if (property === 'name') return { ...r, name: value as string };
                
                const val = typeof value === 'string' && value !== "" ? parseFloat(value) : (typeof value === 'number' ? value : 0);
                if (isNaN(val)) return r;

                // Units conversion: feet to pixels for spatial properties
                const pixels = (property === 'rotation') ? val : absoluteSnap(val * PIXELS_PER_FOOT);

                // If rotation makes it vertical/horizontal, swap dimensions to match the physical box
                if (property === 'rotation' && val % 180 !== (r.geometries?.[index || 0]?.rotation || r.map_coordinates?.rotation || 0) % 180 && val % 90 === 0) {
                    const updateCoords = (c: any, i: number) => {
                        if (index !== undefined && i !== index) return c;
                        const centerX = c.x + c.width / 2;
                        const centerY = c.y + c.height / 2;
                        return {
                            ...c,
                            width: c.height,
                            height: c.width,
                            x: absoluteSnap(centerX - c.height / 2),
                            y: absoluteSnap(centerY - c.width / 2),
                            rotation: 0
                        };
                    };
                    return {
                        ...r,
                        map_coordinates: r.map_coordinates ? updateCoords(r.map_coordinates, 0) : null,
                        geometries: r.geometries ? r.geometries.map(updateCoords) : undefined
                    };
                }

                if (r.geometries && r.geometries.length > 0) {
                    const targetIndex = index ?? 0;
                    return {
                        ...r,
                        geometries: r.geometries.map((g, i) => i === targetIndex ? { ...g, [property]: pixels } : g)
                    };
                }
                if (r.map_coordinates) {
                    return {
                        ...r,
                        map_coordinates: { ...r.map_coordinates, [property]: pixels }
                    };
                }
            }
            return r;
        }));
    };

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault(); // This is the key to preventing the browser itself from zooming

            // Use an exponential multiplier for a much smoother zoom feel
            const zoomSpeed = 0.001;
            const factor = Math.exp(-e.deltaY * zoomSpeed);
            
            setScale(currentScale => {
                const newScale = Math.max(0.1, Math.min(3, currentScale * factor));
                
                if (newScale !== currentScale) {
                    const rect = wrapper.getBoundingClientRect();
                    
                    // Mouse position relative to the wrapper viewport
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    
                    // Current scroll positions
                    const scrollX = wrapper.scrollLeft;
                    const scrollY = wrapper.scrollTop;
                    
                    // Keep the point under the cursor stationary
                    const ratio = newScale / currentScale;
                    const newScrollX = (scrollX + mouseX) * ratio - mouseX;
                    const newScrollY = (scrollY + mouseY) * ratio - mouseY;
                    
                    // Apply scroll adjustment in the next frame
                    requestAnimationFrame(() => {
                        wrapper.scrollLeft = newScrollX;
                        wrapper.scrollTop = newScrollY;
                    });
                }
                return newScale;
            });
        };

        wrapper.addEventListener('wheel', onWheel, { passive: false });
        return () => wrapper.removeEventListener('wheel', onWheel);
    }, []);

    const currentFloorObj = floors.find(f => f.id === currentFloorId);
    const floorBeneath = currentFloorObj ? floors.filter(f => f.level < currentFloorObj.level).sort((a,b) => b.level - a.level)[0] : null;

    return (
        <div className="relative flex flex-col h-full animate-in fade-in duration-500 overflow-hidden bg-cream" onClick={handleCanvasClick}>
            <div className="bg-white border-b border-tan-light/50 p-4 md:px-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 z-20 shrink-0">
                <div className="flex items-center gap-6">
                    <div>
                        <h1 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2">
                            <MapPin className="text-tan" size={24} /> Museum Blueprint
                        </h1>
                        <p className="text-[10px] text-charcoal/40 font-bold uppercase tracking-widest mt-0.5 ml-8">Interactive digital floor plan</p>
                    </div>

                    <div className="flex items-center gap-2 border-l border-tan-light/50 pl-6">
                        <select 
                            className="bg-cream p-2 rounded-lg border border-tan/20 text-sm font-serif font-bold text-charcoal outline-none focus:ring-1 focus:ring-tan cursor-pointer hover:bg-tan/5 transition-colors"
                            value={currentFloorId}
                            onChange={(e) => setCurrentFloorId(e.target.value)}
                        >
                            {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        {floorBeneath && (
                            <button
                                onClick={() => setShowUnderlay(!showUnderlay)}
                                className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${showUnderlay ? 'bg-blue-500 text-white shadow-inner' : 'bg-tan/10 text-tan hover:bg-tan/20'} ml-1`}
                                title={`Toggle Underlay (${floorBeneath.name})`}
                            >
                                <Layers size={18} />
                            </button>
                        )}
                        {isEditMode && (
                            <button 
                                onClick={() => {
                                    const name = window.prompt("Enter new floor name (e.g. Basement):");
                                    if (!name) return;
                                    const levelStr = window.prompt("Enter vertical level number (e.g. -1 for below main, 1 for above):", "1");
                                    const level = parseInt(levelStr || "0", 10);
                                    if (isNaN(level)) return;
                                    
                                    const newFloor = { id: 'floor_' + Date.now(), name, level };
                                    saveSnapshot();
                                    setFloors(prev => [...prev, newFloor].sort((a,b) => b.level - a.level));
                                    setCurrentFloorId(newFloor.id);
                                }}
                                className="p-2 bg-tan/10 text-tan rounded-lg hover:bg-tan hover:text-white transition-colors"
                                title="Add New Floor"
                            >
                                <Plus size={18} />
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-cream rounded-lg p-1 border border-tan-light/30">
                        <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="p-2 hover:bg-white rounded hover:text-tan"><ZoomOut size={16}/></button>
                        <span className="text-xs font-mono font-bold px-2 w-12 text-center">{(scale * 100).toFixed(0)}%</span>
                        <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-2 hover:bg-white rounded hover:text-tan"><ZoomIn size={16}/></button>
                        <button onClick={handleFitToScreen} className="p-2 hover:bg-white rounded hover:text-tan ml-1"><Maximize size={16}/></button>
                    </div>

                    {isSAHSUser && (
                        <div className="flex items-center gap-3 ml-4 border-l border-tan-light/50 pl-4">
                            {isEditMode ? (
                                <>
                                    <button onClick={handleSaveLayout} disabled={isSaving} className="bg-tan text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">{isSaving?"Saving...":"Save Changes"}</button>
                                    <button onClick={handleDiscardChanges} className="text-sm font-bold text-charcoal">Cancel</button>
                                </>
                            ) : (
                                <button onClick={handleEnterEditMode} className="flex items-center gap-2 bg-white border border-tan-light shadow-sm text-charcoal px-4 py-2 rounded-lg text-sm font-bold hover:bg-tan-light/10 transition-colors">
                                    <Edit3 size={16} className="text-tan"/> <span>Edit Blueprint</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {isEditMode && (
                <Rnd
                    size={isSidebarMinimized ? { width: 220, height: 48 } : { width: 320, height: 480 }}
                    position={sidebarPos}
                    onDragStop={(_e, d) => setSidebarPos({ x: d.x, y: d.y })}
                    disableDragging={false}
                    enableResizing={!isSidebarMinimized}
                    bounds="parent"
                    className="z-[300]"
                >
                    <div className={`bg-white rounded-xl shadow-2xl border-2 border-tan overflow-hidden flex flex-col h-full ${isSidebarMinimized ? 'opacity-90' : ''}`}>
                        <div className="bg-tan/5 border-b border-tan-light/30 px-4 py-3 flex justify-between items-center cursor-move shrink-0">
                            <h3 className="font-serif font-bold text-charcoal flex items-center gap-2">
                                <LayoutGrid size={16} className="text-tan"/> Layout Tools
                            </h3>
                            <button onClick={() => setIsSidebarMinimized(!isSidebarMinimized)} className="p-1 hover:bg-tan/10 rounded transition-colors text-tan">
                                {isSidebarMinimized ? <Maximize2 size={16}/> : <X size={16}/>}
                            </button>
                        </div>

                        {!isSidebarMinimized && (
                            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                                {/* Diagnostic Stats */}
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    <div className="bg-tan/5 p-2 rounded-lg border border-tan/20">
                                        <p className="text-[10px] font-black uppercase text-tan/60 mb-0.5">Rooms</p>
                                        <p className="font-mono text-xs font-bold text-charcoal">{rooms.length} Loaded</p>
                                    </div>
                                    <div className="bg-charcoal/5 p-2 rounded-lg border border-charcoal/10">
                                        <p className="text-[10px] font-black uppercase text-charcoal/40 mb-0.5">Locations</p>
                                        <p className="font-mono text-xs font-bold text-charcoal">{locations.length} Total</p>
                                    </div>
                                </div>
                                
                                {isBindingMode ? (
                                    <div className="space-y-3 p-3 bg-tan/5 rounded-lg border border-tan/20 animate-in slide-in-from-top-2">
                                        <div>
                                            <p className="text-[9px] font-black uppercase text-tan/60 mb-2 tracking-tighter">Step 1: Choose Style</p>
                                            <div className="flex gap-1 mb-3">
                                                <button 
                                                    onClick={() => setDisplayStyle('box')} 
                                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all ${displayStyle === 'box' ? 'bg-tan text-white shadow-md' : 'bg-white border border-tan/20 text-tan/60'}`}
                                                >
                                                    <Square size={12}/> Block
                                                </button>
                                                <button 
                                                    onClick={() => setDisplayStyle('pin')} 
                                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all ${displayStyle === 'pin' ? 'bg-tan text-white shadow-md' : 'bg-white border border-tan/20 text-tan/60'}`}
                                                >
                                                    <MapPin size={12}/> Pin
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[9px] font-black uppercase text-tan/60 mb-2 tracking-tighter">Step 2: Select Location</p>
                                            {(() => {
                                                const unplaced = locations.filter(l => l.name?.toLowerCase() !== 'compass rose' && !localCoords[l.id]);
                                                if (unplaced.length === 0) {
                                                    return (
                                                        <div className="bg-white border-2 border-dashed border-tan/20 p-4 rounded-lg text-center">
                                                            <p className="text-xs italic text-charcoal/40 mb-2">No unplaced locations found.</p>
                                                            <Link to="/manage-locations" className="text-[10px] font-black uppercase text-tan hover:text-charcoal underline">Add New Location</Link>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <select className="w-full bg-cream p-2 rounded border border-tan/20 text-sm font-serif font-bold text-charcoal outline-none focus:ring-1 focus:ring-tan" value={selectedLocationForBinding} onChange={e=>setSelectedLocationForBinding(e.target.value)}>
                                                        <option value="">Select location...</option>
                                                        {unplaced.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                                                    </select>
                                                );
                                            })()}
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <button onClick={addBlock} className="flex-1 bg-charcoal text-white py-2.5 rounded-lg text-xs font-black uppercase tracking-widest shadow-lg hover:bg-black transition-all">Place {displayStyle === 'pin' ? 'Pin' : 'Block'}</button>
                                            <button onClick={()=>setIsBindingMode(false)} className="px-3 bg-white border border-charcoal/10 text-charcoal/60 text-xs rounded-lg hover:bg-charcoal/5 transition-colors">Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {selectedIdsRef.current.size >= 2 && (
                                            <button onClick={handleMergeRooms} className="w-full flex items-center justify-center gap-2 bg-tan text-white py-3 rounded-lg text-sm font-black uppercase tracking-widest shadow-md hover:bg-charcoal transition-all mb-4 animate-in zoom-in-95">
                                                Merge Selected Rooms
                                            </button>
                                        )}
                                        {(() => {
                                            const sl = selectedIdsRef.current.size === 1 ? rooms.find(r => r.docId === Array.from(selectedIdsRef.current)[0] || r.id === Array.from(selectedIdsRef.current)[0]) : null;
                                            return sl && sl.geometries && sl.geometries.length > 1 ? (
                                                <button onClick={handleUnmergeRoom} className="w-full flex items-center justify-center gap-2 bg-red-800/80 text-white py-3 rounded-lg text-sm font-black uppercase tracking-widest shadow-md hover:bg-red-700 transition-all mb-4 animate-in zoom-in-95">
                                                    Unmerge Block
                                                </button>
                                            ) : null;
                                        })()}
                                        <button onClick={()=>setIsBindingMode(true)} className="w-full flex items-center justify-center gap-2 bg-tan/10 text-tan border border-tan/30 border-dashed py-3 rounded-lg text-sm font-bold hover:bg-tan hover:text-white transition-all"><Plus size={18}/> Place Location</button>
                                        <button onClick={addRoom} className="w-full flex items-center justify-center gap-2 bg-charcoal/5 border py-3 rounded-lg text-sm font-bold hover:bg-charcoal hover:text-white transition-all"><BoxSelect size={18}/> New Structural Room</button>
                                        
                                        {/* Single/Merged Room Editor or Location Editor */}
                                        {(() => {
                                            const selectedArr = Array.from(selectedIdsRef.current);
                                            if (selectedArr.length !== 1) return null;
                                            
                                            const id = selectedArr[0];
                                            const room = rooms.find(r => r.docId === id || r.id === id);
                                            const location = !room ? locations.find(l => l.id === id || l.docId === id) : null;
                                            const locCoords = !room ? localCoords[id] : null;

                                            if (room) {
                                                const geometries = room.geometries || (room.map_coordinates ? [room.map_coordinates] : []);
                                                return (
                                                    <div className="mt-6 pt-6 border-t border-tan-light/50 animate-in slide-in-from-bottom-2">
                                                        <h4 className="text-[10px] font-black uppercase text-tan/80 tracking-[0.2em] mb-4">Edit Room Properties</h4>
                                                        <div className="space-y-6">
                                                            <div>
                                                                <label className="text-[10px] font-bold text-charcoal/40 uppercase mb-1 block">Room Identity</label>
                                                                <input 
                                                                    type="text" 
                                                                    value={room.name} 
                                                                    onChange={(e) => handleUpdateRoomProperty(id, 'name', e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            (e.target as HTMLInputElement).blur();
                                                                        }
                                                                    }}
                                                                    className="w-full bg-cream/50 border border-tan/20 rounded-lg px-3 py-2 text-sm font-serif font-bold text-charcoal focus:ring-2 focus:ring-tan/50 outline-none"
                                                                />
                                                            </div>

                                                            <div className="space-y-3 pb-4">
                                                                <label className="text-[10px] font-bold text-charcoal/40 uppercase block">Spatial Blocks</label>
                                                                {geometries.map((geom, idx) => (
                                                                    <div 
                                                                        key={idx} 
                                                                        className={`p-3 rounded-lg border transition-all ${hoveredBlock?.roomId === id && hoveredBlock.index === idx ? 'bg-tan/10 border-tan/40 shadow-sm' : 'bg-tan/5 border-tan/10'}`}
                                                                        onMouseEnter={() => setHoveredBlock({ roomId: id, index: idx })}
                                                                        onMouseLeave={() => setHoveredBlock(null)}
                                                                    >
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <span className="text-[10px] font-black text-tan/60 uppercase">Section {idx + 1}</span>
                                                                            {geometries.length > 1 && <span className="text-[9px] font-mono text-tan/40">{(geom.width * geom.height / (PIXELS_PER_FOOT**2)).toFixed(1)} sq.ft.</span>}
                                                                        </div>
                                                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                                                            <div>
                                                                                <label className="text-[9px] font-bold text-charcoal/30 uppercase mb-0.5 block">Width (ft)</label>
                                                                                <input 
                                                                                    type="number" 
                                                                                    step="0.5"
                                                                                    value={geom.width / PIXELS_PER_FOOT} 
                                                                                    onChange={(e) => handleUpdateRoomProperty(id, 'width', e.target.value, idx)}
                                                                                    className="w-full bg-white border border-tan/10 rounded px-2 py-1 text-xs font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-[9px] font-bold text-charcoal/30 uppercase mb-0.5 block">Height (ft)</label>
                                                                                <input 
                                                                                    type="number" 
                                                                                    step="0.5"
                                                                                    value={geom.height / PIXELS_PER_FOOT} 
                                                                                    onChange={(e) => handleUpdateRoomProperty(id, 'height', e.target.value, idx)}
                                                                                    className="w-full bg-white border border-tan/10 rounded px-2 py-1 text-xs font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="grid grid-cols-3 gap-2">
                                                                            <div>
                                                                                <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">X Pos (ft)</label>
                                                                                <input 
                                                                                    type="number" 
                                                                                    step="0.5"
                                                                                    value={geom.x / PIXELS_PER_FOOT} 
                                                                                    onChange={(e) => handleUpdateRoomProperty(id, 'x', e.target.value, idx)}
                                                                                    className="w-full bg-tan/5 border border-tan/10 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">Y Pos (ft)</label>
                                                                                <input 
                                                                                    type="number" 
                                                                                    step="0.5"
                                                                                    value={geom.y / PIXELS_PER_FOOT} 
                                                                                    onChange={(e) => handleUpdateRoomProperty(id, 'y', e.target.value, idx)}
                                                                                    className="w-full bg-tan/5 border border-tan/10 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">Rot (deg)</label>
                                                                                <input 
                                                                                    type="number" 
                                                                                    step="90"
                                                                                    value={geom.rotation || 0} 
                                                                                    onChange={(e) => handleUpdateRoomProperty(id, 'rotation', e.target.value, idx)}
                                                                                    className="w-full bg-tan/5 border border-tan/10 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (location && locCoords) {
                                                return (
                                                    <div className="mt-6 pt-6 border-t border-tan-light/50 animate-in slide-in-from-bottom-2">
                                                        <h4 className="text-[10px] font-black uppercase text-tan/80 tracking-[0.2em] mb-4">Edit Location: {location.name}</h4>
                                                        <div className="space-y-4">
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div>
                                                                    <label className="text-[9px] font-bold text-charcoal/30 uppercase mb-0.5 block">Width (ft)</label>
                                                                    <input 
                                                                        type="number" 
                                                                        step="0.5"
                                                                        disabled={locCoords.display_type === 'pin'}
                                                                        value={locCoords.width / PIXELS_PER_FOOT} 
                                                                        onChange={(e) => handleUpdateLocationProperty(id, 'width', e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                (e.target as HTMLInputElement).blur();
                                                                            }
                                                                        }}
                                                                        className="w-full bg-white border border-tan/10 rounded px-2 py-1 text-xs font-mono font-bold text-charcoal outline-none focus:border-tan disabled:opacity-50"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[9px] font-bold text-charcoal/30 uppercase mb-0.5 block">Height (ft)</label>
                                                                    <input 
                                                                        type="number" 
                                                                        step="0.5"
                                                                        disabled={locCoords.display_type === 'pin'}
                                                                        value={locCoords.height / PIXELS_PER_FOOT} 
                                                                        onChange={(e) => handleUpdateLocationProperty(id, 'height', e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                (e.target as HTMLInputElement).blur();
                                                                            }
                                                                        }}
                                                                        className="w-full bg-white border border-tan/10 rounded px-2 py-1 text-xs font-mono font-bold text-charcoal outline-none focus:border-tan disabled:opacity-50"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-2">
                                                                <div>
                                                                    <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">X Pos (ft)</label>
                                                                    <input 
                                                                        type="number" 
                                                                        step="0.5"
                                                                        value={locCoords.x / PIXELS_PER_FOOT} 
                                                                        onChange={(e) => handleUpdateLocationProperty(id, 'x', e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                (e.target as HTMLInputElement).blur();
                                                                            }
                                                                        }}
                                                                        className="w-full bg-tan/5 border border-tan/10 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">Y Pos (ft)</label>
                                                                    <input 
                                                                        type="number" 
                                                                        step="0.5"
                                                                        value={locCoords.y / PIXELS_PER_FOOT} 
                                                                        onChange={(e) => handleUpdateLocationProperty(id, 'y', e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                (e.target as HTMLInputElement).blur();
                                                                            }
                                                                        }}
                                                                        className="w-full bg-tan/5 border border-tan/10 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">Rot (deg)</label>
                                                                    <input 
                                                                        type="number" 
                                                                        step="90"
                                                                        value={locCoords.rotation || 0} 
                                                                        onChange={(e) => handleUpdateLocationProperty(id, 'rotation', e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                (e.target as HTMLInputElement).blur();
                                                                            }
                                                                        }}
                                                                        className="w-full bg-tan/5 border border-tan/10 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {locCoords.display_type === 'pin' && (
                                                                <div className="pt-2">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <label className="text-[9px] font-bold text-charcoal/30 uppercase block">Pin Scale</label>
                                                                        <span className="text-[10px] font-mono font-bold text-tan">{Math.round((locCoords.scale || 1) * 100)}%</span>
                                                                    </div>
                                                                    <input 
                                                                        type="range"
                                                                        min="0.3"
                                                                        max="2.0"
                                                                        step="0.05"
                                                                        value={locCoords.scale || 1}
                                                                        onChange={(e) => handleUpdateLocationProperty(id, 'scale', e.target.value)}
                                                                        className="w-full accent-tan h-1.5 bg-tan/10 rounded-lg appearance-none cursor-pointer"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return null;
                                        })()}

                                        <div className="mt-4 pt-4 border-t border-tan-light/50">
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="text-[10px] font-bold text-charcoal/40 uppercase tracking-widest leading-none">Unplaced Rooms</h4>
                                                {rooms.filter(r => 
                                                    r.name?.toLowerCase() !== 'compass rose' && 
                                                    !r.map_coordinates && 
                                                    (!r.geometries || r.geometries.length === 0)
                                                ).length > 1 && (
                                                    <button onClick={placeAllUnplacedRooms} className="text-[9px] font-black uppercase text-tan hover:text-charcoal bg-tan/5 px-2 py-1 rounded transition-colors">Place All</button>
                                                )}
                                            </div>
                                            {rooms.filter(r => 
                                                r.name?.toLowerCase() !== 'compass rose' && 
                                                !r.map_coordinates && 
                                                (!r.geometries || r.geometries.length === 0)
                                            ).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).map(r => (
                                                <button key={r.docId} onClick={()=>placeExistingRoom(r.docId!)} className="w-full text-left text-xs bg-cream p-2 rounded mb-1 flex justify-between items-center hover:bg-tan/10 group font-bold">
                                                    {r.name} <Plus size={12} className="opacity-0 group-hover:opacity-100"/>
                                                </button>
                                            ))}
                                            {rooms.filter(r => 
                                                r.name?.toLowerCase() !== 'compass rose' && 
                                                !r.map_coordinates && 
                                                (!r.geometries || r.geometries.length === 0)
                                            ).length === 0 && <p className="text-[10px] italic text-charcoal/30 font-bold border border-dashed border-charcoal/10 p-2 rounded text-center">All rooms are currently on map</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Rnd>
            )}

            <div 
                ref={wrapperRef} 
                className="workspace-wrapper flex-1 overflow-auto relative bg-[#f5f5f0] shadow-inner flex p-20"
            >
                <style>{`
                    .blueprint-grid {
                        background-size: 24px 24px;
                        background-image: linear-gradient(to right, rgba(140,120,100,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(140,120,100,0.1) 1px, transparent 1px);
                    }
                    [data-selected="true"] { outline: 3px solid #c4a484 !important; outline-offset: 2px !important; }
                    
                    @keyframes map-pulse {
                        0% { outline: 4px solid #3b82f6; outline-offset: 0px; box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
                        70% { outline: 6px solid transparent; outline-offset: 15px; box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
                        100% { outline: 4px solid transparent; outline-offset: 20px; box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
                    }
                    [data-highlighted="true"] { 
                        animation: map-pulse 1.5s infinite ease-in-out;
                        z-index: 200 !important;
                        outline: 3px solid #3b82f6 !important;
                    }
                `}</style>

                {!loading && (
                    <div className="relative flex-shrink-0 m-auto shadow-2xl bg-white border border-tan-light/30" style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
                                <div className="absolute top-0 left-0 blueprint-grid" onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp} style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                                    {/* Render Marquee Selection Box */}
                                    {selectionBox && (
                                        <div 
                                            className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-[500]"
                                            style={{
                                                left: Math.min(selectionBox.startX, selectionBox.endX),
                                                top: Math.min(selectionBox.startY, selectionBox.endY),
                                                width: Math.abs(selectionBox.endX - selectionBox.startX),
                                                height: Math.abs(selectionBox.endY - selectionBox.startY)
                                            }}
                                        />
                                    )}
                                    {/* Render Ghost Underlay */}
                                    {showUnderlay && floorBeneath && rooms.filter(r => r.name?.toLowerCase() !== 'compass rose' && (r.floor_id || 'default') === floorBeneath.id).map(room => {
                                        const geometries = room.geometries || (room.map_coordinates ? [room.map_coordinates] : []);
                                        if (geometries.length === 0) return null;

                                        return (
                                            <Fragment key={`ghost-${room.docId}`}>
                                                {geometries.map((c, i) => (
                                                    <div 
                                                        key={`ghost-${room.docId}-box-${i}`}
                                                        className="absolute pointer-events-none z-0"
                                                        style={{ 
                                                            left: c.x,
                                                            top: c.y,
                                                            width: c.width,
                                                            height: c.height,
                                                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                                            border: '2px dashed rgba(59, 130, 246, 0.5)',
                                                            transform: `rotate(${c.rotation || 0}deg)`
                                                        }}
                                                    />
                                                ))}
                                            </Fragment>
                                        );
                                    })}

                                    {/* Render Rooms */}
                                    {rooms.filter(r => r.name?.toLowerCase() !== 'compass rose' && (r.floor_id || 'default') === currentFloorId).map(room => {
                                const geometries = room.geometries || (room.map_coordinates ? [room.map_coordinates] : []);
                                if (geometries.length === 0) return null;

                                // Compute Label Anchor (Midpoint of shared seams if merged, else bounding box center)
                                let anchorX = 0, anchorY = 0;
                                const internalMidpoints: {x: number, y: number}[] = [];
                                const threshold = 2;

                                geometries.forEach((g1, i) => {
                                    geometries.forEach((g2, j) => {
                                        if (i >= j) return;
                                        // Check shared vertical edge
                                        if (Math.abs(g1.x - (g2.x + g2.width)) < threshold || Math.abs(g2.x - (g1.x + g1.width)) < threshold) {
                                            const overlapY_Start = Math.max(g1.y, g2.y);
                                            const overlapY_End = Math.min(g1.y + g1.height, g2.y + g2.height);
                                            if (overlapY_Start < overlapY_End) {
                                                internalMidpoints.push({ x: (g1.x + g1.width + g2.x) / 2, y: (overlapY_Start + overlapY_End) / 2 });
                                            }
                                        }
                                        // Check shared horizontal edge
                                        if (Math.abs(g1.y - (g2.y + g2.height)) < threshold || Math.abs(g2.y - (g1.y + g1.height)) < threshold) {
                                            const overlapX_Start = Math.max(g1.x, g2.x);
                                            const overlapX_End = Math.min(g1.x + g1.width, g2.x + g2.width);
                                            if (overlapX_Start < overlapX_End) {
                                                internalMidpoints.push({ x: (overlapX_Start + overlapX_End) / 2, y: (g1.y + g1.height + g2.y) / 2 });
                                            }
                                        }
                                    });
                                });

                                // Compute Label Anchor (Weighted center based on box areas)
                                let totalArea = 0;
                                let weightedX = 0;
                                let weightedY = 0;

                                geometries.forEach(g => {
                                    const area = g.width * g.height;
                                    totalArea += area;
                                    weightedX += (g.x + g.width / 2) * area;
                                    weightedY += (g.y + g.height / 2) * area;
                                });

                                anchorX = totalArea > 0 ? weightedX / totalArea : geometries[0].x + geometries[0].width / 2;
                                anchorY = totalArea > 0 ? weightedY / totalArea : geometries[0].y + geometries[0].height / 2;

                                // Still need bounding box for large-text breakout
                                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                                geometries.forEach(g => {
                                    minX = Math.min(minX, g.x);
                                    minY = Math.min(minY, g.y);
                                    maxX = Math.max(maxX, g.x + g.width);
                                    maxY = Math.max(maxY, g.y + g.height);
                                });
                                const isSelected = selectedIdsRef.current.has(room.docId!);

                                const renderBox = (c: any, index: number) => (
                                    <Rnd
                                        key={`${room.docId}-box-${index}`}
                                        id={index === 0 ? `rnd-node-${room.docId}` : `inner-rnd-${room.docId}-geom-${index}`}
                                        className={`absolute ${isEditMode ? 'cursor-move' : 'pointer-events-none'}`}
                                        onMouseDownCapture={(e: any) => {
                                            if (isEditMode && e.shiftKey) handleItemSelection(room.docId!, e);
                                        }}
                                        onClickCapture={(e: any) => {
                                            if (isEditMode && !e.shiftKey) handleItemSelection(room.docId!, e);
                                        }}
                                        style={{ 
                                            backgroundColor: (hoveredBlock && hoveredBlock.roomId === room.docId && hoveredBlock.index === index) 
                                                ? 'rgba(59, 130, 246, 0.4)' 
                                                : isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(210, 180, 140, 0.25)',
                                            zIndex: isSelected ? 40 : 5,
                                            boxShadow: (hoveredBlock && hoveredBlock.roomId === room.docId && hoveredBlock.index === index) 
                                                ? '0 0 15px rgba(59, 130, 246, 0.5)' 
                                                : 'none',
                                            border: isSelected ? '2px solid #3b82f6' : '1px solid #d2b48c',
                                            ...getSmartBorders(c, geometries, isSelected)
                                        }}
                                        scale={scale}
                                        disableDragging={!isEditMode}
                                        enableResizing={isEditMode}
                                        position={draggingId === room.docId && index === 0 ? undefined : { 
                                            x: c.x + (groupDragOffset && selectedIdsRef.current.has(room.docId!) ? groupDragOffset.x : 0), 
                                            y: c.y + (groupDragOffset && selectedIdsRef.current.has(room.docId!) ? groupDragOffset.y : 0) 
                                        }}
                                        size={{ width: c.width, height: c.height }}
                                        onDragStart={(e: any) => handleGroupDragStart(room.docId!, index, e)}
                                        onDrag={(_e: any, d: any) => handleGroupDrag(room.docId!, index, d)}
                                        onDragStop={(_e: any, d: any) => handleGroupDragStopStateSync(room.docId!, index, d)}
                                        onResizeStart={() => {
                                            setResizingRoomId(`${room.docId}-${index}`);
                                            setActiveDimensions({ width: c.width, height: c.height });
                                        }}
                                        onResize={(_e: any, _dir: any, ref: any) => {
                                            setActiveDimensions({ 
                                                width: parseInt(ref.style.width, 10), 
                                                height: parseInt(ref.style.height, 10) 
                                            });
                                        }}
                                        onResizeStop={(_e: any, _dir: any, ref: any, _delta: any, pos: any) => {
                                            saveSnapshot();
                                            markDirty(room.docId!);
                                            setResizingRoomId(null);
                                            setActiveDimensions(null);
                                            setRooms(prev => prev.map(r => r.docId === room.docId ? {
                                                ...r,
                                                geometries: (r.geometries || (r.map_coordinates ? [r.map_coordinates] : [])).map((gc, gi) => gi === index ? { ...gc, x: pos.x, y: pos.y, width: parseInt(ref.style.width, 10), height: parseInt(ref.style.height, 10) } : gc)
                                            } : r));
                                        }}
                                    >
                                        <div 
                                            data-selection-id={room.docId}
                                            data-selected={isSelected ? "true" : "false"}
                                            className="w-full h-full relative"
                                            style={{ 
                                                transform: `rotate(${c.rotation || 0}deg)`,
                                                transition: 'outline 0.1s ease-in-out',
                                                border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(139, 115, 85, 0.4)'
                                            }}
                                        >
                                            {/* Dimensional Feedback (Center on box being resized) */}
                                            {resizingRoomId === `${room.docId}-${index}` && activeDimensions && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
                                                    <div className="bg-charcoal text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg border border-white/20 whitespace-nowrap">
                                                        {(activeDimensions.width / PIXELS_PER_FOOT).toFixed(1)}' x {(activeDimensions.height / PIXELS_PER_FOOT).toFixed(1)}'
                                                    </div>
                                                </div>
                                            )}
                                            {/* Local Controls (Only on first box or selected) */}
                                            {isEditMode && (isSelected || index === 0) && (
                                                <div className="absolute top-1 right-1 flex gap-1 pointer-events-auto z-[60]">
                                                    <button onClick={(e) => rotateItem(room.docId!, 'room', c.rotation || 0, e)} className="bg-white/90 p-1.5 rounded-md hover:bg-white shadow-md border border-tan/20 text-tan transition-all hover:scale-110 active:scale-90"><RotateCw size={14}/></button>
                                                    <button onClick={(e) => removeFromMap(room.docId!, e)} className="bg-red-500 text-white p-1.5 rounded-md hover:bg-red-600 shadow-md transition-all hover:scale-110 active:scale-90"><X size={14}/></button>
                                                </div>
                                            )}
                                        </div>
                                    </Rnd>
                                );

                                return (
                                    <Fragment key={room.docId}>
                                        {/* Master Wall Layer (Subtle background) */}
                                        <div 
                                            className="absolute pointer-events-none z-10 opacity-30"
                                            style={{ 
                                                left: 0, 
                                                top: 0, 
                                                width: '100%', 
                                                height: '100%',
                                            }}
                                        >
                                            {geometries.map((c, i) => (
                                                <div 
                                                    key={`${room.docId}-wall-${i}`} 
                                                    style={{ 
                                                        position: 'absolute', 
                                                        left: c.x + (groupDragOffset && selectedIdsRef.current.has(room.docId!) ? groupDragOffset.x : 0), 
                                                        top: c.y + (groupDragOffset && selectedIdsRef.current.has(room.docId!) ? groupDragOffset.y : 0), 
                                                        width: c.width, 
                                                        height: c.height,
                                                        backgroundColor: 'rgba(0, 0, 0, 0.01)' // Back to original invisible trigger
                                                    }} 
                                                />
                                            ))}
                                        </div>

                                        {/* Unit Interaction Boxes (Invisible, but handle dragging/resizing) */}
                                        {geometries.map((c, i) => renderBox(c, i))}
                                        
                                        {/* Master Room Label (Centered over Anchor) */}
                                        <div 
                                            id={`room-label-${room.docId}`}
                                            className="absolute pointer-events-none flex items-center justify-center text-center z-[70]"
                                            style={{ 
                                                left: anchorX - 60 + (groupDragOffset && selectedIdsRef.current.has(room.docId!) ? groupDragOffset.x : 0), 
                                                top: anchorY - 40 + (groupDragOffset && selectedIdsRef.current.has(room.docId!) ? groupDragOffset.y : 0), 
                                                width: 120, 
                                                height: 80 
                                            }}
                                        >
                                            <span 
                                                className={`relative w-full px-2 text-center break-words font-serif font-bold text-charcoal flex flex-col items-center pointer-events-none transform transition-opacity ${isSelected ? 'opacity-100' : 'opacity-85'}`}
                                                style={{ 
                                                    textShadow: '0 0 10px white, 0 0 10px white, 0 0 5px white',
                                                    fontSize: 'min(20px, max(14px, 3vw))',
                                                    lineHeight: '1.1'
                                                }}
                                            >
                                                {room.name}
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 h-[3px] w-12 bg-tan/60 shrink-0"></div>
                                            </span>
                                        </div>
                                    </Fragment>
                                );
                            })}

                                    {/* Render Locations (Pins/Blocks) */}
                                    {locations.filter(l => l.name?.toLowerCase() !== 'compass rose' && (l.floor_id || 'default') === currentFloorId).map(loc => {
                                const c = { ...loc, ...(localCoords[loc.id] || {}) };
                                if (!localCoords[loc.id]) return null;
                                const isSelected = selectedIdsRef.current.has(loc.id);
                                
                                return (
                                    <Rnd
                                        key={loc.id}
                                        id={`rnd-node-${loc.id}`}
                                        className={`absolute group ${isEditMode ? 'cursor-move' : 'cursor-pointer'}`}
                                        onMouseDownCapture={(e: any) => {
                                            if (isEditMode && e.shiftKey) handleItemSelection(loc.id, e);
                                        }}
                                        onClickCapture={(e: any) => {
                                            if (isEditMode && !e.shiftKey) handleItemSelection(loc.id, e);
                                        }}
                                        style={{ 
                                            backgroundColor: (isSelected && c.display_type !== 'pin') ? 'rgba(59, 130, 246, 0.1)' : (c.display_type === 'box' ? 'rgba(255, 255, 255, 0.9)' : 'transparent'),
                                            zIndex: isSelected ? 150 : (c.z_index || 100),
                                            border: (isSelected && c.display_type !== 'pin') ? '2px solid #3b82f6' : (c.display_type === 'box' ? '2px solid #d2b48c' : 'none'),
                                            borderRadius: c.display_type === 'box' ? '4px' : '0',
                                            pointerEvents: c.display_type === 'pin' ? 'none' : 'auto'
                                        }}
                                        scale={scale}
                                        disableDragging={!isEditMode}
                                        enableResizing={isEditMode && c.display_type !== 'pin'}
                                        position={draggingId === loc.id ? undefined : { 
                                            x: (c.display_type === 'pin' ? (c.x - 30) : c.x) + (groupDragOffset && selectedIdsRef.current.has(loc.id) ? groupDragOffset.x : 0), 
                                            y: (c.display_type === 'pin' ? (c.y - 50) : c.y) + (groupDragOffset && selectedIdsRef.current.has(loc.id) ? groupDragOffset.y : 0) 
                                        }}
                                        size={{ 
                                            width: c.display_type === 'pin' ? 60 : c.width, 
                                            height: c.display_type === 'pin' ? 60 : c.height 
                                        }}
                                        onDragStart={(e: any) => handleGroupDragStart(loc.id, 0, e)}
                                        onDrag={(_e: any, d: any) => {
                                            const updatedX = c.display_type === 'pin' ? d.x + 30 : d.x;
                                            const updatedY = c.display_type === 'pin' ? d.y + 50 : d.y;
                                            handleGroupDrag(loc.id, 0, { x: updatedX, y: updatedY });
                                        }}
                                        onDragStop={(_e: any, d: any) => {
                                            const updatedX = c.display_type === 'pin' ? d.x + 30 : d.x;
                                            const updatedY = c.display_type === 'pin' ? d.y + 50 : d.y;
                                            handleGroupDragStopStateSync(loc.id, 0, { x: updatedX, y: updatedY });
                                        }}
                                        onResizeStart={() => {
                                            setResizingRoomId(`${loc.id}-0`);
                                            setActiveDimensions({ width: c.width, height: c.height });
                                        }}
                                        onResize={(_e: any, _dir: any, ref: any) => {
                                            setActiveDimensions({ 
                                                width: parseInt(ref.style.width, 10), 
                                                height: parseInt(ref.style.height, 10) 
                                            });
                                        }}
                                        onResizeStop={(_e, _dir, ref, _delta, pos) => {
                                            saveSnapshot();
                                            markDirty(loc.id);
                                            setResizingRoomId(null);
                                            setActiveDimensions(null);
                                            setLocalCoords(prev => ({ ...prev, [loc.id]: { ...prev[loc.id], x: pos.x, y: pos.y, width: parseInt(ref.style.width, 10), height: parseInt(ref.style.height, 10) }}));
                                        }}
                                    >
                                        <div 
                                            id={`inner-rnd-${loc.id}`} 
                                            data-selection-id={loc.id}
                                            data-selected={isSelected ? "true" : "false"}
                                            data-highlighted={activeHighlightId === loc.id ? "true" : "false"}
                                            className="w-full h-full relative" 
                                            style={{ transform: `rotate(${c.rotation || 0}deg)` }}
                                        >
                                            {c.display_type === 'pin' ? (
                                                <div 
                                                    className="flex flex-col items-center w-full pointer-events-auto group/pin relative"
                                                    style={{ marginTop: `${50 - (48 * (c.scale || 1))}px` }}
                                                >
                                                    {!isEditMode && (
                                                        <Link to={`/locations/${loc.id}`} className="absolute inset-x-0 top-0 bottom-[-20px] z-50 rounded hover:bg-tan/10 transition-colors flex flex-col items-center justify-center">
                                                            <span className="text-white text-[8px] font-mono font-bold opacity-0 hover:opacity-100 bg-tan/80 px-1.5 py-0.5 rounded uppercase tracking-tighter absolute -top-4">View</span>
                                                        </Link>
                                                    )}

                                                    {/* Pin Actions Overlay (Inside the pointer-events-auto container) */}
                                                    {isEditMode && (
                                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/pin:opacity-100 flex gap-1 z-[60]">
                                                            <button 
                                                                onClick={(e: any) => {
                                                                    e.stopPropagation();
                                                                    rotateItem(loc.id, 'location', c.rotation || 0, e);
                                                                }} 
                                                                className="bg-white border border-charcoal/20 p-1.5 rounded shadow-xl hover:bg-blue-50 transition-colors"
                                                            >
                                                                <RotateCw size={12} className="text-blue-600"/>
                                                            </button>
                                                            <button 
                                                                onClick={(e: any) => {
                                                                    e.stopPropagation();
                                                                    removeBlock(loc.id, e);
                                                                }} 
                                                                className="bg-red-500 text-white p-1.5 rounded shadow-xl hover:bg-red-600 transition-colors border border-red-600"
                                                            >
                                                                <X size={12}/>
                                                            </button>
                                                        </div>
                                                    )}

                                                    <MapPin size={48 * (c.scale || 1)} className={`${isSelected ? 'text-blue-500' : 'text-red-500'} drop-shadow-md transition-colors`} fill="white"/>
                                                    <div className="mt-1 flex justify-center w-full px-2">
                                                        <span 
                                                            className={`font-serif font-black ${isSelected ? 'bg-blue-50' : 'bg-white/95'} border border-charcoal/10 px-2 py-1 rounded shadow-lg transition-colors whitespace-normal text-center text-charcoal tracking-tight w-max max-w-[150px] leading-tight break-normal`}
                                                            style={{ fontSize: `${9.5 * (c.scale || 1)}px` }}
                                                        >
                                                            {loc.name}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center p-0.5 text-center">
                                                    {!isEditMode && (
                                                        <Link 
                                                            to={`/locations/${loc.id}`} 
                                                            className="absolute inset-0 z-50 rounded hover:bg-tan/10 transition-colors"
                                                            title={`View details for ${loc.name}`}
                                                        />
                                                    )}
                                                    <div 
                                                        className="flex items-center justify-center transition-transform duration-300 pointer-events-none"
                                                        style={{ 
                                                            position: 'absolute',
                                                            transform: `rotate(${-(c.rotation || 0)}deg)`,
                                                            // Keep label width exactly matching the shelf's physical width for a snug fit
                                                            width: c.width, 
                                                            zIndex: 10
                                                        }}
                                                    >
                                                        <span 
                                                            className={`font-serif font-black text-charcoal uppercase leading-[0.9] block px-0.5`}
                                                            style={{ 
                                                                fontSize: '9px',
                                                                wordBreak: 'normal', // Never break words
                                                                overflowWrap: 'normal', // Allow overflow if a word is literally wider than the shelf
                                                                whiteSpace: 'normal', // Allow multiline
                                                                textShadow: '0 0 8px white, 0 0 8px white, 0 0 4px white, 0 0 2px white',
                                                                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))'
                                                            }}
                                                        >
                                                            {loc.name}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            {isEditMode && c.display_type !== 'pin' && (
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 flex gap-1 pointer-events-auto">
                                                    <button onClick={(e: any) => rotateItem(loc.id, 'location', c.rotation || 0, e)} className="bg-white border p-1 rounded"><RotateCw size={10}/></button>
                                                    <button onClick={(e: any) => removeBlock(loc.id, e)} className="bg-red-400 text-white p-1 rounded"><X size={10}/></button>
                                                </div>
                                            )}
                                        </div>
                                    </Rnd>
                                );
                            })}
                            
                            {/* Premium Compass Rose - Now part of the Blueprint Canvas */}
                            <Rnd
                                size={{ width: resizingCompassSize || compassRose.width || 240, height: resizingCompassSize || compassRose.height || 240 }}
                                position={{ x: compassRose.x, y: compassRose.y }}
                                onDragStop={(_e, d) => {
                                    saveSnapshot();
                                    setCompassRose(prev => ({ ...prev, x: d.x, y: d.y }));
                                }}
                                scale={scale}
                                disableDragging={!isEditMode}
                                enableResizing={isEditMode}
                                lockAspectRatio={true}
                                resizeHandleStyles={{
                                    bottomRight: { width: 12, height: 12, background: '#3b82f6', border: '2px solid white', borderRadius: '50%', bottom: -6, right: -6 },
                                    bottomLeft: { width: 12, height: 12, background: '#3b82f6', border: '2px solid white', borderRadius: '50%', bottom: -6, left: -6 },
                                    topRight: { width: 12, height: 12, background: '#3b82f6', border: '2px solid white', borderRadius: '50%', top: -6, right: -6 },
                                    topLeft: { width: 12, height: 12, background: '#3b82f6', border: '2px solid white', borderRadius: '50%', top: -6, left: -6 }
                                }}
                                onResizeStart={() => {
                                    setResizingCompassSize(compassRose.width || 240);
                                }}
                                onResize={(_e, _dir, ref) => {
                                    setResizingCompassSize(parseInt(ref.style.width, 10));
                                }}
                                onResizeStop={(_e, _dir, ref, _delta, pos) => {
                                    saveSnapshot();
                                    const newSize = parseInt(ref.style.width, 10);
                                    setResizingCompassSize(null);
                                    setCompassRose(prev => ({ ...prev, width: newSize, height: newSize, x: pos.x, y: pos.y }));
                                }}
                                className="absolute z-[100]"
                                dragHandleClassName="compass-drag-handle"
                            >
                                <div className={`relative w-full h-full flex items-center justify-center transition-opacity duration-300 ${!isEditMode ? 'opacity-80' : 'opacity-100'} group`}>
                                    <div className="transform" style={{ transform: `scale(${(resizingCompassSize || compassRose.width || 240) / 120})` }}>
                                        <div 
                                            className={`relative p-6 rounded-full ${isEditMode ? 'bg-white/40 border-2 border-dashed border-tan/30 cursor-move compass-drag-handle' : 'pointer-events-none'}`}
                                            style={{ transform: `rotate(${compassRose.rotation}deg)`, transition: 'transform 0.1s linear' }}
                                        >
                                            <Compass size={40} className="text-charcoal/80 drop-shadow-sm" strokeWidth={1.5} />
                                            
                                            {/* Cardinal Directions */}
                                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] font-black text-tan/80 select-none pointer-events-none">
                                                <div style={{ transform: `rotate(${-compassRose.rotation}deg)`, transition: 'transform 0.1s linear' }}>N</div>
                                            </div>
                                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-black text-charcoal/40 select-none pointer-events-none">
                                                <div style={{ transform: `rotate(${-compassRose.rotation}deg)`, transition: 'transform 0.1s linear' }}>S</div>
                                            </div>
                                            <div className="absolute -left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-charcoal/40 select-none pointer-events-none">
                                                <div style={{ transform: `rotate(${-compassRose.rotation}deg)`, transition: 'transform 0.1s linear' }}>W</div>
                                            </div>
                                            <div className="absolute -right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-charcoal/40 select-none pointer-events-none">
                                                <div style={{ transform: `rotate(${-compassRose.rotation}deg)`, transition: 'transform 0.1s linear' }}>E</div>
                                            </div>
                                            
                                            {/* Decorative cardinal lines */}
                                            <div className="absolute inset-0 border border-tan/5 rounded-full -m-2 pointer-events-none" />
                                        </div>
                                    </div>

                                    {isEditMode && (
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 bg-white p-3 rounded-lg shadow-xl border border-tan/30 flex flex-col items-center gap-2 w-48 opacity-0 group-hover:opacity-100 transition-opacity z-[200] cursor-auto">
                                            <label className="text-[10px] font-bold text-charcoal/40 uppercase tracking-widest w-full flex justify-between">
                                                <span>Rotation</span>
                                                <span className="text-tan">{compassRose.rotation}°</span>
                                            </label>
                                            <input 
                                                type="range" 
                                                min="0" 
                                                max="360" 
                                                value={compassRose.rotation}
                                                onChange={(e) => setCompassRose(prev => ({ ...prev, rotation: parseInt(e.target.value, 10) }))}
                                                onMouseUp={() => saveSnapshot()}
                                                onTouchEnd={() => saveSnapshot()}
                                                className="w-full accent-tan h-1.5 bg-tan/10 rounded-lg appearance-none cursor-pointer"
                                            />
                                        </div>
                                    )}
                                </div>
                            </Rnd>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
