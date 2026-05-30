import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, writeBatch, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { DocumentCard } from '../components/DocumentCard';
import { Search, Loader2, Check, Box, Plus, MapPin, Printer, ChevronLeft, Tag, X, AlertCircle, Trash2 } from 'lucide-react';
import type { MuseumLocation, ArchiveItem } from '../types/database';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

export function LocationDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [locationData, setLocationData] = useState<MuseumLocation | null>(null);
    const [parentLocation, setParentLocation] = useState<MuseumLocation | null>(null);
    const [childBoxes, setChildBoxes] = useState<MuseumLocation[]>([]);
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [nestedItems, setNestedItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const { isSAHSUser, user } = useAuth();

    // Print Options Modal State
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [printScope, setPrintScope] = useState<'direct' | 'all' | 'nested-boxes'>('direct');
    const [printFilter, setPrintFilter] = useState<'all' | 'no-qr'>('all');

    // Selection/Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ArchiveItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedItems, setSelectedItems] = useState<ArchiveItem[]>([]);
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [searchMode, setSearchMode] = useState<'keyword' | 'id'>('keyword');
    const [isLinking, setIsLinking] = useState(false);
    
    // Catalog State for Optimized Searching
    const [catalogItems, setCatalogItems] = useState<ArchiveItem[]>([]);
    const [hasFetchedCatalog, setHasFetchedCatalog] = useState(false);
    
    // Conflict State
    const [conflictedItems, setConflictedItems] = useState<ArchiveItem[]>([]);
    const [currentConflictIndex, setCurrentConflictIndex] = useState(-1);

    // Box Management State
    const [isAddBoxModalOpen, setIsAddBoxModalOpen] = useState(false);
    const [newBoxName, setNewBoxName] = useState('');
    const [newBoxId, setNewBoxId] = useState('');
    const [isSubmittingBox, setIsSubmittingBox] = useState(false);

    const [isMoveBoxModalOpen, setIsMoveBoxModalOpen] = useState(false);
    const [newParentShelfId, setNewParentShelfId] = useState('');
    const [availableShelves, setAvailableShelves] = useState<MuseumLocation[]>([]);
    const [isMovingBox, setIsMovingBox] = useState(false);

    // Bulk Relocate State
    const [isBulkSelectActive, setIsBulkSelectActive] = useState(false);
    const [bulkSelectedItems, setBulkSelectedItems] = useState<ArchiveItem[]>([]);
    const [isBulkRelocateModalOpen, setIsBulkRelocateModalOpen] = useState(false);
    const [allMuseumLocations, setAllMuseumLocations] = useState<MuseumLocation[]>([]);
    const [destLocationId, setDestLocationId] = useState('');
    const [destSearchQuery, setDestSearchQuery] = useState('');
    const [isRelocatingBulk, setIsRelocatingBulk] = useState(false);

    const fetchLocationAndItems = async () => {
        if (!id) return;
        setLoading(true);
        setChildBoxes([]);
        setParentLocation(null);
        setNestedItems([]);
        try {
            // Fetch location details
            const docRef = doc(db, 'locations', id);
            const docSnap = await getDoc(docRef);
            
            let locDocId = id;
            let currentLocData: MuseumLocation | null = null;
            
            if (docSnap.exists()) {
                currentLocData = { id: docSnap.id, docId: docSnap.id, ...docSnap.data() } as MuseumLocation;
                setLocationData(currentLocData);
            } else {
                const locQuery = query(collection(db, 'locations'), where('id', '==', id));
                const locSnap = await getDocs(locQuery);
                if (!locSnap.empty) {
                    locDocId = locSnap.docs[0].id;
                    currentLocData = { id: locSnap.docs[0].id, docId: locSnap.docs[0].id, ...locSnap.docs[0].data() } as MuseumLocation;
                    setLocationData(currentLocData);
                }
            }

            let childBoxesData: MuseumLocation[] = [];
            if (currentLocData) {
                if (currentLocData.parent_location_id) {
                    const parentRef = doc(db, 'locations', currentLocData.parent_location_id);
                    const parentSnap = await getDoc(parentRef);
                    if (parentSnap.exists()) {
                        setParentLocation({ id: parentSnap.id, docId: parentSnap.id, ...parentSnap.data() } as MuseumLocation);
                    }
                } else if (locDocId) {
                    const childQ = query(collection(db, 'locations'), where('parent_location_id', '==', locDocId));
                    const childSnap = await getDocs(childQ);
                    childBoxesData = childSnap.docs.map(d => ({ id: d.id, docId: d.id, ...d.data() } as MuseumLocation));
                    setChildBoxes(childBoxesData);
                }
            }

            // Fetch items at this location - support both legacy string and new array
            const q = query(
                collection(db, 'archive_items'), 
                where('museum_location_ids', 'array-contains', id)
            );

            // Also check legacy single-string location for backward compatibility
            const qLegacy = query(
                collection(db, 'archive_items'),
                where('museum_location_id', '==', id)
            );
            
            const [querySnapshot, legacySnapshot] = await Promise.all([
                getDocs(q),
                getDocs(qLegacy)
            ]);

            const itemsMap = new Map<string, ArchiveItem>();
            
            querySnapshot.docs.forEach(doc => {
                itemsMap.set(doc.id, { id: doc.id, ...doc.data() } as ArchiveItem);
            });
            legacySnapshot.docs.forEach(doc => {
                itemsMap.set(doc.id, { id: doc.id, ...doc.data() } as ArchiveItem);
            });

            const itemsData = Array.from(itemsMap.values());
            itemsData.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
            setItems(itemsData);

            // Fetch items for nested child boxes
            if (childBoxesData.length > 0) {
                const childItemPromises = childBoxesData.map(async (box) => {
                    const qBox = query(
                        collection(db, 'archive_items'),
                        where('museum_location_ids', 'array-contains', box.id)
                    );
                    const qBoxLegacy = query(
                        collection(db, 'archive_items'),
                        where('museum_location_id', '==', box.id)
                    );
                    const [snapBox, snapBoxLegacy] = await Promise.all([
                        getDocs(qBox),
                        getDocs(qBoxLegacy)
                    ]);
                    
                    const boxItemsMap = new Map<string, ArchiveItem>();
                    snapBox.docs.forEach(doc => {
                        boxItemsMap.set(doc.id, { id: doc.id, ...doc.data() } as ArchiveItem);
                    });
                    snapBoxLegacy.docs.forEach(doc => {
                        boxItemsMap.set(doc.id, { id: doc.id, ...doc.data() } as ArchiveItem);
                    });
                    return Array.from(boxItemsMap.values());
                });
                
                const resolvedChildItemsList = await Promise.all(childItemPromises);
                const combinedChildItems = resolvedChildItemsList.flat();
                
                // Remove duplicates
                const uniqueChildItemsMap = new Map<string, ArchiveItem>();
                combinedChildItems.forEach(item => {
                    uniqueChildItemsMap.set(item.id, item);
                });
                
                const sortedChildItems = Array.from(uniqueChildItemsMap.values()).sort(
                    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
                );
                setNestedItems(sortedChildItems);
            } else {
                setNestedItems([]);
            }
        } catch (error) {
            console.error("Error fetching location details:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLocationAndItems();
    }, [id]);

    // Fetch full catalog once when entering select mode
    useEffect(() => {
        if (isSelectMode && !hasFetchedCatalog) {
            const fetchCatalog = async () => {
                setIsSearching(true);
                try {
                    const q = query(collection(db, 'archive_items'));
                    const snap = await getDocs(q);
                    const catalog = snap.docs.map(d => ({ id: d.id, ...d.data() } as ArchiveItem));
                    setCatalogItems(catalog);
                    setHasFetchedCatalog(true);
                } catch (err) {
                    console.error("Error fetching catalog for search:", err);
                } finally {
                    setIsSearching(false);
                }
            };
            fetchCatalog();
        }
    }, [isSelectMode, hasFetchedCatalog]);

    // Search for items to add from local catalog
    useEffect(() => {
        const searchItems = () => {
            if (!searchQuery || searchQuery.length < 2) {
                setSearchResults([]);
                return;
            }
            if (!hasFetchedCatalog) return;

            setIsSearching(true);
            
            const filtered = catalogItems.filter(item => {
                const kw = searchQuery.toLowerCase();
                const artifactIdStr = String(item.artifact_id || '').toLowerCase();
                const identifierStr = String(item.identifier || '').toLowerCase();
                const idStr = String(item.id || '').toLowerCase();

                let matchesQuery = false;
                if (searchMode === 'keyword') {
                    matchesQuery = Boolean(
                        item.title?.toLowerCase().includes(kw) ||
                        item.description?.toLowerCase().includes(kw) ||
                        item.subject?.toLowerCase().includes(kw) ||
                        item.artifact_id?.toString().toLowerCase().includes(kw) ||
                        item.id?.toLowerCase().includes(kw) ||
                        item.identifier?.toLowerCase().includes(kw) ||
                        item.transcription?.toLowerCase().includes(kw) ||
                        item.creator?.toLowerCase().includes(kw) ||
                        item.full_name?.toLowerCase().includes(kw) ||
                        item.also_known_as?.toLowerCase().includes(kw) ||
                        item.birthplace?.toLowerCase().includes(kw) ||
                        item.occupation?.toLowerCase().includes(kw) ||
                        item.org_name?.toLowerCase().includes(kw) ||
                        item.alternative_names?.toLowerCase().includes(kw) ||
                        item.founding_date?.toLowerCase().includes(kw) ||
                        item.dissolved_date?.toLowerCase().includes(kw)
                    );
                } else {
                    // ID mode focuses ONLY on the numeric IDs and identifiers
                    matchesQuery = artifactIdStr.includes(kw) ||
                                   idStr.includes(kw) ||
                                   identifierStr.includes(kw);
                }
                
                // Exclude items already here
                const isAlreadyLinked = item.museum_location_id === id || (item.museum_location_ids || []).includes(id!);
                return matchesQuery && !isAlreadyLinked;
            });

            // Sort results to prioritize exact matches and prefix matches
            filtered.sort((a, b) => {
                const kw = searchQuery.toLowerCase();
                const aArtId = String(a.artifact_id || '').toLowerCase();
                const bArtId = String(b.artifact_id || '').toLowerCase();
                const aIdent = String(a.identifier || '').toLowerCase();
                const bIdent = String(b.identifier || '').toLowerCase();
                const aId = String(a.id || '').toLowerCase();
                const bId = String(b.id || '').toLowerCase();

                const getScore = (artId: string, ident: string, idVal: string) => {
                    // Exact matches (highest priority)
                    if (artId === kw) return 100;
                    if (ident === kw) return 90;
                    if (idVal === kw) return 80;
                    
                    // Prefix matches
                    if (artId.startsWith(kw)) return 70;
                    if (ident.startsWith(kw)) return 60;
                    if (idVal.startsWith(kw)) return 50;

                    // Contains matches
                    if (artId.includes(kw)) return 30;
                    if (ident.includes(kw)) return 20;
                    if (idVal.includes(kw)) return 10;
                    
                    return 0;
                };

                const scoreA = getScore(aArtId, aIdent, aId);
                const scoreB = getScore(bArtId, bIdent, bId);

                if (scoreB !== scoreA) {
                    return scoreB - scoreA;
                }

                // If scores are equal, sort numerically by artifact_id if possible
                const numA = parseInt(aArtId, 10);
                const numB = parseInt(bArtId, 10);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                
                // Fallback to alphabetical title
                return (a.title || '').localeCompare(b.title || '');
            });
            
            setSearchResults(filtered.slice(0, 100));
            setIsSearching(false);
        };

        const timer = setTimeout(searchItems, 200);
        return () => clearTimeout(timer);
    }, [searchQuery, id, searchMode, catalogItems, hasFetchedCatalog]);

    const toggleItemSelection = (item: ArchiveItem) => {
        setSelectedItems(prev => {
            const isSelected = prev.some(i => i.id === item.id);
            if (isSelected) {
                return prev.filter(i => i.id !== item.id);
            } else {
                return [...prev, item];
            }
        });
    };

    const handleLinkItems = async (forceResolution?: { itemId: string, mode: 'move' | 'both' }[]) => {
        if (selectedItems.length === 0 || !id) return;
        
        // 1. Check for conflicts if not already resolving
        if (!forceResolution) {
            const conflicts: ArchiveItem[] = [];
            const isMeaningful = (val: string | undefined | null) => {
                if (!val) return false;
                const trimmed = val.trim();
                return trimmed.length > 0 && 
                       trimmed.toLowerCase() !== 'unassigned' && 
                       trimmed.toLowerCase() !== 'none' &&
                       trimmed.toLowerCase() !== 'undefined' &&
                       trimmed.toLowerCase() !== 'null' &&
                       trimmed !== '""';
            };

            selectedItems.forEach(item => {
                // Focus ONLY on the formal NEW location system (IDs)
                const currentId = id || "";
                
                // 1. Singular formal assignment
                const itemFormalId = item.museum_location_id;
                const hasSingularConflict = isMeaningful(itemFormalId) && itemFormalId !== currentId;
                
                // 2. Plural formal assignments
                const hasPluralConflict = item.museum_location_ids?.some(lid => isMeaningful(lid) && lid !== currentId) || false;
                
                // NOTE: We deliberately ignore item.museum_location (legacy text) to avoid 
                // "ghost" conflicts from historical data.
                
                if (hasSingularConflict || hasPluralConflict) {
                    conflicts.push(item);
                }
            });

            if (conflicts.length > 0) {
                setConflictedItems(conflicts);
                setCurrentConflictIndex(0);
                return;
            }
        }

        setIsLinking(true);
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const adminEmail = user?.email || 'Admin';

            selectedItems.forEach(item => {
                const itemRef = doc(db, 'archive_items', item.id!);
                const resolution = forceResolution?.find(r => r.itemId === item.id);
                
                let newLocationIds: string[] = [];
                
                if (resolution?.mode === 'both') {
                    // Keep existing locations and add new one
                    const existing = item.museum_location_ids || [];
                    const legacy = item.museum_location_id;
                    newLocationIds = Array.from(new Set([...existing, ...(legacy ? [legacy] : []), id!]));
                } else {
                    // Move/Default: Set to ONLY this location
                    newLocationIds = [id!];
                }

                batch.update(itemRef, {
                    museum_location_ids: newLocationIds,
                    museum_location_id: id, // Still update legacy for safety
                    last_tagged_at: now,
                    last_tagged_by: adminEmail,
                    stage: 'Housed'
                });
            });

            await batch.commit();
            
            // Cleanup and refresh
            setSelectedItems([]);
            setSearchQuery('');
            setIsSelectMode(false);
            setConflictedItems([]);
            setCurrentConflictIndex(-1);
            await fetchLocationAndItems();
        } catch (error) {
            console.error("Error linking items:", error);
            alert("Failed to link items. Please check permissions.");
        } finally {
            setIsLinking(false);
        }
    };

    const handleRemoveItemFromLocation = async (e: React.MouseEvent, item: ArchiveItem) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!id || !isSAHSUser) return;
        
        const confirmMsg = `Remove "${item.title}" from this location? \n\n(The artifact will remain in the archive and can be reassigned later)`;
        if (!window.confirm(confirmMsg)) return;

        try {
            const itemRef = doc(db, 'archive_items', item.id!);
            const now = new Date().toISOString();
            const adminEmail = user?.email || 'Admin';

            // 1. Filter out the current location from IDs array
            const currentIds = item.museum_location_ids || [];
            const newIds = currentIds.filter(lid => lid !== id);

            // 2. Prepare update object
            const updates: any = {
                museum_location_ids: newIds,
                last_tagged_at: now,
                last_tagged_by: adminEmail
            };

            // 3. If legacy ID matches this one, clear it
            if (item.museum_location_id === id) {
                updates.museum_location_id = null;
            }

            // 4. Update stage to 'Unassigned' if this was the last location? 
            // Or maybe just leave it 'Housed' if it has other locations.
            if (newIds.length === 0) {
                updates.stage = 'Unassigned';
            }

            await updateDoc(itemRef, updates);

            // 5. Optimistic local update
            setItems(prev => prev.filter(i => i.id !== item.id));
            
            // Optional: Alert or subtle notification
        } catch (error) {
            console.error("Error removing item from location:", error);
            alert("Failed to remove item. Please check permissions.");
        }
    };

    const handleCreateBox = async () => {
        if (!newBoxName || !newBoxId || !locationData?.docId) return;
        setIsSubmittingBox(true);
        try {
            const boxIdSafe = newBoxId.toLowerCase().replace(/\s+/g, '-');
            const newLoc = {
                id: boxIdSafe,
                name: newBoxName,
                description: `Nested box inside ${locationData.name}`,
                room_id: locationData.room_id,
                parent_location_id: locationData.docId,
                created_at: new Date().toISOString()
            };
            const docRef = await addDoc(collection(db, 'locations'), newLoc);
            setChildBoxes(prev => [...prev, { docId: docRef.id, ...newLoc } as MuseumLocation]);
            setIsAddBoxModalOpen(false);
            setNewBoxName('');
            setNewBoxId('');
        } catch (err) {
            console.error(err);
            alert('Failed to create box');
        } finally {
            setIsSubmittingBox(false);
        }
    };

    const openMoveBoxModal = async () => {
        setIsMoveBoxModalOpen(true);
        if (availableShelves.length === 0) {
            try {
                const q = query(collection(db, 'locations'));
                const snap = await getDocs(q);
                const shelves = snap.docs
                    .map(d => ({ docId: d.id, ...d.data() } as MuseumLocation))
                    .filter(l => !l.parent_location_id && l.docId !== locationData?.docId);
                setAvailableShelves(shelves);
            } catch (err) {
                console.error("Failed to fetch shelves", err);
            }
        }
    };

    const handleRelocateBox = async () => {
        if (!newParentShelfId || !locationData?.docId) return;
        setIsMovingBox(true);
        try {
            const shelf = availableShelves.find(s => s.docId === newParentShelfId);
            await updateDoc(doc(db, 'locations', locationData.docId), {
                parent_location_id: newParentShelfId,
                room_id: shelf?.room_id || locationData.room_id
            });
            
            setParentLocation(shelf || null);
            setIsMoveBoxModalOpen(false);
        } catch (err) {
            console.error(err);
            alert('Failed to move box');
        } finally {
            setIsMovingBox(false);
        }
    };

    const handleDeleteBox = async () => {
        if (!locationData?.docId || !parentLocation) return;
        
        if (!window.confirm(`Are you sure you want to delete "${locationData.name}"?\n\nThe ${items.length} artifacts inside will NOT be deleted, but they will be unassigned from this physical location.`)) {
            return;
        }

        setIsMovingBox(true); // Reusing the loading state for convenience during the async operation
        try {
            // Unassign all items in this box
            if (items.length > 0) {
                const batch = writeBatch(db);
                const now = new Date().toISOString();
                const adminEmail = user?.email || 'Admin';

                items.forEach(item => {
                    const itemRef = doc(db, 'archive_items', item.id!);
                    const currentIds = item.museum_location_ids || [];
                    const newIds = currentIds.filter(lid => lid !== locationData.id && lid !== locationData.docId);
                    
                    const updates: any = {
                        museum_location_ids: newIds,
                        last_tagged_at: now,
                        last_tagged_by: adminEmail
                    };

                    if (item.museum_location_id === locationData.id || item.museum_location_id === locationData.docId) {
                        updates.museum_location_id = null;
                    }
                    if (newIds.length === 0) {
                        updates.stage = 'Unassigned';
                    }

                    batch.update(itemRef, updates);
                });
                
                await batch.commit();
            }

            // Delete the box
            await deleteDoc(doc(db, 'locations', locationData.docId));
            
            // Navigate back to parent shelf
            navigate(`/locations/${parentLocation.id || parentLocation.docId}`);
        } catch (error) {
            console.error("Error deleting box:", error);
            alert("Failed to delete box. Please check your permissions.");
        } finally {
            setIsMovingBox(false);
        }
    };

    const fetchMuseumLocations = async () => {
        try {
            const q = query(collection(db, 'locations'));
            const snap = await getDocs(q);
            const locs = snap.docs.map(d => ({ docId: d.id, ...d.data() } as MuseumLocation));
            const filtered = locs.filter(l => l.id !== id && l.docId !== locationData?.docId && l.id !== locationData?.id);
            filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setAllMuseumLocations(filtered);
        } catch (err) {
            console.error("Error fetching museum locations:", err);
        }
    };

    const handleBulkRelocate = async () => {
        if (bulkSelectedItems.length === 0 || !destLocationId || !locationData) return;
        setIsRelocatingBulk(true);
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const adminEmail = user?.email || 'Admin';

            bulkSelectedItems.forEach(item => {
                const itemRef = doc(db, 'archive_items', item.id!);
                const currentLocIds = item.museum_location_ids || [];
                // Filter out current location slug and docId
                const filteredLocIds = currentLocIds.filter(
                    lid => lid !== id && lid !== locationData.id && lid !== locationData.docId
                );
                // Add the new location slug
                const newLocIds = Array.from(new Set([...filteredLocIds, destLocationId]));

                batch.update(itemRef, {
                    museum_location_ids: newLocIds,
                    museum_location_id: destLocationId, // primary location
                    last_tagged_at: now,
                    last_tagged_by: adminEmail,
                    stage: 'Housed'
                });
            });

            await batch.commit();

            // Reset selection and relocate states
            setIsBulkSelectActive(false);
            setBulkSelectedItems([]);
            setIsBulkRelocateModalOpen(false);
            setDestLocationId("");
            setDestSearchQuery("");

            await fetchLocationAndItems();
        } catch (error) {
            console.error("Error performing bulk relocation:", error);
            alert("Failed to relocate items. Please check your permissions.");
        } finally {
            setIsRelocatingBulk(false);
        }
    };

    const toggleBulkSelection = (item: ArchiveItem) => {
        setBulkSelectedItems(prev => {
            const isSelected = prev.some(i => i.id === item.id);
            if (isSelected) {
                return prev.filter(i => i.id !== item.id);
            } else {
                return [...prev, item];
            }
        });
    };

    interface PrintableLabel {
        key: string;
        qrValue: string;
        title: string;
        subtitle: string;
    }

    const getLabelsToPrint = (): PrintableLabel[] => {
        if (printScope === 'nested-boxes') {
            return childBoxes.map(box => ({
                key: box.docId || box.id,
                qrValue: `loc:${box.id}`,
                title: box.name,
                subtitle: `Box ID: ${box.id}`
            }));
        }
        
        let list = [...items];
        if (printScope === 'all') {
            list = [...items, ...nestedItems];
        }
        
        if (printFilter === 'no-qr') {
            list = list.filter(item => !item.artifact_id || item.artifact_id.trim() === '');
        }
        
        return list.map(item => ({
            key: item.id || '',
            qrValue: `${window.location.hostname === 'localhost' ? 'https://sahs-archives.web.app' : window.location.origin}/items/${item.id}`,
            title: item.title,
            subtitle: item.artifact_id || item.id || ''
        }));
    };
    
    const labelsToPrint = getLabelsToPrint();

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading shelf details...</div>;
    }

    if (!locationData) {
        return (
            <div className="max-w-6xl mx-auto py-12 text-center">
                <h2 className="text-2xl font-serif text-charcoal mb-4">Location not found</h2>
                <Link to="/manage-locations" className="text-tan hover:text-charcoal transition-colors">
                    &larr; Back to Locations
                </Link>
            </div>
        );
    }

    return (
        <>
        {/* Conflict Resolution Modal */}
        {currentConflictIndex >= 0 && conflictedItems[currentConflictIndex] && (
            <div className="fixed inset-0 z-[2000] bg-charcoal/90 overflow-y-auto p-4 flex justify-center items-start sm:items-center">
                <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8 sm:my-auto">
                    <div className="bg-tan/10 p-8 border-b border-tan/20 text-center">
                        <div className="w-16 h-16 bg-tan/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <MapPin size={32} className="text-tan" />
                        </div>
                        <h2 className="text-2xl font-serif font-bold text-charcoal mb-2">Location Conflict</h2>
                        <p className="text-charcoal/60 text-sm italic">"{conflictedItems[currentConflictIndex].title}"</p>
                    </div>
                    
                    <div className="p-8">
                        <p className="text-charcoal/80 mb-6 leading-relaxed">
                            This artifact is currently listed in <span className="font-bold text-tan">{(conflictedItems[currentConflictIndex].museum_location_id || conflictedItems[currentConflictIndex].museum_location_ids?.[0] || conflictedItems[currentConflictIndex].museum_location)?.trim() || "an unspecified location"}</span>. 
                            How would you like to update its records?
                        </p>
                        
                        <div className="grid gap-3">
                            <button 
                                onClick={() => {
                                    // Default Move behavior by allowing the loop to proceed without 'both' flag
                                    if (currentConflictIndex + 1 < conflictedItems.length) {
                                        setCurrentConflictIndex(currentConflictIndex + 1);
                                    } else {
                                        handleLinkItems([]); // Proceed as default move
                                    }
                                }}
                                className="w-full py-4 px-6 bg-tan text-white rounded-xl font-bold hover:bg-charcoal transition-all shadow-md flex items-center justify-between group"
                            >
                                <span>Relocate to {locationData.name}</span>
                                <ChevronLeft size={18} className="rotate-180 opacity-40 group-hover:opacity-100" />
                            </button>
                            
                            <button 
                                onClick={() => {
                                    // Treat this item as 'both'
                                    // We need to track individual resolutions if multiple
                                    const resolutions = conflictedItems.map((item, idx) => ({
                                        itemId: item.id!,
                                        mode: idx === currentConflictIndex ? 'both' : 'move'
                                    } as { itemId: string, mode: 'move' | 'both' }));
                                    
                                    handleLinkItems(resolutions);
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
                                    setIsLinking(false);
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

        <div className="max-w-full mx-auto h-full flex flex-col animate-in fade-in duration-500 pb-16 print:hidden">
            {parentLocation ? (
                <Link to={`/locations/${parentLocation.id || parentLocation.docId}`} className="inline-flex items-center text-[10px] font-black text-tan uppercase tracking-[0.3em] mb-12 hover:text-charcoal transition-all group">
                    <ChevronLeft size={14} className="mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Parent Shelf ({parentLocation.name})
                </Link>
            ) : locationData.room_id ? (
                <Link to={`/manage-locations/rooms/${locationData.room_id}`} className="inline-flex items-center text-[10px] font-black text-tan uppercase tracking-[0.3em] mb-12 hover:text-charcoal transition-all group">
                    <ChevronLeft size={14} className="mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Wing
                </Link>
            ) : (
                <Link to="/manage-locations" className="inline-flex items-center text-[10px] font-black text-tan uppercase tracking-[0.3em] mb-12 hover:text-charcoal transition-all group">
                    <ChevronLeft size={14} className="mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Museum Wings
                </Link>
            )}

            <div className="bg-white rounded-[32px] md:rounded-[48px] border border-tan-light/20 overflow-hidden shadow-2xl shadow-tan/5 mb-10 md:mb-16 flex flex-col lg:flex-row relative">
                {/* Decorative Element */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-tan/5 rounded-bl-[200px] -mr-20 -mt-20 pointer-events-none" />
                
                <div className="lg:w-1/4 bg-tan-light/5 p-8 md:p-12 lg:p-16 flex flex-col items-center justify-center border-b lg:border-b-0 lg:border-r border-tan-light/10 gap-4">
                    <QRCodeDisplay 
                        value={`loc:${locationData.id}`} 
                        label={locationData.name} 
                        subLabel={parentLocation ? `Nested Box in ${parentLocation.name}` : "Museum Location Tag"}
                        size={120}
                    />
                </div>
                <div className="p-8 md:p-12 lg:p-16 flex-1 flex flex-col justify-center relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="h-px w-8 bg-tan/30" />
                        <span className="text-[10px] font-black text-tan uppercase tracking-[0.4em]">{parentLocation ? `Nested Box in ${parentLocation.name}` : `Display Location #${locationData.id}`}</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold mb-4 text-charcoal tracking-tight leading-[0.95]">
                        {locationData.name}
                    </h1>
                    <p className="text-charcoal/60 text-lg md:text-xl font-serif italic mb-6 max-w-3xl leading-relaxed">
                        {locationData.description || "A dedicated archive space within the museum wings."}
                    </p>
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-3 text-xs font-black text-charcoal/40 uppercase tracking-[0.2em]">
                            <Box size={20} className="text-tan" /> 
                            <span>{items.length} Artifacts Filed</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-serif font-bold text-charcoal tracking-tight flex items-center gap-3">
                    Items Housed Here
                    <span className="bg-tan/10 text-tan text-sm py-1 px-3 rounded-full font-sans">{items.length}</span>
                </h2>
                
                <div className="flex items-center gap-3">
                    {isSAHSUser && (
                        <div className="flex items-center gap-2">
                            {!parentLocation && (
                                <button 
                                    onClick={() => setIsAddBoxModalOpen(true)}
                                    className="flex items-center gap-2 px-5 py-3 rounded-lg font-bold transition-all shadow-sm w-full sm:w-auto justify-center bg-white border border-tan text-tan hover:bg-tan/5"
                                >
                                    <Box size={18} /> Add Nested Box
                                </button>
                            )}
                            {parentLocation && (
                                <>
                                    <button 
                                        onClick={handleDeleteBox}
                                        disabled={isMovingBox}
                                        className="flex items-center gap-2 px-4 py-3 rounded-lg font-bold transition-all shadow-sm justify-center bg-red-50 border border-red-200 text-red-600 hover:bg-red-100"
                                        title="Delete Box"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                    <button 
                                        onClick={openMoveBoxModal}
                                        className="flex items-center gap-2 px-5 py-3 rounded-lg font-bold transition-all shadow-sm w-full sm:w-auto justify-center bg-white border border-tan text-tan hover:bg-tan/5"
                                        title="Relocate Box"
                                    >
                                        <MapPin size={18} /> Relocate Box
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    {isSAHSUser && items.length > 0 && !isSelectMode && (
                        <button 
                            onClick={() => {
                                setIsBulkSelectActive(!isBulkSelectActive);
                                if (!isBulkSelectActive) {
                                    fetchMuseumLocations();
                                } else {
                                    setBulkSelectedItems([]);
                                }
                            }}
                            className={`flex items-center gap-2 px-5 py-3 rounded-lg font-bold transition-all shadow-sm w-full sm:w-auto justify-center ${
                                isBulkSelectActive ? 'bg-tan text-white shadow-lg' : 'bg-white border border-tan text-tan hover:bg-tan/5'
                            }`}
                        >
                            {isBulkSelectActive ? <X size={18} /> : <Check size={18} />}
                            {isBulkSelectActive ? 'Cancel Selection' : 'Bulk Relocate'}
                        </button>
                    )}
                    {isSAHSUser && (
                        <button 
                            onClick={() => setIsSelectMode(!isSelectMode)}
                            disabled={isBulkSelectActive}
                            className={`flex items-center gap-2 px-5 py-3 rounded-lg font-bold transition-all shadow-sm w-full sm:w-auto justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                isSelectMode ? 'bg-charcoal text-white' : 'bg-white border border-tan text-tan hover:bg-tan/5'
                            }`}
                        >
                            {isSelectMode ? <X size={18} /> : <Plus size={18} />}
                            {isSelectMode ? 'Close' : 'Add Artifacts'}
                        </button>
                    )}
                    <Link 
                        to={`/interactive-map?highlight=${parentLocation ? (parentLocation.id || parentLocation.docId) : id}`}
                        className="flex items-center gap-2 bg-charcoal text-white px-5 py-3 rounded-lg font-bold hover:bg-tan transition-colors shadow-sm w-full sm:w-auto justify-center"
                    >
                        <MapPin size={18} /> View on Blueprint
                    </Link>
                    {(items.length > 0 || nestedItems.length > 0) && !isSelectMode && (
                        <button 
                            onClick={() => setIsPrintModalOpen(true)}
                            className="flex items-center gap-2 bg-tan text-white px-5 py-3 rounded-lg font-bold hover:bg-charcoal transition-colors shadow-sm w-full sm:w-auto justify-center"
                        >
                            <Printer size={18} /> Print Labels
                        </button>
                    )}
                </div>
            </div>

            {/* Add Items Interface */}
            {isSelectMode && (
                <div className="bg-white border border-tan-light/20 rounded-[32px] md:rounded-[48px] p-8 md:p-12 mb-12 md:mb-20 animate-in slide-in-from-top-8 duration-500 shadow-2xl shadow-tan/5">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1">
                             <h3 className="text-xl font-serif font-bold text-charcoal mb-4 flex items-center gap-2">
                                <Search size={20} className="text-tan" />
                                Link Artifacts to this Shelf
                            </h3>

                            {/* Search Tab Switcher */}
                            <div className="flex bg-tan/5 p-1.5 rounded-xl border border-tan-light/30 mb-5 gap-1 shadow-inner max-w-sm">
                                <button 
                                    onClick={() => { setSearchMode('keyword'); setSearchQuery(''); }}
                                    className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                        searchMode === 'keyword' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/40 hover:text-charcoal/60'
                                    }`}
                                >
                                    <Search size={16} /> Keyword Search
                                </button>
                                <button 
                                    onClick={() => { setSearchMode('id'); setSearchQuery(''); }}
                                    className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                        searchMode === 'id' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/40 hover:text-charcoal/60'
                                    }`}
                                >
                                    <Tag size={16} /> ID Number Search
                                </button>
                            </div>

                            <div className="relative">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-charcoal/20" size={20} />
                                <input 
                                    type="text"
                                    placeholder={searchMode === 'keyword' ? "Search by title or description..." : "Enter Catalog ID # (e.g. 1905)"}
                                    className="w-full bg-white pl-14 pr-4 py-5 rounded-2xl border-2 border-tan-light/50 focus:border-tan outline-none transition-all shadow-md text-xl font-serif placeholder:font-serif placeholder:text-charcoal/20"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div className="mt-6 space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {isSearching ? (
                                    <div className="flex items-center justify-center py-8 text-charcoal/40 gap-2">
                                        <Loader2 className="animate-spin" size={18} />
                                        Searching items...
                                    </div>
                                ) : searchResults.length > 0 ? (
                                    searchResults.map(result => (
                                        <div 
                                            key={result.id}
                                            onClick={() => toggleItemSelection(result)}
                                            className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                                                selectedItems.some(i => i.id === result.id) 
                                                    ? 'bg-tan/10 border-tan shadow-sm' 
                                                    : 'bg-white border-tan-light/30 hover:border-tan/50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-lg bg-tan-light/10 flex items-center justify-center overflow-hidden shrink-0 border border-tan-light/20">
                                                    {result.file_urls?.[0] ? (
                                                        <img src={result.file_urls[0]} alt={result.title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Box size={20} className="text-tan/30" />
                                                    )}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-charcoal group-hover:text-tan transition-colors">{result.title}</h4>
                                                    <div className="flex items-center gap-2 text-[11px] font-mono font-bold text-charcoal/40 uppercase">
                                                        <span className="bg-tan/10 text-tan px-1.5 py-0.5 rounded">ID: {result.artifact_id || 'NO-ID'}</span>
                                                        <span>&bull;</span>
                                                        <span>{result.item_type}</span>
                                                        {result.museum_location_id?.trim() && (
                                                            <>
                                                                <span className="text-red-400">&bull; Currently at: {result.museum_location_id}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                                                selectedItems.some(i => i.id === result.id) ? 'bg-tan border-tan text-white' : 'border-tan-light group-hover:border-tan'
                                            }`}>
                                                {selectedItems.some(i => i.id === result.id) && <Check size={14} strokeWidth={3} />}
                                            </div>
                                        </div>
                                    ))
                                ) : searchQuery.length >= 2 ? (
                                    <div className="text-center py-8 text-charcoal/40 italic">No items found matching "{searchQuery}"</div>
                                ) : (
                                    <div className="text-center py-8 text-charcoal/30 flex flex-col items-center gap-2">
                                        <AlertCircle size={24} className="opacity-20" />
                                        <p className="text-sm font-sans">Enter at least 2 characters to search the archive.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="md:w-72 bg-white/50 border border-tan-light/30 rounded-xl p-6 flex flex-col">
                            <h3 className="font-serif font-bold text-charcoal mb-4 flex items-center gap-2">
                                <Check size={18} className="text-tan" />
                                Selection
                            </h3>
                            <div className="flex-1 text-sm text-charcoal/60 mb-6">
                                {selectedItems.length === 0 ? (
                                    <p className="italic">No items selected yet. Click an item to select it for this shelf.</p>
                                ) : (
                                    <div className="space-y-4">
                                        <p className="text-lg font-bold text-tan">{selectedItems.length} Items Selected</p>
                                        <div className="bg-tan/5 p-3 rounded-lg border border-tan/20">
                                            <p className="text-xs leading-relaxed">
                                                These artifacts will be reassigned to:
                                                <span className="block font-bold text-charcoal mt-1">{locationData.name}</span>
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => handleLinkItems()}
                                disabled={selectedItems.length === 0 || isLinking}
                                className="w-full bg-tan text-white py-4 rounded-xl font-bold hover:bg-charcoal transition-all shadow-md disabled:bg-charcoal/20 disabled:shadow-none flex items-center justify-center gap-3"
                            >
                                {isLinking ? (
                                    <>
                                        <Loader2 className="animate-spin" size={20} />
                                        Linking...
                                    </>
                                ) : (
                                    <>
                                        Link to this Location
                                        <Check size={20} />
                                    </>
                                )}
                            </button>
                            {selectedItems.length > 0 && (
                                <button 
                                    onClick={() => setSelectedItems([])}
                                    className="mt-3 text-[10px] font-black uppercase tracking-widest text-charcoal/40 hover:text-red-500 transition-colors mx-auto"
                                >
                                    Clear All
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Box Modal */}
            {isAddBoxModalOpen && (
                <div className="fixed inset-0 z-[2000] bg-charcoal/90 overflow-y-auto p-4 flex justify-center items-start sm:items-center">
                    <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-8 my-8 sm:my-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2">
                                <Box className="text-tan" size={24}/> Add Nested Box
                            </h2>
                            <button onClick={() => setIsAddBoxModalOpen(false)} className="text-charcoal/40 hover:text-charcoal"><X size={24}/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-charcoal/40 uppercase tracking-widest mb-2">Box Name</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Box 14"
                                    value={newBoxName}
                                    onChange={e => setNewBoxName(e.target.value)}
                                    className="w-full bg-cream px-4 py-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-tan/30 transition-all font-sans"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-charcoal/40 uppercase tracking-widest mb-2">Unique ID (Slug)</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. box-14"
                                    value={newBoxId}
                                    onChange={e => setNewBoxId(e.target.value)}
                                    className="w-full bg-cream px-4 py-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-tan/30 transition-all font-sans"
                                />
                            </div>
                            <button 
                                onClick={handleCreateBox}
                                disabled={isSubmittingBox || !newBoxName || !newBoxId}
                                className="w-full bg-tan text-white py-3 rounded-xl font-bold shadow-lg shadow-tan/20 hover:bg-charcoal transition-all disabled:opacity-50 mt-4"
                            >
                                {isSubmittingBox ? 'Creating...' : 'Create Box'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Move Box Modal */}
            {isMoveBoxModalOpen && (
                <div className="fixed inset-0 z-[2000] bg-charcoal/90 overflow-y-auto p-4 flex justify-center items-start sm:items-center">
                    <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-8 my-8 sm:my-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2">
                                <MapPin className="text-tan" size={24}/> Relocate Box
                            </h2>
                            <button onClick={() => setIsMoveBoxModalOpen(false)} className="text-charcoal/40 hover:text-charcoal"><X size={24}/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-charcoal/40 uppercase tracking-widest mb-2">Destination Shelf</label>
                                <select 
                                    value={newParentShelfId} 
                                    onChange={e => setNewParentShelfId(e.target.value)}
                                    className="w-full bg-cream px-4 py-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-tan/30 transition-all font-sans text-sm"
                                >
                                    <option value="">-- Select a Shelf --</option>
                                    {availableShelves.map(l => (
                                        <option key={l.docId} value={l.docId}>{l.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button 
                                onClick={handleRelocateBox}
                                disabled={isMovingBox || !newParentShelfId}
                                className="w-full bg-tan text-white py-3 rounded-xl font-bold shadow-lg shadow-tan/20 hover:bg-charcoal transition-all disabled:opacity-50 mt-4"
                            >
                                {isMovingBox ? 'Moving...' : 'Move Box & Artifacts'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {childBoxes.length > 0 && (
                <div className="mb-12">
                    <h2 className="text-xl font-serif font-bold text-charcoal tracking-tight flex items-center gap-3 mb-6">
                        Nested Boxes
                        <span className="bg-tan/10 text-tan text-sm py-1 px-3 rounded-full font-sans">{childBoxes.length}</span>
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {childBoxes.map(box => (
                            <Link 
                                key={box.docId}
                                to={`/locations/${box.id || box.docId}`}
                                className="bg-white border border-tan-light/50 rounded-2xl p-4 hover:shadow-lg hover:border-tan/30 transition-all group"
                            >
                                <div className="w-10 h-10 bg-tan/10 rounded-xl flex items-center justify-center text-tan mb-3 group-hover:scale-110 transition-transform">
                                    <Box size={20} />
                                </div>
                                <h3 className="font-bold text-charcoal text-sm leading-tight">{box.name}</h3>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-1">
                {items.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 auto-rows-max">
                        {items.map(item => {
                            const isSelected = bulkSelectedItems.some(i => i.id === item.id);
                            return (
                                <div key={item.id} className="relative group/bulk">
                                    <DocumentCard 
                                        item={item} 
                                        galleryIds={items.map(i => i.id || '')} 
                                        onRemove={(e) => handleRemoveItemFromLocation(e, item)}
                                    />
                                    {isBulkSelectActive && (
                                        <div 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                toggleBulkSelection(item);
                                            }}
                                            className={`absolute inset-0 z-30 rounded-2xl cursor-pointer transition-all duration-300 ${
                                                isSelected 
                                                    ? 'bg-tan/10 border-4 border-tan shadow-[0_0_15px_rgba(210,180,140,0.4)]' 
                                                    : 'bg-black/5 hover:bg-black/10 border-2 border-transparent'
                                            }`}
                                        >
                                            <div className={`absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shadow-md ${
                                                isSelected 
                                                    ? 'bg-tan border-tan text-white scale-110' 
                                                    : 'bg-white/80 backdrop-blur-sm border-white text-transparent group-hover/bulk:border-tan/50'
                                            }`}>
                                                <Check size={18} strokeWidth={3} className={isSelected ? 'block' : 'hidden group-hover/bulk:block group-hover/bulk:text-tan/50'} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-cream/30 rounded-xl border border-tan-light/50 shadow-sm">
                        <Box size={48} className="mx-auto text-tan/30 mb-4" />
                        <p className="text-charcoal-light text-xl font-serif mb-2 text-charcoal/70">Shelf is empty.</p>
                        <p className="text-charcoal-light/60 font-sans max-w-md mx-auto">There are currently no artifacts registered to this physical location.</p>
                    </div>
                )}
            </div>
        </div>
        
        {/* Batch Print Configuration Modal */}
        {isPrintModalOpen && (
            <div className="fixed inset-0 z-[2000] bg-charcoal/90 overflow-y-auto p-4 flex justify-center items-start sm:items-center print:hidden animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8 sm:my-auto">
                    <div className="bg-tan/10 p-8 border-b border-tan/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Printer className="text-tan" size={28} />
                            <div>
                                <h2 className="text-2xl font-serif font-bold text-charcoal">Batch Print Configuration</h2>
                                <p className="text-xs text-charcoal/50 font-sans mt-0.5">Select scope and filtering options for physical asset tags.</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setIsPrintModalOpen(false)} 
                            className="text-charcoal/40 hover:text-charcoal hover:bg-black/5 p-2 rounded-full transition-all"
                        >
                            <X size={24} />
                        </button>
                    </div>
                    
                    <div className="p-8 space-y-6">
                        {/* Scope Selector */}
                        {childBoxes.length > 0 && (
                            <div className="space-y-3">
                                <label className="block text-xs font-black text-charcoal/40 uppercase tracking-widest">Print Scope / Selection</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPrintScope('direct')}
                                        className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col justify-between h-28 ${
                                            printScope === 'direct' 
                                                ? 'bg-tan/10 border-tan shadow-sm' 
                                                : 'bg-white border-tan-light/30 hover:border-tan/50'
                                        }`}
                                    >
                                        <span className="font-bold text-xs text-charcoal leading-tight">Shelf Items</span>
                                        <span className="text-[10px] text-charcoal/50 leading-tight">Print the {items.length} items housed directly on this shelf.</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPrintScope('all')}
                                        className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col justify-between h-28 ${
                                            printScope === 'all' 
                                                ? 'bg-tan/10 border-tan shadow-sm' 
                                                : 'bg-white border-tan-light/30 hover:border-tan/50'
                                        }`}
                                    >
                                        <span className="font-bold text-xs text-charcoal leading-tight flex items-center justify-between">
                                            Everything
                                            <span className="bg-tan/20 text-tan text-[9px] font-bold py-0.5 px-1 rounded-full">Items</span>
                                        </span>
                                        <span className="text-[10px] text-charcoal/50 leading-tight">All items on shelf + {nestedItems.length} items inside nested boxes.</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPrintScope('nested-boxes')}
                                        className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col justify-between h-28 ${
                                            printScope === 'nested-boxes' 
                                                ? 'bg-tan/10 border-tan shadow-sm' 
                                                : 'bg-white border-tan-light/30 hover:border-tan/50'
                                        }`}
                                    >
                                        <span className="font-bold text-xs text-charcoal leading-tight flex items-center justify-between">
                                            Box Tags
                                            <span className="bg-blue-100 text-blue-700 text-[9px] font-bold py-0.5 px-1 rounded-full">Boxes</span>
                                        </span>
                                        <span className="text-[10px] text-charcoal/50 leading-tight">Print physical QR codes for the {childBoxes.length} boxes themselves.</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Filter Selector - Only show if not printing Box Tags */}
                        {printScope !== 'nested-boxes' && (
                            <div className="space-y-3">
                                <label className="block text-xs font-black text-charcoal/40 uppercase tracking-widest">Item Filtering</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPrintFilter('all')}
                                        className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between h-24 ${
                                            printFilter === 'all' 
                                                ? 'bg-tan/10 border-tan shadow-sm' 
                                                : 'bg-white border-tan-light/30 hover:border-tan/50'
                                        }`}
                                    >
                                        <span className="font-bold text-sm text-charcoal">All Items</span>
                                        <span className="text-xs text-charcoal/50 leading-tight">Print QR codes for every item in the selected scope.</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPrintFilter('no-qr')}
                                        className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between h-24 ${
                                            printFilter === 'no-qr' 
                                                ? 'bg-tan/10 border-tan shadow-sm' 
                                                : 'bg-white border-tan-light/30 hover:border-tan/50'
                                        }`}
                                    >
                                        <span className="font-bold text-sm text-charcoal">Unlabeled Only</span>
                                        <span className="text-xs text-charcoal/50 leading-tight">Only print items that do not have a Catalog ID / QR Code assigned.</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Summary Card */}
                        <div className="bg-cream/40 border border-tan-light/30 rounded-2xl p-4 flex items-center justify-between text-charcoal">
                            <div className="text-sm">
                                <p className="font-bold">Summary</p>
                                <p className="text-xs text-charcoal/60 mt-0.5">
                                    Scope: <span className="font-semibold text-charcoal">
                                        {printScope === 'nested-boxes' ? 'Physical Box Tags' : printScope === 'all' ? 'Everything (including nested boxes)' : 'Shelf items only'}
                                    </span>
                                    {printScope !== 'nested-boxes' && (
                                        <>
                                            <br />
                                            Filter: <span className="font-semibold text-charcoal">{printFilter === 'no-qr' ? 'Unlabeled items only' : 'All items'}</span>
                                        </>
                                    )}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-3xl font-serif font-black text-tan">{labelsToPrint.length}</span>
                                <span className="block text-[10px] uppercase font-bold text-charcoal/40 tracking-wider">Labels</span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-4 border-t border-tan-light/20">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsPrintModalOpen(false);
                                    setTimeout(() => {
                                        window.print();
                                    }, 100);
                                }}
                                disabled={labelsToPrint.length === 0}
                                className="flex-1 flex items-center justify-center gap-2 bg-tan text-white py-4 rounded-xl font-bold hover:bg-charcoal transition-all shadow-md disabled:bg-charcoal/20 disabled:shadow-none"
                            >
                                <Printer size={20} /> Print {labelsToPrint.length} Label{labelsToPrint.length !== 1 ? 's' : ''}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsPrintModalOpen(false)}
                                className="px-6 py-4 bg-white border border-tan-light text-charcoal hover:bg-cream rounded-xl font-bold transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Floating Bulk Action Bar */}
        {isBulkSelectActive && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-2rem)] max-w-lg bg-white/80 backdrop-blur-xl border border-tan-light/30 rounded-2xl py-4 px-6 shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center justify-between gap-4 animate-in slide-in-from-bottom-8 duration-300 print:hidden">
                <div className="flex flex-col">
                    <span className="text-xs font-black uppercase text-tan tracking-wider">Bulk Relocate</span>
                    <span className="text-sm font-bold text-charcoal">
                        {bulkSelectedItems.length === 0 
                            ? 'Select items in the grid' 
                            : `Selected ${bulkSelectedItems.length} Artifact${bulkSelectedItems.length === 1 ? '' : 's'}`
                        }
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            setIsBulkSelectActive(false);
                            setBulkSelectedItems([]);
                        }}
                        className="px-4 py-2 text-xs font-bold text-charcoal/50 hover:text-charcoal transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => setIsBulkRelocateModalOpen(true)}
                        disabled={bulkSelectedItems.length === 0}
                        className="bg-tan hover:bg-charcoal text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-md disabled:bg-charcoal/10 disabled:text-charcoal/30 disabled:shadow-none flex items-center gap-1.5"
                    >
                        <MapPin size={14} />
                        Relocate Group
                    </button>
                </div>
            </div>
        )}

        {/* Searchable Target Location Selector Modal */}
        {isBulkRelocateModalOpen && (
            <div className="fixed inset-0 z-[2000] bg-charcoal/90 overflow-y-auto p-4 flex justify-center items-start sm:items-center print:hidden animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8 sm:my-auto">
                    <div className="bg-tan/10 p-6 md:p-8 border-b border-tan/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-tan/20 rounded-xl flex items-center justify-center">
                                <MapPin size={22} className="text-tan" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-serif font-bold text-charcoal">Choose Destination</h2>
                                <p className="text-xs text-charcoal/50 font-sans mt-0.5">Where would you like to relocate {bulkSelectedItems.length} artifact{bulkSelectedItems.length === 1 ? '' : 's'}?</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                setIsBulkRelocateModalOpen(false);
                                setDestLocationId("");
                                setDestSearchQuery("");
                            }} 
                            className="text-charcoal/40 hover:text-charcoal hover:bg-black/5 p-2 rounded-full transition-all"
                        >
                            <X size={24} />
                        </button>
                    </div>
                    
                    <div className="p-6 md:p-8 space-y-6">
                        {/* Search Input */}
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/30" size={18} />
                            <input 
                                type="text" 
                                placeholder="Search shelves or boxes..."
                                value={destSearchQuery}
                                onChange={e => setDestSearchQuery(e.target.value)}
                                className="w-full bg-cream/50 pl-11 pr-4 py-3.5 rounded-xl border border-tan-light/50 focus:border-tan outline-none transition-all font-sans text-sm"
                                autoFocus
                            />
                        </div>

                        {/* Locations List */}
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {allMuseumLocations.filter(loc => {
                                if (!destSearchQuery) return true;
                                const q = destSearchQuery.toLowerCase();
                                return loc.name.toLowerCase().includes(q) || 
                                       loc.id.toLowerCase().includes(q) || 
                                       (loc.description && loc.description.toLowerCase().includes(q));
                            }).length > 0 ? (
                                allMuseumLocations.filter(loc => {
                                    if (!destSearchQuery) return true;
                                    const q = destSearchQuery.toLowerCase();
                                    return loc.name.toLowerCase().includes(q) || 
                                           loc.id.toLowerCase().includes(q) || 
                                           (loc.description && loc.description.toLowerCase().includes(q));
                                }).map(loc => {
                                    const isSelected = destLocationId === loc.id;
                                    return (
                                        <div 
                                            key={loc.docId}
                                            onClick={() => setDestLocationId(loc.id)}
                                            className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                                                isSelected 
                                                    ? 'bg-tan/10 border-tan shadow-sm' 
                                                    : 'bg-white border-tan-light/20 hover:border-tan/30'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                                                    isSelected ? 'bg-tan/20 border-tan/30 text-tan' : 'bg-charcoal/5 border-charcoal/10 text-charcoal/40 group-hover:text-tan transition-colors'
                                                }`}>
                                                    {loc.parent_location_id ? <Box size={16} /> : <MapPin size={16} />}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-charcoal text-sm group-hover:text-tan transition-colors">{loc.name}</h4>
                                                    <p className="text-[11px] text-charcoal/40 font-sans leading-none mt-1">
                                                        {loc.parent_location_id ? 'Nested Box' : 'Display Shelf'} &bull; Slug: {loc.id}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                                                isSelected ? 'bg-tan border-tan text-white' : 'border-tan-light group-hover:border-tan'
                                            }`}>
                                                {isSelected && <Check size={12} strokeWidth={3} />}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-8 text-charcoal/40 italic">No locations found.</div>
                            )}
                        </div>

                        {/* Summary & Confirm */}
                        <div className="flex gap-3 pt-4 border-t border-tan-light/20">
                            <button
                                onClick={handleBulkRelocate}
                                disabled={!destLocationId || isRelocatingBulk}
                                className="flex-1 flex items-center justify-center gap-2 bg-tan text-white py-4 rounded-xl font-bold hover:bg-charcoal transition-all shadow-md disabled:bg-charcoal/20 disabled:shadow-none"
                            >
                                {isRelocatingBulk ? (
                                    <>
                                        <Loader2 className="animate-spin" size={18} />
                                        Relocating...
                                    </>
                                ) : (
                                    <>
                                        Confirm Relocation
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setIsBulkRelocateModalOpen(false);
                                    setDestLocationId("");
                                    setDestSearchQuery("");
                                }}
                                className="px-6 py-4 bg-white border border-tan-light text-charcoal hover:bg-cream rounded-xl font-bold transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        
        {/* Dedicated Print Layout - Purely optimized for paper density */}
        <div className="hidden print:block w-full bg-white text-black bg-none">
            <div className="mb-6 border-b border-black pb-4 text-center">
                <h1 className="text-2xl font-bold font-serif m-0">
                    {locationData.name} {printScope === 'all' ? '(With Nested Boxes)' : printScope === 'nested-boxes' ? '(Nested Box Tags)' : ''} - Asset Tags
                </h1>
                <p className="text-sm m-0 text-gray-500">
                    Inventory Label Sheet &bull; Scope: {printScope === 'all' ? 'Everything' : printScope === 'nested-boxes' ? 'Nested Box Tags' : 'Shelf Only'} &bull; Filter: {printScope === 'nested-boxes' ? 'N/A' : printFilter === 'no-qr' ? 'Unlabeled Only' : 'All'} &bull; Generated {new Date().toLocaleDateString()}
                </p>
            </div>
            
            {/* Grid layout ensuring ~1.5 inch squares fit tightly across paper width */}
            <div className="flex flex-wrap gap-[0.2in] justify-center items-center text-center">
                {labelsToPrint.map(label => (
                    <div key={label.key} className="flex flex-col items-center justify-center p-2 border border-gray-400 w-[1.5in] h-[1.5in] bg-white break-inside-avoid">
                        <QRCodeSVG 
                            value={label.qrValue} 
                            size={96} // Exactly 1 inch optical scale on 96dpi output
                            level="L"
                            includeMargin={false}
                        />
                        <span className="text-[10px] font-bold mt-[0.1in] truncate w-full px-1">{label.title}</span>
                        <span className="text-[8px] mt-0.5 text-gray-600 font-mono tracking-tighter truncate w-full px-1">{label.subtitle}</span>
                    </div>
                ))}
            </div>
        </div>
        </>
    );
}
