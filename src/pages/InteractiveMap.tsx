import React, { useState, useEffect, useRef, Fragment } from 'react';
import { Rnd } from 'react-rnd';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, addDoc, updateDoc, getDoc, writeBatch, setDoc } from 'firebase/firestore';
import { Plus, MapPin, Square, ZoomIn, ZoomOut, Maximize, Edit3, X, BoxSelect, Maximize2, RotateCw, LayoutGrid, Compass, Layers, HelpCircle } from 'lucide-react';
import type { MuseumLocation, Room, MapFloor } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';
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
    const { settings } = useAppearance();
    const [searchParams] = useSearchParams();

    if (settings.featureToggles?.enableMap === false) {
        return (
            <div className="flex-1 p-8 font-sans text-center flex flex-col justify-center items-center min-h-[400px]">
                <h1 className="text-3xl font-serif font-bold text-charcoal mb-4">Module Disabled</h1>
                <p className="text-charcoal/60 max-w-md">The Map Discovery module is not active for this archive site.</p>
            </div>
        );
    }

    const highlightTargetId = searchParams.get('highlight');
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [scale, setScale] = useState(0.4);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [isSaving, setIsSaving] = useState(false);
    
    const [localCoords, setLocalCoords] = useState<Record<string, {x: number, y: number, width: number, height: number, rotation?: number, skewX?: number, z_index?: number, display_type?: 'box' | 'pin' | 'block', scale?: number}>>({});

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
    const draggedIndexRef = useRef<number | null>(null);
    const dragCachedNodesRef = useRef<Record<string, {
        element: HTMLElement | null;
        startX: number;
        startY: number;
        isPin: boolean;
        isPolygon?: boolean;
    }>>({});
    const labelCachedNodesRef = useRef<Record<string, {
        element: HTMLElement | null;
    }>>({});
    const wallCachedNodesRef = useRef<Record<string, {
        element: HTMLElement | null;
    }[]>>({});
    const controlsCachedNodesRef = useRef<Record<string, {
        element: HTMLElement | null;
    }[]>>({});
    const [, setSelectionTick] = useState(0); // For triggering UI buttons reacting to ref changes
    const [sidebarPos, setSidebarPos] = useState({ x: 16, y: 16 });
    const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
    const [hoveredBlock, setHoveredBlock] = useState<{ roomId: string, index: number } | null>(null);
    const [resizingRoomId, setResizingRoomId] = useState<string | null>(null);
    const [activeDimensions, setActiveDimensions] = useState<{ width: number, height: number } | null>(null);
    // @ts-ignore
    const [draggingId, setDraggingId] = useState<string | null>(null);

    // Compass Rose State (Overlay)
    const [compassRose, setCompassRose] = useState<{ x: number, y: number, rotation: number, width?: number, height?: number }>({ x: 32, y: 32, rotation: 0 });
    const [resizingCompassSize, setResizingCompassSize] = useState<number | null>(null);

    // Onboarding & Help modal state
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [tourStep, setTourStep] = useState<number | null>(null);

    // States for polygon dragging
    const [draggingVertex, setDraggingVertex] = useState<{
        roomId: string;
        geomIndex: number;
        pointIndex: number;
        startPoints: Array<{ x: number; y: number; curve?: { cx: number; cy: number } }>;
        startX: number;
        startY: number;
    } | null>(null);

    const [draggingPolygon, setDraggingPolygon] = useState<{
        roomId: string;
        geomIndex: number;
        startX: number;
        startY: number;
        mouseStartX: number;
        mouseStartY: number;
    } | null>(null);

    const [draggingCurveControl, setDraggingCurveControl] = useState<{
        roomId: string;
        geomIndex: number;
        pointIndex: number;
        startPoints: Array<{ x: number; y: number; curve?: { cx: number; cy: number } }>;
        startX: number;
        startY: number;
    } | null>(null);

    useEffect(() => {
        if (!draggingVertex && !draggingPolygon && !draggingCurveControl) return;

        const handlePointerMove = (e: PointerEvent) => {
            if (draggingVertex) {
                const dx = (e.clientX - draggingVertex.startX) / scale;
                const dy = (e.clientY - draggingVertex.startY) / scale;
                
                let snapX = dx;
                let snapY = dy;
                if (isSnapping) {
                    const initialPt = draggingVertex.startPoints[draggingVertex.pointIndex];
                    const targetX = initialPt.x + dx;
                    const targetY = initialPt.y + dy;
                    const snappedX = Math.round(targetX / 12) * 12;
                    const snappedY = Math.round(targetY / 12) * 12;
                    snapX = snappedX - initialPt.x;
                    snapY = snappedY - initialPt.y;
                }

                const updatedPoints = draggingVertex.startPoints.map((pt, idx) => 
                    idx === draggingVertex.pointIndex 
                        ? { ...pt, x: Math.round(pt.x + snapX), y: Math.round(pt.y + snapY) } 
                        : pt
                );
                handleUpdateRoomProperty(draggingVertex.roomId, 'points', updatedPoints, draggingVertex.geomIndex);
            } else if (draggingPolygon) {
                const dx = (e.clientX - draggingPolygon.mouseStartX) / scale;
                const dy = (e.clientY - draggingPolygon.mouseStartY) / scale;

                const targetX = draggingPolygon.startX + dx;
                const targetY = draggingPolygon.startY + dy;

                handleGroupDrag(draggingPolygon.roomId, draggingPolygon.geomIndex, { x: targetX, y: targetY });
            } else if (draggingCurveControl) {
                const dx = (e.clientX - draggingCurveControl.startX) / scale;
                const dy = (e.clientY - draggingCurveControl.startY) / scale;

                const initialPt = draggingCurveControl.startPoints[draggingCurveControl.pointIndex];
                const initialCurve = initialPt.curve!;
                const newCx = Math.round(initialCurve.cx + dx);
                const newCy = Math.round(initialCurve.cy + dy);

                const updatedPoints = draggingCurveControl.startPoints.map((pt, idx) =>
                    idx === draggingCurveControl.pointIndex
                        ? { ...pt, curve: { cx: newCx, cy: newCy } }
                        : pt
                );
                handleUpdateRoomProperty(draggingCurveControl.roomId, 'points', updatedPoints, draggingCurveControl.geomIndex);
            }
        };

        const handlePointerUp = (e: PointerEvent) => {
            if (draggingVertex) {
                setDraggingVertex(null);
            } else if (draggingPolygon) {
                const dx = (e.clientX - draggingPolygon.mouseStartX) / scale;
                const dy = (e.clientY - draggingPolygon.mouseStartY) / scale;
                const targetX = draggingPolygon.startX + dx;
                const targetY = draggingPolygon.startY + dy;

                handleGroupDragStopStateSync(draggingPolygon.roomId, draggingPolygon.geomIndex, { x: targetX, y: targetY });
                setDraggingPolygon(null);
            } else if (draggingCurveControl) {
                setDraggingCurveControl(null);
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [draggingVertex, draggingPolygon, draggingCurveControl, scale, isSnapping]);

    const TOUR_STEPS = [
        {
            title: "Welcome to the Map Editor! 👋",
            description: "This quick tour will guide you through the layout tools and navigation features so you can start organizing the museum blueprint confidently.",
            target: null,
        },
        {
            title: "Floor Switcher 🏢",
            description: "Switch between the Basement, Main Floor, and Second Floor. Use the adjacent layer button to toggle a semi-transparent 'ghost' underlay of the floor beneath to align rooms between levels.",
            target: "#tour-floor-selector",
        },
        {
            title: "Layout Tools Panel 🛠️",
            description: "Drag this floating panel anywhere you want. In Edit Mode, use it to add structural rooms, shelf blocks, and pins, or combine multiple selected rooms into a single space.",
            target: "#tour-sidebar",
        },
        {
            title: "Editing & Selection 🖱️",
            description: "Click items to select them. Hold Shift + Click to select multiple items, or hold Shift + Drag on the grid canvas to draw a selection rectangle. Rotate and delete buttons appear directly on selected items.",
            target: ".blueprint-grid",
        },
        {
            title: "Grid Snapping & Saving 💾",
            description: "All elements snap to the half-foot grid (12px) automatically. Click 'Save Changes' to publish your layout updates, or 'Cancel' to discard all edits since your last save.",
            target: "#tour-save-container",
        }
    ];

    const [targetRect, setTargetRect] = useState<{ top: number, left: number, width: number, height: number } | null>(null);

    useEffect(() => {
        if (tourStep === null) {
            setTargetRect(null);
            return;
        }

        // Force sidebar to expand so the user sees the entire toolbar
        if (tourStep === 2) {
            setIsSidebarMinimized(false);
        }

        const step = TOUR_STEPS[tourStep];
        if (!step || !step.target) {
            setTargetRect(null);
            return;
        }

        const updatePosition = () => {
            const el = document.querySelector(step.target!);
            if (el) {
                const rect = el.getBoundingClientRect();
                setTargetRect({
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                });
            } else {
                setTargetRect(null);
            }
        };

        const timer = setTimeout(updatePosition, 150);

        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, { capture: true, passive: true });

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, { capture: true });
        };
    }, [tourStep, isEditMode]);

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

    // Calculates the grid-snapped center of the currently visible viewport, with collision-cascading offsets
    const calculateSpawnPosition = (widthFt: number, heightFt: number) => {
        const widthPx = Math.round((widthFt * PIXELS_PER_FOOT) / 12) * 12;
        const heightPx = Math.round((heightFt * PIXELS_PER_FOOT) / 12) * 12;

        let startX = Math.round((CANVAS_WIDTH / 2 - widthPx / 2) / 12) * 12;
        let startY = Math.round((CANVAS_HEIGHT / 2 - heightPx / 2) / 12) * 12;

        const wrapper = wrapperRef.current;
        if (wrapper) {
            const scrollLeft = wrapper.scrollLeft;
            const scrollTop = wrapper.scrollTop;
            const clientWidth = wrapper.clientWidth;
            const clientHeight = wrapper.clientHeight;
            
            // Calculate viewport center on the canvas scale
            const canvasX = (scrollLeft + clientWidth / 2) / scale;
            const canvasY = (scrollTop + clientHeight / 2) / scale;
            
            startX = Math.round((canvasX - widthPx / 2) / 12) * 12;
            startY = Math.round((canvasY - heightPx / 2) / 12) * 12;
        }

        // Clamp to canvas boundaries with padding
        startX = Math.max(120, Math.min(startX, CANVAS_WIDTH - widthPx - 120));
        startY = Math.max(120, Math.min(startY, CANVAS_HEIGHT - heightPx - 120));

        // Cascade/Collision check against existing rooms on the current floor
        let attempts = 0;
        const threshold = 12;
        let isOverlapping = true;
        
        while (isOverlapping && attempts < 15) {
            isOverlapping = false;
            const floorRooms = rooms.filter(r => (r.floor_id || 'default') === currentFloorId && r.map_coordinates);
            for (const room of floorRooms) {
                const coords = room.map_coordinates!;
                const xOverlap = Math.max(0, Math.min(startX + widthPx, coords.x + coords.width) - Math.max(startX, coords.x));
                const yOverlap = Math.max(0, Math.min(startY + heightPx, coords.y + coords.height) - Math.max(startY, coords.y));
                
                if (xOverlap > threshold && yOverlap > threshold) {
                    isOverlapping = true;
                    startX += 48; // shift 2 feet right on collision
                    startY += 48; // shift 2 feet down on collision
                    attempts++;
                    break;
                }
            }
        }

        startX = isNaN(startX) ? 120 : Math.max(120, startX);
        startY = isNaN(startY) ? 120 : Math.max(120, startY);

        return { x: startX, y: startY, width: widthPx || 360, height: heightPx || 360 };
    };

    // Updated addRoom to talk to the collection and spawn at viewport center
    const addRoom = async () => {
        const roomName = window.prompt("Enter Room Name: \n\n(Note: Creating a new structural room is committed immediately to the database)");
        if (!roomName) return;

        const { x, y, width, height } = calculateSpawnPosition(15, 15); // Default 15x15 ft room

        try {
            const newRoomData = {
                id: 'room_' + Date.now(),
                name: roomName,
                created_at: new Date().toISOString(),
                floor_id: currentFloorId,
                map_coordinates: {
                    x,
                    y,
                    width,
                    height
                }
            };
            const docRef = await addDoc(collection(db, 'rooms'), newRoomData);
            saveSnapshot();
            setRooms(prev => [...prev, { ...newRoomData, docId: docRef.id }]);
            
            // Automatically select the new room so the user can adjust it immediately
            selectedIdsRef.current.clear();
            selectedIdsRef.current.add(docRef.id);
            setSelectionTick(t => t + 1);
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

        // Default dimensions are 8.33x8.33 ft (200x200 px) to match legacy sizes
        const { x, y, width, height } = calculateSpawnPosition(200 / PIXELS_PER_FOOT, 200 / PIXELS_PER_FOOT);

        saveSnapshot();
        markDirty(roomDocId);
        setRooms(prev => prev.map(r => r.docId === roomDocId ? {
            ...r,
            floor_id: currentFloorId,
            map_coordinates: { x, y, width, height }
        } : r));

        // Automatically select the placed room
        selectedIdsRef.current.clear();
        selectedIdsRef.current.add(roomDocId);
        setSelectionTick(t => t + 1);
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

    const handleCanvasMouseUp = (_e: React.MouseEvent) => {
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

    const handleGroupDragStart = (draggedId: string, draggedIndex?: number, e?: any) => {
        if (!isEditMode) return;

        // Safety: If dragging an unselected item without shift, force it to be the sole selection
        if (!selectedIdsRef.current.has(draggedId) && (!e || !e.shiftKey)) {
            selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
            selectedIdsRef.current.clear();
            selectedIdsRef.current.add(draggedId);
            setSelectionDOM(draggedId, true);
        }

        setDraggingId(draggedId);
        draggedIndexRef.current = draggedIndex !== undefined ? draggedIndex : 0;
        
        dragStartPosRef.current = {};
        dragCachedNodesRef.current = {};
        labelCachedNodesRef.current = {};
        wallCachedNodesRef.current = {};
        controlsCachedNodesRef.current = {};

        selectedIdsRef.current.forEach(id => {
            const room = rooms.find(r => r.docId === id || r.id === id);
            if (room) {
                const rDocId = room.docId || room.id;
                const rId = room.id || room.docId;
                const geometries = room.geometries || (room.map_coordinates ? [room.map_coordinates] : []);
                geometries.forEach((g, gi) => {
                    const nodeKey1 = `${rDocId}-geom-${gi}`;
                    const nodeKey2 = `${rId}-geom-${gi}`;
                    dragStartPosRef.current[nodeKey1] = { x: g.x, y: g.y };
                    dragStartPosRef.current[nodeKey2] = { x: g.x, y: g.y };
                    
                    const elementId = gi === 0 ? `rnd-node-${rDocId}` : `inner-rnd-${rDocId}-geom-${gi}`;
                    const el = document.getElementById(elementId) || document.getElementById(gi === 0 ? `rnd-node-${rId}` : `inner-rnd-${rId}-geom-${gi}`);
                    const cachedObj = {
                        element: el,
                        startX: g.x,
                        startY: g.y,
                        isPin: false,
                        isPolygon: g.shape === 'polygon'
                    };
                    dragCachedNodesRef.current[nodeKey1] = cachedObj;
                    dragCachedNodesRef.current[nodeKey2] = cachedObj;
                });
                if (geometries.length > 0) {
                    dragStartPosRef.current[rDocId] = { x: geometries[0].x, y: geometries[0].y };
                    if (rId) dragStartPosRef.current[rId] = { x: geometries[0].x, y: geometries[0].y };
                }
                
                // Cache label node
                const labelEl = document.getElementById(`room-label-${rDocId}`) || (rId ? document.getElementById(`room-label-${rId}`) : null);
                if (labelEl) {
                    labelCachedNodesRef.current[rDocId] = { element: labelEl };
                    if (rId) labelCachedNodesRef.current[rId] = { element: labelEl };
                }
                
                // Cache wall nodes
                if (room.geometries) {
                    const walls = room.geometries.map((_, gi) => ({
                        element: document.getElementById(`ghost-wall-${rDocId}-${gi}`) || (rId ? document.getElementById(`ghost-wall-${rId}-${gi}`) : null)
                    }));
                    wallCachedNodesRef.current[rDocId] = walls;
                    if (rId) wallCachedNodesRef.current[rId] = walls;
                }
                
                // Cache controls nodes
                const ctrls = geometries.map((_, gi) => ({
                    element: document.getElementById(`poly-controls-${rDocId}-geom-${gi}`) || (rId ? document.getElementById(`poly-controls-${rId}-geom-${gi}`) : null)
                }));
                controlsCachedNodesRef.current[rDocId] = ctrls;
                if (rId) controlsCachedNodesRef.current[rId] = ctrls;
                return;
            }

            const lCoords = localCoords[id];
            if (lCoords) {
                dragStartPosRef.current[id] = { x: lCoords.x, y: lCoords.y };
                
                const nodeKey = `${id}-geom-0`;
                dragStartPosRef.current[nodeKey] = { x: lCoords.x, y: lCoords.y };
                
                const el = document.getElementById(`rnd-node-${id}`);
                dragCachedNodesRef.current[nodeKey] = {
                    element: el,
                    startX: lCoords.x,
                    startY: lCoords.y,
                    isPin: lCoords.display_type === 'pin',
                    isPolygon: false
                };
            }
        });
    };

    const handleGroupDrag = (draggedId: string, draggedIndex: number | undefined, d: { x: number, y: number }) => {
        const activeIndex = draggedIndex !== undefined ? draggedIndex : 0;
        const activeKey = `${draggedId}-geom-${activeIndex}`;
        let start = dragStartPosRef.current[activeKey];
        if (!start) {
            const altRoom = rooms.find(r => r.docId === draggedId || r.id === draggedId);
            if (altRoom) {
                const altId = altRoom.docId || altRoom.id;
                start = dragStartPosRef.current[`${altId}-geom-${activeIndex}`] || dragStartPosRef.current[altId];
            }
        }
        
        // Safety: Prevent jumping to (0,0) or NaN
        if (!start || isNaN(d.x) || isNaN(d.y)) return;

        // Safety Guard: Ignore invalid zero positions from react-rnd when start position is not near origin
        if (d.x === 0 && d.y === 0 && (start.x > 60 || start.y > 60)) {
            console.warn(`[DRAG GUARD] Ignored invalid 0,0 drag event for ${draggedId}`);
            return;
        }
        
        const snappedActiveX = absoluteSnap(d.x);
        const snappedActiveY = absoluteSnap(d.y);
        const snappedStartX = absoluteSnap(start.x);
        const snappedStartY = absoluteSnap(start.y);
        
        const offsetX = snappedActiveX - snappedStartX;
        const offsetY = snappedActiveY - snappedStartY;

        // Safety Guard: Ignore single-frame coordinate jumps
        if (Math.abs(offsetX) > 2000 || Math.abs(offsetY) > 2000) {
            console.warn(`[DRAG GUARD] Ignored abnormal offset jump (${offsetX}, ${offsetY}) for ${draggedId}`);
            return;
        }

        selectedIdsRef.current.forEach(id => {
            const room = rooms.find(r => r.id === id || r.docId === id);
            const geometriesCount = room?.geometries?.length || 1;
            
            for (let gi = 0; gi < geometriesCount; gi++) {
                const nodeKey = `${id}-geom-${gi}`;
                
                const room = rooms.find(r => r.id === id || r.docId === id);
                const geom = room?.geometries?.[gi] || room?.map_coordinates;
                const isPoly = geom?.shape === 'polygon';

                // Bypass manual transform for the element actively being dragged (unless it's a polygon, since it's not managed by react-rnd)
                if ((id === draggedId || room?.docId === draggedId || room?.id === draggedId) && gi === activeIndex && !isPoly) continue;
                
                const cached = dragCachedNodesRef.current[nodeKey];
                if (cached && cached.element) {
                    if (cached.isPolygon) {
                        cached.element.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
                    } else {
                        const targetX = absoluteSnap(cached.startX) + offsetX - (cached.isPin ? 30 : 0);
                        const targetY = absoluteSnap(cached.startY) + offsetY - (cached.isPin ? 50 : 0);
                        cached.element.style.transform = `translate(${targetX}px, ${targetY}px)`;
                    }
                }
            }

            // Translate labels in real time
            const labelCached = labelCachedNodesRef.current[id];
            if (labelCached && labelCached.element) {
                labelCached.element.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
            }

            // Translate ghost walls
            const walls = wallCachedNodesRef.current[id];
            if (walls) {
                walls.forEach(wall => {
                    if (wall.element) {
                        wall.element.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
                    }
                });
            }

            // Translate polygon controls in real time
            const controls = controlsCachedNodesRef.current[id];
            if (controls) {
                controls.forEach(ctrl => {
                    if (ctrl.element) {
                        ctrl.element.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
                    }
                });
            }
        });
    };

    const handleGroupDragStopStateSync = (draggedId: string, draggedIndex: number | undefined, d: { x: number, y: number }) => {
        setDraggingId(null);
        draggedIndexRef.current = null;

        const activeIndex = draggedIndex !== undefined ? draggedIndex : 0;
        const activeKey = `${draggedId}-geom-${activeIndex}`;
        let start = dragStartPosRef.current[activeKey];
        if (!start) {
            const altRoom = rooms.find(r => r.docId === draggedId || r.id === draggedId);
            if (altRoom) {
                const altId = altRoom.docId || altRoom.id;
                start = dragStartPosRef.current[`${altId}-geom-${activeIndex}`] || dragStartPosRef.current[altId];
            }
        }
        
        const clearTransforms = () => {
            selectedIdsRef.current.forEach(id => {
                const labelNode = document.getElementById(`room-label-${id}`);
                if (labelNode) labelNode.style.transform = '';
                
                const room = rooms.find(r => r.id === id || r.docId === id);
                if (room) {
                    const rDocId = room.docId || room.id;
                    const rId = room.id || room.docId;
                    const geometriesCount = room.geometries?.length || 1;
                    for (let gi = 0; gi < geometriesCount; gi++) {
                        const wallNode = document.getElementById(`ghost-wall-${rDocId}-${gi}`) || (rId ? document.getElementById(`ghost-wall-${room.id}-${gi}`) : null);
                        if (wallNode) wallNode.style.transform = '';
                        const ctrlNode = document.getElementById(`poly-controls-${rDocId}-geom-${gi}`) || (rId ? document.getElementById(`poly-controls-${room.id}-geom-${gi}`) : null);
                        if (ctrlNode) ctrlNode.style.transform = '';
                        
                        // Only clear transform on SVG polygon overlays (not Rnd rect nodes)
                        const geom = room.geometries?.[gi] || room.map_coordinates;
                        if (geom?.shape === 'polygon') {
                            const elementId = gi === 0 ? `rnd-node-${rDocId}` : `inner-rnd-${rDocId}-geom-${gi}`;
                            const el = document.getElementById(elementId) || (rId ? document.getElementById(gi === 0 ? `rnd-node-${room.id}` : `inner-rnd-${room.id}-geom-${gi}`) : null);
                            if (el) el.style.transform = '';
                        }
                    }
                }
            });
            dragCachedNodesRef.current = {};
            labelCachedNodesRef.current = {};
            wallCachedNodesRef.current = {};
            controlsCachedNodesRef.current = {};
        };

        if (!start || isNaN(d.x) || isNaN(d.y)) {
            clearTransforms();
            return;
        }

        // Safety Guard: Ignore invalid 0,0 drag stop if start position was far from origin
        if (d.x === 0 && d.y === 0 && (start.x > 60 || start.y > 60)) {
            console.warn(`[DRAG GUARD] Ignored invalid 0,0 drag-stop for ${draggedId}`);
            clearTransforms();
            return;
        }

        const snappedActiveX = absoluteSnap(d.x);
        const snappedActiveY = absoluteSnap(d.y);
        const snappedStartX = absoluteSnap(start.x);
        const snappedStartY = absoluteSnap(start.y);
        
        const offsetX = snappedActiveX - snappedStartX;
        const offsetY = snappedActiveY - snappedStartY;

        // Safety Guard: Ignore single-frame coordinate jumps
        if (Math.abs(offsetX) > 2000 || Math.abs(offsetY) > 2000) {
            console.warn(`[DRAG GUARD] Ignored abnormal drag-stop offset jump (${offsetX}, ${offsetY}) for ${draggedId}`);
            clearTransforms();
            return;
        }

        const snapshotPositions = { ...dragStartPosRef.current };

        saveSnapshot();

        // Update Rooms (including all internal geometries for merged rooms, updating both box bounds and polygon points/curves)
        setRooms(prev => prev.map(r => {
            const id = r.docId || r.id;
            if (selectedIdsRef.current.has(id) || selectedIdsRef.current.has(r.id) || selectedIdsRef.current.has(r.docId!)) {
                markDirty(id);
                // If it has geometries, update all of them by the offset
                if (r.geometries && r.geometries.length > 0) {
                    return {
                        ...r,
                        geometries: r.geometries.map((gc: any, gi: number) => {
                            const gStart = snapshotPositions[`${id}-geom-${gi}`] || snapshotPositions[`${r.id}-geom-${gi}`] || gc;
                            return {
                                ...gc,
                                x: absoluteSnap(gStart.x) + offsetX,
                                y: absoluteSnap(gStart.y) + offsetY,
                                ...(gc.shape === 'polygon' && gc.points ? {
                                    points: gc.points.map((pt: any) => ({
                                        ...pt,
                                        x: pt.x + offsetX,
                                        y: pt.y + offsetY,
                                        ...(pt.curve ? { curve: { cx: pt.curve.cx + offsetX, cy: pt.curve.cy + offsetY } } : {})
                                    }))
                                } : {})
                            };
                        })
                    };
                }
                // Legacy single-coords room
                const sStart = snapshotPositions[id] || snapshotPositions[r.id];
                if (r.map_coordinates && sStart) {
                    return {
                        ...r,
                        map_coordinates: {
                            ...r.map_coordinates,
                            x: absoluteSnap(sStart.x) + offsetX,
                            y: absoluteSnap(sStart.y) + offsetY,
                            ...(r.map_coordinates.shape === 'polygon' && r.map_coordinates.points ? {
                                points: r.map_coordinates.points.map((pt: any) => ({
                                    ...pt,
                                    x: pt.x + offsetX,
                                    y: pt.y + offsetY,
                                    ...(pt.curve ? { curve: { cx: pt.curve.cx + offsetX, cy: pt.curve.cy + offsetY } } : {})
                                }))
                            } : {})
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
                    const finalX = absoluteSnap(sStart.x) + offsetX;
                    const finalY = absoluteSnap(sStart.y) + offsetY;
                    
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
        
        clearTransforms();
        setSelectionTick(t => t + 1); // Finally sync selection UI
    };

    const handleUpdateLocationProperty = (id: string, property: 'width' | 'height' | 'x' | 'y' | 'rotation' | 'scale' | 'skewX' | 'shape' | 'points', value: any) => {
        saveSnapshot();
        markDirty(id);
        
        let val = 0;
        if (property !== 'shape' && property !== 'points') {
            if (typeof value === 'string' && (value.trim() === "" || isNaN(parseFloat(value)))) return;
            val = typeof value === 'string' ? parseFloat(value) : (typeof value === 'number' ? value : 0);
            if (isNaN(val)) return;
        }

        // Units conversion: feet to pixels for spatial properties
        // NEW: 'scale' is a raw multiplier, rotation/skewX/shape/points are raw values
        const pixels = (property === 'rotation' || property === 'scale' || property === 'skewX' || property === 'shape' || property === 'points') ? value : absoluteSnap(val * PIXELS_PER_FOOT);

        setLocalCoords(prev => {
            const c = prev[id];
            if (!c) return prev;

            let updatedFields: any = { [property]: pixels };
            
            // Enforce circle properties
            if (property === 'shape' && pixels === 'circle') {
                const diameter = Math.max(c.width, c.height);
                updatedFields.width = diameter;
                updatedFields.height = diameter;
            }

            // Recalculate bounding box for polygon points
            if (property === 'points') {
                const pts = pixels;
                if (pts && pts.length > 0) {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    pts.forEach((pt: any) => {
                        minX = Math.min(minX, pt.x);
                        minY = Math.min(minY, pt.y);
                        maxX = Math.max(maxX, pt.x);
                        maxY = Math.max(maxY, pt.y);
                    });
                    updatedFields.x = minX;
                    updatedFields.y = minY;
                    updatedFields.width = maxX - minX;
                    updatedFields.height = maxY - minY;
                }
            }

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
                [id]: { ...c, ...updatedFields }
            };
        });
    };

    const handleUpdateRoomProperty = (id: string, property: 'name' | 'width' | 'height' | 'x' | 'y' | 'rotation' | 'skewX' | 'shape' | 'points', value: any, index?: number) => {
        // If it's a name update, don't snapshot every keystroke to avoid spam
        if (property !== 'name') saveSnapshot();
        
        markDirty(id);
        setRooms(prev => prev.map(r => {
            const rid = r.docId || r.id;
            if (rid === id || r.id === id || r.docId === id) {
                if (property === 'name') return { ...r, name: value as string };
                
                let val = 0;
                if (property !== 'shape' && property !== 'points') {
                    if (typeof value === 'string' && (value.trim() === "" || isNaN(parseFloat(value)))) return r;
                    val = typeof value === 'string' ? parseFloat(value) : (typeof value === 'number' ? value : 0);
                    if (isNaN(val)) return r;
                }

                // Units conversion: feet to pixels for spatial properties
                const pixels = (property === 'rotation' || property === 'skewX' || property === 'shape' || property === 'points') ? value : absoluteSnap(val * PIXELS_PER_FOOT);

                const updateCoords = (c: any, i: number) => {
                    if (index !== undefined && i !== index) return c;
                    
                    let updatedFields: any = { [property]: pixels };
                    
                    // Enforce circle properties
                    if (property === 'shape' && pixels === 'circle') {
                        const diameter = Math.max(c.width, c.height);
                        updatedFields.width = diameter;
                        updatedFields.height = diameter;
                    }
                    
                    // Enforce polygon coordinates initialization
                    if (property === 'shape' && pixels === 'polygon' && !c.points) {
                        updatedFields.points = [
                            { x: c.x, y: c.y },
                            { x: c.x + c.width, y: c.y },
                            { x: c.x + c.width, y: c.y + c.height },
                            { x: c.x, y: c.y + c.height }
                        ];
                    }

                    // Recalculate bounding box for polygon points (including curve control points)
                    if (property === 'points') {
                        const pts = pixels;
                        if (pts && pts.length > 0) {
                            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                            pts.forEach((pt: { x: number; y: number; curve?: { cx: number; cy: number } }) => {
                                minX = Math.min(minX, pt.x);
                                minY = Math.min(minY, pt.y);
                                maxX = Math.max(maxX, pt.x);
                                maxY = Math.max(maxY, pt.y);
                                if (pt.curve) {
                                    minX = Math.min(minX, pt.curve.cx);
                                    minY = Math.min(minY, pt.curve.cy);
                                    maxX = Math.max(maxX, pt.curve.cx);
                                    maxY = Math.max(maxY, pt.curve.cy);
                                }
                            });
                            updatedFields.x = minX;
                            updatedFields.y = minY;
                            updatedFields.width = maxX - minX;
                            updatedFields.height = maxY - minY;
                        }
                    }
                    
                    // Clear points if shape is reset to rectangle or circle
                    if (property === 'shape' && pixels !== 'polygon') {
                        updatedFields.points = null;
                    }

                    return { ...c, ...updatedFields };
                };

                const currentGeom = r.geometries?.[index || 0] || r.map_coordinates;
                const isPolygon = currentGeom?.shape === 'polygon';

                // If rotation makes it vertical/horizontal, swap dimensions to match the physical box
                if (!isPolygon && property === 'rotation' && val % 180 !== (currentGeom?.rotation || 0) % 180 && val % 90 === 0) {
                    const swapCoords = (c: any, i: number) => {
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
                        map_coordinates: r.map_coordinates ? swapCoords(r.map_coordinates, 0) : null,
                        geometries: r.geometries ? r.geometries.map(swapCoords) : undefined
                    };
                }

                if (r.geometries && r.geometries.length > 0) {
                    return {
                        ...r,
                        geometries: r.geometries.map(updateCoords)
                    };
                }
                if (r.map_coordinates) {
                    return {
                        ...r,
                        map_coordinates: updateCoords(r.map_coordinates, 0)
                    };
                }
            }
            return r;
        }));
    };

    const handleAddSpatialBlock = (roomId: string) => {
        saveSnapshot();
        markDirty(roomId);
        setRooms(prev => prev.map(r => {
            const rid = r.docId || r.id;
            if (rid === roomId) {
                const baseGeom = r.map_coordinates || { x: 120, y: 120, width: 360, height: 360, rotation: 0 };
                const currentGeoms = r.geometries && r.geometries.length > 0
                    ? [...r.geometries]
                    : [baseGeom];
                
                const lastGeom = currentGeoms[currentGeoms.length - 1];
                const newBlock = {
                    x: Math.min(CANVAS_WIDTH - 240, lastGeom.x + 48),
                    y: Math.min(CANVAS_HEIGHT - 240, lastGeom.y + 48),
                    width: 240, // default 10 ft
                    height: 240,
                    rotation: 0
                };
                
                return {
                    ...r,
                    map_coordinates: null,
                    geometries: [...currentGeoms, newBlock]
                };
            }
            return r;
        }));
    };

    const handleRemoveSpatialBlock = (roomId: string, index: number) => {
        saveSnapshot();
        markDirty(roomId);
        setRooms(prev => prev.map(r => {
            const rid = r.docId || r.id;
            if (rid === roomId && r.geometries) {
                const filtered = r.geometries.filter((_, i) => i !== index);
                if (filtered.length === 1) {
                    return {
                        ...r,
                        map_coordinates: filtered[0],
                        geometries: undefined
                    };
                }
                return {
                    ...r,
                    geometries: filtered
                };
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

    const getTooltipPosition = () => {
        if (!targetRect) {
            return {
                position: 'fixed' as const,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 310,
                width: '340px'
            };
        }

        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const tooltipWidth = 340;
        
        let left = targetRect.left;
        let top = targetRect.top + targetRect.height + 12;
        
        if (targetRect.left + targetRect.width > screenWidth / 2) {
            if (targetRect.left > tooltipWidth + 24) {
                left = targetRect.left - tooltipWidth - 12;
                top = Math.max(20, targetRect.top + (targetRect.height / 2) - 100);
            }
        } else {
            if (screenWidth - (targetRect.left + targetRect.width) > tooltipWidth + 24) {
                left = targetRect.left + targetRect.width + 12;
                top = Math.max(20, targetRect.top + (targetRect.height / 2) - 100);
            }
        }

        left = Math.max(20, Math.min(left, screenWidth - tooltipWidth - 20));
        top = Math.max(20, Math.min(top, screenHeight - 250));

        return {
            position: 'fixed' as const,
            top: `${top}px`,
            left: `${left}px`,
            zIndex: 310,
            width: `${tooltipWidth}px`
        };
    };

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

                    <div id="tour-floor-selector" className="flex items-center gap-2 border-l border-tan-light/50 pl-6">
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

                    <button 
                        onClick={() => setShowHelpModal(true)} 
                        className="p-2 bg-cream text-charcoal hover:text-tan rounded-lg border border-tan-light/30 hover:bg-white transition-colors"
                        title="Help Center & Legend"
                    >
                        <HelpCircle size={18} />
                    </button>
                    
                    {isSAHSUser && (
                        <div id="tour-save-container" className="flex items-center gap-3 ml-4 border-l border-tan-light/50 pl-4">
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

            {isEditMode && (tourStep === null || tourStep === 2) && (
                <Rnd
                    size={isSidebarMinimized ? { width: 220, height: 48 } : { width: 320, height: 480 }}
                    position={sidebarPos}
                    onDragStop={(_e, d) => setSidebarPos({ x: d.x, y: d.y })}
                    disableDragging={false}
                    enableResizing={!isSidebarMinimized}
                    bounds="parent"
                    className="z-[300]"
                >
                    <div id="tour-sidebar" className={`bg-white rounded-xl shadow-2xl border-2 border-tan overflow-hidden flex flex-col h-full ${isSidebarMinimized ? 'opacity-90' : ''}`}>
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
                                                                <div className="flex justify-between items-center">
                                                                    <label className="text-[10px] font-bold text-charcoal/40 uppercase block">Spatial Blocks</label>
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => handleAddSpatialBlock(id)}
                                                                        className="px-2 py-1 bg-tan/10 hover:bg-tan/20 border border-dashed border-tan/30 rounded text-[9px] font-bold text-tan flex items-center gap-1 transition-colors"
                                                                    >
                                                                        <Plus size={10} /> Add Block
                                                                    </button>
                                                                </div>
                                                                {geometries.map((geom, idx) => (
                                                                    <div 
                                                                        key={idx} 
                                                                        className={`p-3 rounded-lg border transition-all ${hoveredBlock?.roomId === id && hoveredBlock.index === idx ? 'bg-tan/10 border-tan/40 shadow-sm' : 'bg-tan/5 border-tan/10'}`}
                                                                        onMouseEnter={() => setHoveredBlock({ roomId: id, index: idx })}
                                                                        onMouseLeave={() => setHoveredBlock(null)}
                                                                    >
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <span className="text-[10px] font-black text-tan/60 uppercase">Section {idx + 1}</span>
                                                                            <div className="flex items-center gap-2">
                                                                                {geometries.length > 1 && (
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={() => handleRemoveSpatialBlock(id, idx)}
                                                                                        className="text-red-800/60 hover:text-red-800 transition-colors p-1"
                                                                                        title="Remove block section"
                                                                                    >
                                                                                        <X size={10} />
                                                                                    </button>
                                                                                )}
                                                                                <span className="text-[9px] font-mono text-tan/40">{(geom.width * geom.height / (PIXELS_PER_FOOT**2)).toFixed(1)} sq.ft.</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex gap-2 mb-3">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleUpdateRoomProperty(id, 'shape', 'rectangle', idx)}
                                                                                className={`flex-1 py-1 rounded text-[10px] font-bold border transition-all ${(!geom.shape || geom.shape === 'rectangle') ? 'bg-tan text-white border-tan' : 'bg-white border-tan/20 text-charcoal/60 hover:bg-tan/5'}`}
                                                                            >
                                                                                ▭ Rect
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleUpdateRoomProperty(id, 'shape', 'circle', idx)}
                                                                                className={`flex-1 py-1 rounded text-[10px] font-bold border transition-all ${(geom.shape === 'circle') ? 'bg-tan text-white border-tan' : 'bg-white border-tan/20 text-charcoal/60 hover:bg-tan/5'}`}
                                                                            >
                                                                                ◯ Circle
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleUpdateRoomProperty(id, 'shape', 'polygon', idx)}
                                                                                className={`flex-1 py-1 rounded text-[10px] font-bold border transition-all ${(geom.shape === 'polygon') ? 'bg-tan text-white border-tan' : 'bg-white border-tan/20 text-charcoal/60 hover:bg-tan/5'}`}
                                                                            >
                                                                                ⬡ Polygon
                                                                            </button>
                                                                        </div>

                                                                        {geom.shape === 'polygon' ? (
                                                                            <div className="space-y-2 mb-3">
                                                                                <div className="flex justify-between items-center text-[10px] text-charcoal/50 font-bold bg-tan/5 p-2 rounded border border-tan/10">
                                                                                    <span>Corners: {geom.points?.length || 0}</span>
                                                                                </div>
                                                                                <div className="text-[8px] font-mono font-bold text-tan-dark/80 bg-cream/30 p-2 rounded leading-relaxed border border-tan-light/10">
                                                                                    💡 Click <span className="text-blue-500">(+)</span> to add a corner. Click <span className="text-orange-500">(⌒)</span> to curve an edge. Double-click a corner to delete it.
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <>
                                                                                <div className="grid grid-cols-2 gap-3 mb-3">
                                                                                    <div>
                                                                                        <label className="text-[9px] font-bold text-charcoal/30 uppercase mb-0.5 block">
                                                                                            {geom.shape === 'circle' ? 'Diameter (ft)' : 'Width (ft)'}
                                                                                        </label>
                                                                                        <input 
                                                                                            type="number" 
                                                                                            step="0.5"
                                                                                            value={geom.width / PIXELS_PER_FOOT} 
                                                                                            onChange={(e) => {
                                                                                                handleUpdateRoomProperty(id, 'width', e.target.value, idx);
                                                                                                if (geom.shape === 'circle') {
                                                                                                    handleUpdateRoomProperty(id, 'height', e.target.value, idx);
                                                                                                }
                                                                                            }}
                                                                                            className="w-full bg-white border border-tan/10 rounded px-2 py-1 text-xs font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                                        />
                                                                                    </div>
                                                                                    {geom.shape !== 'circle' && (
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
                                                                                    )}
                                                                                </div>
                                                                                <div className="grid grid-cols-4 gap-1.5">
                                                                                    <div>
                                                                                        <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">X (ft)</label>
                                                                                        <input 
                                                                                            type="number" 
                                                                                            step="0.5"
                                                                                            value={geom.x / PIXELS_PER_FOOT} 
                                                                                            onChange={(e) => handleUpdateRoomProperty(id, 'x', e.target.value, idx)}
                                                                                            className="w-full bg-tan/5 border border-tan/10 rounded px-1 py-0.5 text-[9px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                                        />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">Y (ft)</label>
                                                                                        <input 
                                                                                            type="number" 
                                                                                            step="0.5"
                                                                                            value={geom.y / PIXELS_PER_FOOT} 
                                                                                            onChange={(e) => handleUpdateRoomProperty(id, 'y', e.target.value, idx)}
                                                                                            className="w-full bg-tan/5 border border-tan/10 rounded px-1 py-0.5 text-[9px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                                        />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">Rot</label>
                                                                                        <input 
                                                                                            type="number" 
                                                                                            step="45"
                                                                                            value={geom.rotation || 0} 
                                                                                            onChange={(e) => handleUpdateRoomProperty(id, 'rotation', e.target.value, idx)}
                                                                                            className="w-full bg-tan/5 border border-tan/10 rounded px-1 py-0.5 text-[9px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                                        />
                                                                                    </div>
                                                                                    {geom.shape !== 'circle' && (
                                                                                        <div>
                                                                                            <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">Skew</label>
                                                                                            <input 
                                                                                                type="number" 
                                                                                                step="15"
                                                                                                value={geom.skewX || 0} 
                                                                                                onChange={(e) => handleUpdateRoomProperty(id, 'skewX', e.target.value, idx)}
                                                                                                className="w-full bg-tan/5 border border-tan/10 rounded px-1 py-0.5 text-[9px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                                            />
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </>
                                                                        )}
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
                                                            <div className="grid grid-cols-4 gap-1.5">
                                                                 <div>
                                                                     <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">X (ft)</label>
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
                                                                         className="w-full bg-tan/5 border border-tan/10 rounded px-1 py-0.5 text-[9px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                     />
                                                                 </div>
                                                                 <div>
                                                                     <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">Y (ft)</label>
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
                                                                         className="w-full bg-tan/5 border border-tan/10 rounded px-1 py-0.5 text-[9px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                     />
                                                                 </div>
                                                                 <div>
                                                                     <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">Rot</label>
                                                                     <input 
                                                                         type="number" 
                                                                         step="45"
                                                                         value={locCoords.rotation || 0} 
                                                                         onChange={(e) => handleUpdateLocationProperty(id, 'rotation', e.target.value)}
                                                                         onKeyDown={(e) => {
                                                                             if (e.key === 'Enter') {
                                                                                 (e.target as HTMLInputElement).blur();
                                                                             }
                                                                         }}
                                                                         className="w-full bg-tan/5 border border-tan/10 rounded px-1 py-0.5 text-[9px] font-mono font-bold text-charcoal outline-none focus:border-tan"
                                                                     />
                                                                 </div>
                                                                 <div>
                                                                     <label className="text-[8px] font-bold text-charcoal/30 uppercase mb-0.5 block">Skew</label>
                                                                     <input 
                                                                         type="number" 
                                                                         step="15"
                                                                         value={locCoords.skewX || 0} 
                                                                         onChange={(e) => handleUpdateLocationProperty(id, 'skewX', e.target.value)}
                                                                         onKeyDown={(e) => {
                                                                             if (e.key === 'Enter') {
                                                                                 (e.target as HTMLInputElement).blur();
                                                                             }
                                                                         }}
                                                                         className="w-full bg-tan/5 border border-tan/10 rounded px-1 py-0.5 text-[9px] font-mono font-bold text-charcoal outline-none focus:border-tan"
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
                                <div className="absolute top-0 left-0 blueprint-grid select-none" onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp} onDragStart={(e) => e.preventDefault()} style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left', userSelect: 'none', WebkitUserSelect: 'none' }}>
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

                                const renderBox = (c: any, index: number) => {
                                    const isCircle = c.shape === 'circle';
                                    const isPolygon = c.shape === 'polygon';
                                    const hasTransform = (c.rotation && c.rotation % 360 !== 0) || (c.skewX && c.skewX % 360 !== 0);

                                    if (isPolygon) {
                                        const points = c.points || [
                                            { x: c.x, y: c.y },
                                            { x: c.x + c.width, y: c.y },
                                            { x: c.x + c.width, y: c.y + c.height },
                                            { x: c.x, y: c.y + c.height }
                                        ];
                                        return (
                                            <Fragment key={`${room.docId}-poly-${index}-${isEditMode}`}>
                                                {/* SVG Canvas overlay for the polygon room */}
                                                <svg 
                                                    id={index === 0 ? `rnd-node-${room.docId}` : `inner-rnd-${room.docId}-geom-${index}`}
                                                    className="absolute inset-0 pointer-events-none w-full h-full react-draggable"
                                                    style={{ zIndex: isSelected ? 40 : 5 }}
                                                >
                                                    <path
                                                        d={(() => {
                                                            let d = `M ${points[0].x},${points[0].y}`;
                                                            for (let i = 0; i < points.length; i++) {
                                                                const next = points[(i + 1) % points.length];
                                                                if (points[i].curve) {
                                                                    d += ` Q ${points[i].curve!.cx},${points[i].curve!.cy} ${next.x},${next.y}`;
                                                                } else {
                                                                    d += ` L ${next.x},${next.y}`;
                                                                }
                                                            }
                                                            d += ' Z';
                                                            return d;
                                                        })()}
                                                        className={`pointer-events-auto ${isEditMode ? 'cursor-move' : ''}`}
                                                        style={{
                                                            fill: (hoveredBlock && hoveredBlock.roomId === room.docId && hoveredBlock.index === index)
                                                                ? 'rgba(59, 130, 246, 0.4)'
                                                                : isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(210, 180, 140, 0.25)',
                                                            stroke: isSelected ? '#3b82f6' : '#d2b48c',
                                                            strokeWidth: isSelected ? 2 : 1,
                                                            transition: 'fill 0.15s ease-in-out'
                                                        }}
                                                        onMouseEnter={() => setHoveredBlock({ roomId: room.docId!, index })}
                                                        onMouseLeave={() => setHoveredBlock(null)}
                                                        onMouseDown={(e) => {
                                                            if (isEditMode && e.shiftKey) {
                                                                handleItemSelection(room.docId!, e);
                                                            } else if (isEditMode && !e.shiftKey) {
                                                                handleItemSelection(room.docId!, e);
                                                                e.stopPropagation();
                                                                
                                                                handleGroupDragStart(room.docId!, index, e);
                                                                
                                                                setDraggingPolygon({
                                                                    roomId: room.docId!,
                                                                    geomIndex: index,
                                                                    startX: c.x,
                                                                    startY: c.y,
                                                                    mouseStartX: e.clientX,
                                                                    mouseStartY: e.clientY
                                                                });
                                                            }
                                                        }}
                                                        onClickCapture={(e) => {
                                                            if (isEditMode && !e.shiftKey) handleItemSelection(room.docId!, e);
                                                        }}
                                                    />
                                                    {isEditMode && isSelected && (
                                                         <>
                                                             {/* Curve control point handles and guide lines */}
                                                             {points.map((pt: any, pIdx: number) => {
                                                                 if (!pt.curve) return null;
                                                                 const nextPt = points[(pIdx + 1) % points.length];
                                                                 return (
                                                                     <g key={`curve-ctrl-${pIdx}`}>
                                                                         {/* Dashed guide lines from control point to both vertices */}
                                                                         <line
                                                                             x1={pt.x} y1={pt.y}
                                                                             x2={pt.curve.cx} y2={pt.curve.cy}
                                                                             stroke="#f97316" strokeWidth={1} strokeDasharray="4 3"
                                                                             className="pointer-events-none" opacity={0.6}
                                                                         />
                                                                         <line
                                                                             x1={nextPt.x} y1={nextPt.y}
                                                                             x2={pt.curve.cx} y2={pt.curve.cy}
                                                                             stroke="#f97316" strokeWidth={1} strokeDasharray="4 3"
                                                                             className="pointer-events-none" opacity={0.6}
                                                                         />
                                                                         {/* Draggable orange control point diamond */}
                                                                         <rect
                                                                             x={pt.curve.cx - 7}
                                                                             y={pt.curve.cy - 7}
                                                                             width={14}
                                                                             height={14}
                                                                             rx={2}
                                                                             fill="#f97316"
                                                                             stroke="white"
                                                                             strokeWidth={2}
                                                                             className="pointer-events-auto cursor-grab"
                                                                             style={{ transform: `rotate(45deg)`, transformOrigin: `${pt.curve.cx}px ${pt.curve.cy}px` }}
                                                                             onMouseDown={(e) => {
                                                                                 e.stopPropagation();
                                                                                 setDraggingCurveControl({
                                                                                     roomId: room.docId!,
                                                                                     geomIndex: index,
                                                                                     pointIndex: pIdx,
                                                                                     startPoints: [...points.map((p: any) => ({ ...p, curve: p.curve ? { ...p.curve } : undefined }))],
                                                                                     startX: e.clientX,
                                                                                     startY: e.clientY
                                                                                 });
                                                                             }}
                                                                         />
                                                                     </g>
                                                                 );
                                                             })}

                                                             {/* Midpoint '+' handles and '⌒' curve toggle buttons */}
                                                             {points.map((pt: any, pIdx: number) => {
                                                                 const nextPt = points[(pIdx + 1) % points.length];
                                                                 const midX = (pt.x + nextPt.x) / 2;
                                                                 const midY = (pt.y + nextPt.y) / 2;
                                                                 // Compute perpendicular offset direction for curve toggle placement
                                                                 const edgeDx = nextPt.x - pt.x;
                                                                 const edgeDy = nextPt.y - pt.y;
                                                                 const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) || 1;
                                                                 // Perpendicular unit vector (pointing "outward")
                                                                 const perpX = -edgeDy / edgeLen;
                                                                 const perpY = edgeDx / edgeLen;
                                                                 const toggleOffset = 18; // px offset from edge
                                                                 const toggleX = midX + perpX * toggleOffset;
                                                                 const toggleY = midY + perpY * toggleOffset;
                                                                 const isCurved = !!pt.curve;
                                                                 return (
                                                                     <g key={`mid-${pIdx}`}>
                                                                         {/* Add corner '+' handle on the edge */}
                                                                         <circle
                                                                             cx={midX}
                                                                             cy={midY}
                                                                             r={10}
                                                                             fill="#3b82f6"
                                                                             stroke="white"
                                                                             strokeWidth={1}
                                                                             opacity={0.5}
                                                                             className="pointer-events-auto cursor-pointer"
                                                                             onMouseDown={(e) => {
                                                                                 e.stopPropagation();
                                                                                 const newPt = { x: Math.round(midX), y: Math.round(midY) };
                                                                                 const updatedPoints = [
                                                                                     ...points.slice(0, pIdx + 1),
                                                                                     newPt,
                                                                                     ...points.slice(pIdx + 1)
                                                                                 ];
                                                                                 handleUpdateRoomProperty(room.docId!, 'points', updatedPoints, index);
                                                                             }}
                                                                         />
                                                                         <line x1={midX - 3} y1={midY} x2={midX + 3} y2={midY} stroke="white" strokeWidth={1.5} className="pointer-events-none" />
                                                                         <line x1={midX} y1={midY - 3} x2={midX} y2={midY + 3} stroke="white" strokeWidth={1.5} className="pointer-events-none" />

                                                                         {/* Curve toggle button offset perpendicular to edge */}
                                                                         <circle
                                                                             cx={toggleX}
                                                                             cy={toggleY}
                                                                             r={9}
                                                                             fill={isCurved ? '#22c55e' : '#f97316'}
                                                                             stroke="white"
                                                                             strokeWidth={1.5}
                                                                             opacity={0.7}
                                                                             className="pointer-events-auto cursor-pointer"
                                                                             onMouseDown={(e) => {
                                                                                 e.stopPropagation();
                                                                                 if (isCurved) {
                                                                                     // Remove curve — set edge back to straight
                                                                                     const updatedPoints = points.map((p: any, idx: number) =>
                                                                                         idx === pIdx ? { x: p.x, y: p.y } : p
                                                                                     );
                                                                                     handleUpdateRoomProperty(room.docId!, 'points', updatedPoints, index);
                                                                                 } else {
                                                                                     // Add curve — place control point 40px perpendicular from midpoint
                                                                                     const curveOffset = 40;
                                                                                     const cx = Math.round(midX + perpX * curveOffset);
                                                                                     const cy = Math.round(midY + perpY * curveOffset);
                                                                                     const updatedPoints = points.map((p: any, idx: number) =>
                                                                                         idx === pIdx ? { ...p, curve: { cx, cy } } : p
                                                                                     );
                                                                                     handleUpdateRoomProperty(room.docId!, 'points', updatedPoints, index);
                                                                                 }
                                                                             }}
                                                                         />
                                                                         {/* Icon inside toggle: ⌒ arc for straight, — dash for curved */}
                                                                         {isCurved ? (
                                                                             <line
                                                                                 x1={toggleX - 4} y1={toggleY}
                                                                                 x2={toggleX + 4} y2={toggleY}
                                                                                 stroke="white" strokeWidth={2} strokeLinecap="round"
                                                                                 className="pointer-events-none"
                                                                             />
                                                                         ) : (
                                                                             <path
                                                                                 d={`M ${toggleX - 4},${toggleY + 2} Q ${toggleX},${toggleY - 4} ${toggleX + 4},${toggleY + 2}`}
                                                                                 fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round"
                                                                                 className="pointer-events-none"
                                                                             />
                                                                         )}
                                                                     </g>
                                                                 );
                                                             })}

                                                             {/* Vertex corner dots */}
                                                             {points.map((pt: any, pIdx: number) => (
                                                                 <circle
                                                                     key={pIdx}
                                                                     cx={pt.x}
                                                                     cy={pt.y}
                                                                     r={10}
                                                                     fill="white"
                                                                     stroke="#3b82f6"
                                                                     strokeWidth={2.5}
                                                                     className="pointer-events-auto cursor-pointer"
                                                                     onMouseDown={(e) => {
                                                                         e.stopPropagation();
                                                                         setDraggingVertex({
                                                                             roomId: room.docId!,
                                                                             geomIndex: index,
                                                                             pointIndex: pIdx,
                                                                             startPoints: [...points.map((p: any) => ({ ...p, curve: p.curve ? { ...p.curve } : undefined }))],
                                                                             startX: e.clientX,
                                                                             startY: e.clientY
                                                                         });
                                                                     }}
                                                                     onDoubleClick={(e) => {
                                                                         e.stopPropagation();
                                                                         if (points.length <= 3) return;
                                                                         const updatedPoints = points.filter((_: any, idx: number) => idx !== pIdx);
                                                                         handleUpdateRoomProperty(room.docId!, 'points', updatedPoints, index);
                                                                     }}
                                                                 />
                                                             ))}
                                                         </>
                                                     )}
                                                </svg>

                                                {/* Local Controls Overlay positioned at the top-right corner of bounding box */}
                                                {isEditMode && (isSelected || index === 0) && (
                                                    <div 
                                                        id={`poly-controls-${room.docId}-geom-${index}`}
                                                        className="absolute pointer-events-auto z-[60] flex gap-1"
                                                        style={{ left: c.x + c.width - 24, top: c.y - 12 }}
                                                    >
                                                        <button onClick={(e) => removeFromMap(room.docId!, e)} className="bg-red-500 text-white p-1.5 rounded-md hover:bg-red-600 shadow-md transition-all hover:scale-110 active:scale-90"><X size={14}/></button>
                                                    </div>
                                                )}
                                            </Fragment>
                                        );
                                    }

                                    return (
                                        <Rnd
                                            key={`${room.docId}-box-${index}-${isEditMode}`}
                                            id={index === 0 ? `rnd-node-${room.docId}` : `inner-rnd-${room.docId}-geom-${index}`}
                                            className={`absolute ${isEditMode ? 'cursor-move' : 'pointer-events-none'}`}
                                            onMouseDownCapture={(e: any) => {
                                                if (isEditMode && e.shiftKey) handleItemSelection(room.docId!, e);
                                            }}
                                            onClickCapture={(e: any) => {
                                                if (isEditMode && !e.shiftKey) handleItemSelection(room.docId!, e);
                                            }}
                                            style={{ 
                                                backgroundColor: hasTransform
                                                    ? 'transparent'
                                                    : (hoveredBlock && hoveredBlock.roomId === room.docId && hoveredBlock.index === index) 
                                                        ? 'rgba(59, 130, 246, 0.4)' 
                                                        : isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(210, 180, 140, 0.25)',
                                                zIndex: isSelected ? 40 : 5,
                                                boxShadow: (hoveredBlock && hoveredBlock.roomId === room.docId && hoveredBlock.index === index) 
                                                    ? '0 0 15px rgba(59, 130, 246, 0.5)' 
                                                    : 'none',
                                                border: hasTransform
                                                    ? (isSelected ? '1px dashed rgba(59, 130, 246, 0.4)' : 'none')
                                                    : (isSelected ? '2px solid #3b82f6' : '1px solid #d2b48c'),
                                                borderRadius: isCircle ? '50%' : '0',
                                                ...(hasTransform ? {} : getSmartBorders(c, geometries, isSelected))
                                            }}
                                            scale={scale}
                                            disableDragging={!isEditMode}
                                            enableResizing={isEditMode}
                                            lockAspectRatio={isCircle}
                                            resizeHandleClasses={isSelected && isEditMode ? {
                                                topLeft: "w-3 h-3 bg-white border-2 border-blue-500 rounded-full absolute -top-1.5 -left-1.5 z-[100] shadow-sm hover:scale-125 transition-transform cursor-nwse-resize",
                                                topRight: "w-3 h-3 bg-white border-2 border-blue-500 rounded-full absolute -top-1.5 -right-1.5 z-[100] shadow-sm hover:scale-125 transition-transform cursor-nesw-resize",
                                                bottomLeft: "w-3 h-3 bg-white border-2 border-blue-500 rounded-full absolute -bottom-1.5 -left-1.5 z-[100] shadow-sm hover:scale-125 transition-transform cursor-nesw-resize",
                                                bottomRight: "w-3 h-3 bg-white border-2 border-blue-500 rounded-full absolute -bottom-1.5 -right-1.5 z-[100] shadow-sm hover:scale-125 transition-transform cursor-nwse-resize",
                                                top: isCircle ? "hidden" : "h-1.5 bg-blue-500/20 hover:bg-blue-500/80 absolute top-0 left-2 right-2 z-[90] transition-colors cursor-ns-resize rounded-full",
                                                bottom: isCircle ? "hidden" : "h-1.5 bg-blue-500/20 hover:bg-blue-500/80 absolute bottom-0 left-2 right-2 z-[90] transition-colors cursor-ns-resize rounded-full",
                                                left: isCircle ? "hidden" : "w-1.5 bg-blue-500/20 hover:bg-blue-500/80 absolute top-2 bottom-2 left-0 z-[90] transition-colors cursor-ew-resize rounded-full",
                                                right: isCircle ? "hidden" : "w-1.5 bg-blue-500/20 hover:bg-blue-500/80 absolute top-2 bottom-2 right-0 z-[90] transition-colors cursor-ew-resize rounded-full"
                                            } : {}}
                                            dragGrid={isSnapping && isEditMode ? [12, 12] : undefined}
                                            resizeGrid={isSnapping && isEditMode ? [12, 12] : undefined}
                                            position={{ x: c.x, y: c.y }}
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
                                                
                                                const newW = parseInt(ref.style.width, 10);
                                                const newH = isCircle ? newW : parseInt(ref.style.height, 10);
                                                
                                                setRooms(prev => prev.map(r => r.docId === room.docId ? {
                                                    ...r,
                                                    geometries: (r.geometries || (r.map_coordinates ? [r.map_coordinates] : [])).map((gc, gi) => gi === index ? { ...gc, x: pos.x, y: pos.y, width: newW, height: newH } : gc)
                                                } : r));
                                            }}
                                        >
                                            <div 
                                                data-selection-id={room.docId}
                                                data-geom-id={`${room.docId}-geom-${index}`}
                                                data-selected={isSelected ? "true" : "false"}
                                                className="w-full h-full relative"
                                                style={{ 
                                                    transform: `rotate(${c.rotation || 0}deg) skewX(${c.skewX || 0}deg)`,
                                                    transition: 'all 0.15s ease-in-out',
                                                    border: hasTransform
                                                        ? (isSelected ? '2px solid #3b82f6' : '2px solid rgba(139, 115, 85, 0.6)')
                                                        : 'none',
                                                    backgroundColor: hasTransform
                                                        ? (isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(210, 180, 140, 0.25)')
                                                        : 'transparent',
                                                    borderRadius: isCircle ? '50%' : '0'
                                                }}
                                            >
                                                {/* Dimensional Feedback (Center on box being resized) */}
                                                {resizingRoomId === `${room.docId}-${index}` && activeDimensions && (
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
                                                        <div className="bg-charcoal text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg border border-white/20 whitespace-nowrap">
                                                            {isCircle ? (
                                                                <>Dia: {(activeDimensions.width / PIXELS_PER_FOOT).toFixed(1)}'</>
                                                            ) : (
                                                                <>{(activeDimensions.width / PIXELS_PER_FOOT).toFixed(1)}' x {(activeDimensions.height / PIXELS_PER_FOOT).toFixed(1)}'</>
                                                            )}
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
                                };

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
                                                    id={`ghost-wall-${room.docId}-${i}`}
                                                    key={`${room.docId}-wall-${i}`} 
                                                    style={{ 
                                                        position: 'absolute', 
                                                        left: c.x, 
                                                        top: c.y, 
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
                                            className={`absolute flex items-center justify-center text-center z-[70] ${isEditMode ? 'pointer-events-none' : 'pointer-events-auto'}`}
                                            style={{ 
                                                left: anchorX - 60, 
                                                top: anchorY - 40, 
                                                width: 120, 
                                                height: 80 
                                            }}
                                        >
                                            {!isEditMode ? (
                                                <Link 
                                                    to={`/manage-locations/rooms/${room.docId || room.id}`}
                                                    className={`relative w-full px-2 text-center break-words font-serif font-bold text-charcoal flex flex-col items-center transform transition-all ${isSelected ? 'opacity-100' : 'opacity-85'} hover:text-tan hover:scale-105`}
                                                    style={{ 
                                                        textShadow: '0 0 10px white, 0 0 10px white, 0 0 5px white',
                                                        fontSize: 'min(20px, max(14px, 3vw))',
                                                        lineHeight: '1.1'
                                                    }}
                                                >
                                                    {room.name}
                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 h-[3px] w-12 bg-tan/60 shrink-0"></div>
                                                </Link>
                                            ) : (
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
                                            )}
                                        </div>
                                    </Fragment>
                                );
                            })}

                                    {/* Render Locations (Pins/Blocks) */}
                                    {locations.filter(l => l.name?.toLowerCase() !== 'compass rose' && (l.floor_id || 'default') === currentFloorId).map(loc => {
                                const c = { ...loc, ...(loc.map_coordinates || {}), skewX: 0, ...(localCoords[loc.id] || {}) };
                                if (!localCoords[loc.id]) return null;
                                const isSelected = selectedIdsRef.current.has(loc.id);
                                const hasTransform = (c.rotation && c.rotation % 360 !== 0) || (c.skewX && c.skewX % 360 !== 0);

                                return (
                                    <Rnd
                                        key={`${loc.id}-${isEditMode}`}
                                        id={`rnd-node-${loc.id}`}
                                        className={`absolute group ${isEditMode ? 'cursor-move' : 'cursor-pointer'}`}
                                        onMouseDownCapture={(e: any) => {
                                            if (isEditMode && e.shiftKey) handleItemSelection(loc.id, e);
                                        }}
                                        onClickCapture={(e: any) => {
                                            if (isEditMode && !e.shiftKey) handleItemSelection(loc.id, e);
                                        }}
                                        style={{ 
                                            backgroundColor: hasTransform
                                                ? 'transparent'
                                                : (isSelected && c.display_type !== 'pin') ? 'rgba(59, 130, 246, 0.1)' : (c.display_type === 'box' ? 'rgba(255, 255, 255, 0.9)' : 'transparent'),
                                            zIndex: isSelected ? 150 : (c.z_index || 100),
                                            border: hasTransform
                                                ? (isSelected ? '1.5px dashed rgba(59, 130, 246, 0.4)' : 'none')
                                                : (isSelected && c.display_type !== 'pin') ? '2px solid #3b82f6' : (c.display_type === 'box' ? '2px solid #d2b48c' : 'none'),
                                            borderRadius: c.display_type === 'box' ? '4px' : '0',
                                            pointerEvents: c.display_type === 'pin' ? 'none' : 'auto'
                                        }}
                                        scale={scale}
                                        disableDragging={!isEditMode}
                                        enableResizing={isEditMode && c.display_type !== 'pin'}
                                        resizeHandleClasses={isSelected && isEditMode && c.display_type !== 'pin' ? {
                                            topLeft: "w-3 h-3 bg-white border-2 border-blue-500 rounded-full absolute -top-1.5 -left-1.5 z-[100] shadow-sm hover:scale-125 transition-transform cursor-nwse-resize",
                                            topRight: "w-3 h-3 bg-white border-2 border-blue-500 rounded-full absolute -top-1.5 -right-1.5 z-[100] shadow-sm hover:scale-125 transition-transform cursor-nesw-resize",
                                            bottomLeft: "w-3 h-3 bg-white border-2 border-blue-500 rounded-full absolute -bottom-1.5 -left-1.5 z-[100] shadow-sm hover:scale-125 transition-transform cursor-nesw-resize",
                                            bottomRight: "w-3 h-3 bg-white border-2 border-blue-500 rounded-full absolute -bottom-1.5 -right-1.5 z-[100] shadow-sm hover:scale-125 transition-transform cursor-nwse-resize",
                                            top: "h-1.5 bg-blue-500/20 hover:bg-blue-500/80 absolute top-0 left-2 right-2 z-[90] transition-colors cursor-ns-resize rounded-full",
                                            bottom: "h-1.5 bg-blue-500/20 hover:bg-blue-500/80 absolute bottom-0 left-2 right-2 z-[90] transition-colors cursor-ns-resize rounded-full",
                                            left: "w-1.5 bg-blue-500/20 hover:bg-blue-500/80 absolute top-2 bottom-2 left-0 z-[90] transition-colors cursor-ew-resize rounded-full",
                                            right: "w-1.5 bg-blue-500/20 hover:bg-blue-500/80 absolute top-2 bottom-2 right-0 z-[90] transition-colors cursor-ew-resize rounded-full"
                                        } : {}}
                                        dragGrid={isSnapping && isEditMode ? [12, 12] : undefined}
                                        resizeGrid={isSnapping && isEditMode ? [12, 12] : undefined}
                                        position={{ 
                                            x: c.display_type === 'pin' ? (c.x - 30) : c.x, 
                                            y: c.display_type === 'pin' ? (c.y - 50) : c.y 
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
                                            data-geom-id={`${loc.id}-geom-0`}
                                            data-selected={isSelected ? "true" : "false"}
                                            data-highlighted={activeHighlightId === loc.id ? "true" : "false"}
                                            className="w-full h-full relative" 
                                            style={{ 
                                                transform: `rotate(${c.rotation || 0}deg) skewX(${c.skewX || 0}deg)`,
                                                width: '100%',
                                                height: '100%',
                                                backgroundColor: hasTransform
                                                    ? ((isSelected && c.display_type !== 'pin')
                                                        ? 'rgba(59, 130, 246, 0.1)'
                                                        : (c.display_type === 'box' ? 'rgba(255, 255, 255, 0.9)' : 'transparent'))
                                                    : 'transparent',
                                                border: hasTransform
                                                    ? ((isSelected && c.display_type !== 'pin')
                                                        ? '2px solid #3b82f6'
                                                        : (c.display_type === 'box' ? '2px solid #d2b48c' : 'none'))
                                                    : 'none',
                                                borderRadius: c.display_type === 'box' ? '4px' : '0'
                                            }}
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

            {/* Onboarding Tour Overlay */}
            {tourStep !== null && (
                <div className="fixed inset-0 z-[350] pointer-events-none">
                    {/* Spotlight Overlay */}
                    {targetRect && (
                        <div 
                            className="fixed rounded-lg border-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]"
                            style={{
                                top: `${targetRect.top - 4}px`,
                                left: `${targetRect.left - 4}px`,
                                width: `${targetRect.width + 8}px`,
                                height: `${targetRect.height + 8}px`,
                                outline: '9999px solid rgba(15, 23, 42, 0.45)',
                                zIndex: 300,
                                pointerEvents: 'none'
                            }}
                        />
                    )}
                    
                    {/* Viewport Overlay (when there is no target rect, block background interaction) */}
                    {!targetRect && (
                        <div className="fixed inset-0 bg-charcoal/45 pointer-events-auto z-[290]" />
                    )}

                    {/* Tour Tooltip Card */}
                    <div 
                        className="bg-white rounded-xl border border-tan/30 shadow-2xl p-5 pointer-events-auto flex flex-col gap-4 animate-in zoom-in-95 duration-200"
                        style={getTooltipPosition()}
                    >
                        <div className="flex justify-between items-start">
                            <span className="text-[9px] font-black bg-tan/15 text-tan uppercase tracking-widest px-2 py-0.5 rounded-full">
                                Step {tourStep + 1} of {TOUR_STEPS.length}
                            </span>
                            <button 
                                onClick={() => setTourStep(null)} 
                                className="text-charcoal/40 hover:text-charcoal transition-colors p-0.5 rounded hover:bg-tan/5"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        
                        <div>
                            <h4 className="font-serif font-black text-charcoal text-base mb-1">{TOUR_STEPS[tourStep].title}</h4>
                            <p className="text-xs text-charcoal/70 leading-relaxed font-medium">{TOUR_STEPS[tourStep].description}</p>
                        </div>

                        <div className="flex justify-between items-center mt-2 border-t border-tan-light/20 pt-3">
                            <button 
                                onClick={() => setTourStep(null)}
                                className="text-xs font-bold text-charcoal/40 hover:text-charcoal transition-colors"
                            >
                                Skip Tour
                            </button>
                            <div className="flex gap-2">
                                {tourStep > 0 && (
                                    <button 
                                        onClick={() => setTourStep(tourStep - 1)}
                                        className="bg-cream hover:bg-tan/10 text-charcoal border border-tan/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                    >
                                        Back
                                    </button>
                                )}
                                <button 
                                    onClick={() => {
                                        if (tourStep < TOUR_STEPS.length - 1) {
                                            setTourStep(tourStep + 1);
                                        } else {
                                            setTourStep(null);
                                        }
                                    }}
                                    className="bg-tan hover:bg-tan-dark text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors"
                                >
                                    {tourStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Help Center & Legend Modal */}
            {showHelpModal && (
                <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-[400] flex items-center justify-center animate-in fade-in duration-200" onClick={() => setShowHelpModal(false)}>
                    <div className="bg-cream rounded-2xl border-2 border-tan max-w-lg w-full shadow-2xl p-6 relative animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setShowHelpModal(false)} className="absolute top-4 right-4 text-charcoal hover:text-tan transition-colors p-1 hover:bg-tan/10 rounded-md">
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-3 border-b border-tan-light/30 pb-3 mb-4">
                            <HelpCircle className="text-tan" size={28} />
                            <div>
                                <h2 className="text-xl font-serif font-black text-charcoal">Map Help Center</h2>
                                <p className="text-[10px] text-charcoal/50 font-bold uppercase tracking-wider">Legend, shortcuts, and guided tour</p>
                            </div>
                        </div>

                        <div className="space-y-5">
                            {/* Visual Legend */}
                            <div>
                                <h3 className="text-xs font-serif font-black text-tan uppercase tracking-wider mb-2">Map Visual Legend</h3>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-tan/20">
                                        <div className="w-8 h-6 bg-tan/25 border border-tan rounded" style={{ borderStyle: 'dashed' }} />
                                        <div>
                                            <p className="font-bold text-charcoal">Structural Room</p>
                                            <p className="text-[9px] text-charcoal/50">Dashed structural border</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-tan/20">
                                        <div className="w-8 h-6 bg-white border-2 border-tan rounded" />
                                        <div>
                                            <p className="font-bold text-charcoal">Shelf / Block</p>
                                            <p className="text-[9px] text-charcoal/50">Solid storage partition</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-tan/20 font-serif">
                                        <MapPin size={24} className="text-red-500 fill-white" />
                                        <div>
                                            <p className="font-bold text-charcoal">Archive Pin</p>
                                            <p className="text-[9px] text-charcoal/50">Precise location marker</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-tan/20">
                                        <div className="w-8 h-6 bg-blue-500/10 border-2 border-blue-500 rounded shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
                                        <div>
                                            <p className="font-bold text-charcoal">Active Selection</p>
                                            <p className="text-[9px] text-charcoal/50">Highlighted item(s)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Shortcuts & Gestures */}
                            <div>
                                <h3 className="text-xs font-serif font-black text-tan uppercase tracking-wider mb-2">Shortcuts & Map Gestures</h3>
                                <div className="bg-white p-3 rounded-lg border border-tan/20 space-y-2 text-xs text-charcoal font-medium">
                                    <div className="flex justify-between items-center border-b border-tan-light/10 pb-1.5">
                                        <span>Move Item(s)</span>
                                        <span className="bg-cream px-2 py-0.5 rounded text-[10px] font-mono text-tan-dark border border-tan-light/20">Click & Drag</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-tan-light/10 pb-1.5">
                                        <span>Select Multiple</span>
                                        <span className="bg-cream px-2 py-0.5 rounded text-[10px] font-mono text-tan-dark border border-tan-light/20">Shift + Click</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-tan-light/10 pb-1.5">
                                        <span>Marquee Box Select</span>
                                        <span className="bg-cream px-2 py-0.5 rounded text-[10px] font-mono text-tan-dark border border-tan-light/20">Shift + Drag Grid</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-tan-light/10 pb-1.5">
                                        <span>Undo / Redo</span>
                                        <span className="bg-cream px-2 py-0.5 rounded text-[10px] font-mono text-tan-dark border border-tan-light/20">Ctrl + Z / Ctrl + Y</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span>Delete Selected</span>
                                        <span className="bg-cream px-2 py-0.5 rounded text-[10px] font-mono text-tan-dark border border-tan-light/20">Delete / Backspace</span>
                                    </div>
                                </div>
                            </div>

                            {/* Start Tour Button */}
                            <div className="pt-2 flex gap-3">
                                <button 
                                    onClick={() => {
                                        setShowHelpModal(false);
                                        if (isSAHSUser && !isEditMode) {
                                            handleEnterEditMode();
                                        }
                                        setTourStep(0);
                                    }}
                                    className="flex-1 bg-tan hover:bg-tan-dark text-white py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
                                >
                                    🚀 Take Interactive Tour
                                </button>
                                <button 
                                    onClick={() => setShowHelpModal(false)}
                                    className="bg-cream hover:bg-tan/10 text-charcoal border border-tan/30 px-6 py-2.5 rounded-lg text-sm font-bold transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
