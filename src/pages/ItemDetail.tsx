import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, BookOpen, Edit2, Trash2, FileText, ZoomIn, ZoomOut, X, MapPin, Info, Users, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Box, Lock, Maximize2, Camera } from 'lucide-react';
import { useState, useEffect } from 'react';
import { DocumentCard } from '../components/DocumentCard';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, getDocs, deleteDoc, where, documentId, updateDoc, or } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { ArchiveItem, MuseumLocation } from '../types/database';
import { ArchiveMap } from '../components/ArchiveMap';

export function ItemDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { isSAHSUser, user } = useAuth();

    const galleryIds = (location.state?.galleryIds as string[]) || [];
    const currentIndex = galleryIds.indexOf(id || '');
    const prevId = currentIndex > 0 ? galleryIds[currentIndex - 1] : undefined;
    const nextId = currentIndex >= 0 && currentIndex < galleryIds.length - 1 ? galleryIds[currentIndex + 1] : undefined;

    const [item, setItem] = useState<ArchiveItem | null>(null);
    const [relatedFigureItems, setRelatedFigureItems] = useState<ArchiveItem[]>([]);
    const [relatedDocumentItems, setRelatedDocumentItems] = useState<ArchiveItem[]>([]);
    const [relatedOrganizationItems, setRelatedOrganizationItems] = useState<ArchiveItem[]>([]);
    const [exploreItems, setExploreItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [zoomScale, setZoomScale] = useState(1);
    const [collectionsData, setCollectionsData] = useState<{id: string, title: string, is_private?: boolean}[]>([]);
    const [isCollectionPrivate, setIsCollectionPrivate] = useState(false);
    const [showAdvancedDC, setShowAdvancedDC] = useState(false);
    const [showLinkedItems, setShowLinkedItems] = useState(false);

    // Inline Location Editing State
    const [isEditingLocation, setIsEditingLocation] = useState(false);
    const [allLocations, setAllLocations] = useState<MuseumLocation[]>([]);
    const [newLocationId, setNewLocationId] = useState('');
    const [isSavingLocation, setIsSavingLocation] = useState(false);

    const handleEditLocationClick = async () => {
        setIsEditingLocation(true);
        setNewLocationId(item?.museum_location_id || '');
        if (allLocations.length === 0) {
            try {
                const locSnap = await getDocs(collection(db, 'locations'));
                setAllLocations(locSnap.docs.map(d => ({ id: d.id, ...d.data() } as MuseumLocation)));
            } catch (err) { console.error("Could not fetch locations", err); }
        }
    };

    const handleSaveLocation = async () => {
        if (!item) return;
        setIsSavingLocation(true);
        try {
            await updateDoc(doc(db, 'archive_items', id!), {
                museum_location_id: newLocationId || null,
                museum_location_ids: newLocationId ? [newLocationId] : [],
                last_tagged_at: new Date().toISOString(),
                last_tagged_by: user?.email || 'Admin',
                stage: newLocationId ? 'Housed' : 'Archived'
            });
            
            setIsEditingLocation(false);
        } catch (error) {
            console.error("Failed to update location inline:", error);
            alert("Failed to update location. Insufficient permissions or network error.");
        } finally {
            setIsSavingLocation(false);
        }
    };

    useEffect(() => {
        if (item && item.file_urls && item.featured_image_url) {
            const index = item.file_urls.indexOf(item.featured_image_url);
            if (index !== -1) {
                setCurrentImageIndex(index);
            }
        }
    }, [item]);

    useEffect(() => {
        const fetchItemAndRelated = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'archive_items', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...(docSnap.data() || {}) } as ArchiveItem;
                    setItem(data);

                    const cIds = data.collection_ids || (data.collection_id ? [data.collection_id] : []);
                    if (cIds.length > 0) {
                        try {
                            const colls = [];
                            for (const cid of cIds) {
                                const collRef = doc(db, 'collections', cid);
                                const collSnap = await getDoc(collRef);
                                if (collSnap.exists()) {
                                    colls.push({ id: collSnap.id, ...collSnap.data() } as any);
                                }
                            }
                            setCollectionsData(colls);
                            setIsCollectionPrivate(colls.some(c => c.is_private === true));
                        } catch (err) {
                            console.error("Error fetching collection details:", err);
                        }
                    }



                    // 1) Forward explicit references defined on THIS item
                    const fetchForward = async (ids: string[] | undefined) => {
                        if (!ids || ids.length === 0) return [];
                        // Firestore 'in' has a 30 item limit
                        const chunkedIds = ids.slice(0, 30);
                        const q = query(collection(db, 'archive_items'), where(documentId(), 'in', chunkedIds));
                        const snap = await getDocs(q);
                        let results = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ArchiveItem[];
                        
                        // Filter private items for non-SAHS users
                        if (!isSAHSUser) {
                            results = results.filter(i => !i.is_private);
                        }
                        return results;
                    };

                    const [forwardFigures, forwardDocs, forwardOrgs] = await Promise.all([
                        fetchForward(data.related_figures),
                        fetchForward(data.related_documents),
                        fetchForward(data.related_organizations)
                    ]);

                    // 2) Backward references (items that link TO this item)
                    const fetchBackward = async (field: string) => {
                        const q = query(collection(db, 'archive_items'), where(field, 'array-contains', id));
                        const snap = await getDocs(q);
                        let results = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ArchiveItem[];
                        
                        // Filter private items for non-SAHS users
                        if (!isSAHSUser) {
                            results = results.filter(i => !i.is_private);
                        }
                        return results;
                    };

                    const [backwardFigures, backwardDocs, backwardOrgs] = await Promise.all([
                        fetchBackward('related_figures'),
                        fetchBackward('related_documents'),
                        fetchBackward('related_organizations')
                    ]);

                    // Merge and deduplicate
                    // An item linking TO us via "related_figures" means THEY considered US a figure.
                    // But for display purposes, we want to group the merged items by THEIR item_type.
                    const allLinkedItems = [
                        ...forwardFigures, ...forwardDocs, ...forwardOrgs,
                        ...backwardFigures, ...backwardDocs, ...backwardOrgs
                    ];

                    const uniqueLinkedMap = new Map<string, ArchiveItem>();
                    allLinkedItems.forEach(item => {
                        if (item.id !== id) uniqueLinkedMap.set(item.id!, item);
                    });
                    const uniqueLinked = Array.from(uniqueLinkedMap.values());

                    // Now group the unique linked items based on their actual type
                    const figures = uniqueLinked.filter(i => i.item_type === 'Historic Figure');
                    const orgs = uniqueLinked.filter(i => i.item_type === 'Historic Organization');

                    setRelatedFigureItems(figures);
                    setRelatedOrganizationItems(orgs);
                    // Documents and Artifacts can be displayed together in the DocumentCard grid, 
                    // or we can separate them. For now, we put Docs + Artifacts + any other type into relatedDocumentItems
                    const cards = uniqueLinked.filter(i => i.item_type !== 'Historic Figure' && i.item_type !== 'Historic Organization');
                    setRelatedDocumentItems(cards);

                    // --- Fetch "Keep Exploring" items ---
                    let exploreQuery;
                    const cIdsExplore = data.collection_ids || (data.collection_id ? [data.collection_id] : []);
                    if (cIdsExplore.length > 0) {
                        exploreQuery = query(
                            collection(db, 'archive_items'), 
                            or(
                                where('collection_ids', 'array-contains-any', cIdsExplore),
                                where('collection_id', 'in', cIdsExplore)
                            )
                        );
                    } else {
                        exploreQuery = query(collection(db, 'archive_items'), where('item_type', '==', data.item_type));
                    }
                    
                    const exploreSnap = await getDocs(exploreQuery);
                    let eItems = exploreSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ArchiveItem[];
                    
                    if (!isSAHSUser) {
                        eItems = eItems.filter(i => !i.is_private);
                    }
                    
                    const explicitlyLinkedIds = new Set(uniqueLinked.map(i => i.id));
                    eItems = eItems.filter(i => i.id !== id && !explicitlyLinkedIds.has(i.id));
                    
                    eItems = eItems.sort(() => 0.5 - Math.random()).slice(0, 4);
                    setExploreItems(eItems);
                }

            } catch (error) {
                console.error("Error fetching item details:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchItemAndRelated();
    }, [id, isSAHSUser]);

    const handleDelete = async () => {
        if (!id || !window.confirm('Are you sure you want to delete this resource?')) return;

        setIsDeleting(true);
        try {
            await deleteDoc(doc(db, 'archive_items', id));
            navigate('/archive');
        } catch (error) {
            console.error("Error deleting item:", error);
            alert("Failed to delete item.");
            setIsDeleting(false);
        }
    };

    if (loading || isDeleting) {
        return <div className="flex justify-center items-center h-full text-charcoal/60 font-serif text-lg">{isDeleting ? 'Deleting...' : 'Loading resource...'}</div>;
    }

    if (!item || ((item.is_private || isCollectionPrivate) && !isSAHSUser)) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-20">
                <h2 className="text-2xl font-serif text-charcoal mb-4">
                    {!item ? "Item Not Found" : "Unauthorized: This item or its collection is private"}
                </h2>
                <Link to="/archive" className="text-tan hover:text-charcoal transition-colors font-medium">
                    &larr; Return to Archive
                </Link>
            </div>
        );
    }

    const { file_urls } = item;

    return (
        <div className="flex flex-col h-full max-w-full mx-auto animate-in fade-in duration-500 pb-12">
            {zoomedImage && (
                <div
                    className="fixed inset-0 z-[2000] bg-charcoal/95 flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden animate-in fade-in duration-300"
                    onClick={() => {
                        setZoomedImage(null);
                        setZoomScale(1);
                    }}
                >
                    {/* Controls Overlay */}
                    <div className="absolute top-8 right-8 flex items-center gap-4 z-[2100]" onClick={e => e.stopPropagation()}>
                        <div className="flex bg-white/10 backdrop-blur-md rounded-full border border-white/20 p-1 shadow-2xl">
                            <button 
                                onClick={() => setZoomScale(prev => Math.max(0.5, prev - 0.25))}
                                className="p-2 hover:bg-white/20 rounded-full text-white transition-colors"
                                title="Zoom Out"
                            >
                                <ZoomOut size={24} />
                            </button>
                            <div className="flex items-center px-4 text-white font-mono text-sm min-w-[70px] justify-center select-none">
                                {Math.round(zoomScale * 100)}%
                            </div>
                            <button 
                                onClick={() => setZoomScale(prev => Math.min(4, prev + 0.25))}
                                className="p-2 hover:bg-white/20 rounded-full text-white transition-colors"
                                title="Zoom In"
                            >
                                <ZoomIn size={24} />
                            </button>
                        </div>
                        <button 
                            onClick={() => {
                                setZoomedImage(null);
                                setZoomScale(1);
                            }}
                            className="p-3 bg-white/10 backdrop-blur-md hover:bg-red-500/40 rounded-full text-white transition-all border border-white/20 shadow-2xl group"
                        >
                            <X size={28} className="group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>

                    {/* Full Screen Navigation Arrows */}
                    {file_urls && file_urls.length > 1 && (
                        <>
                            <button 
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex(prev => (prev === 0 ? file_urls.length - 1 : prev - 1));
                                }}
                                className="fixed left-6 md:left-12 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-charcoal/60 backdrop-blur-xl border-2 border-white/30 flex items-center justify-center text-white hover:bg-white hover:text-charcoal transition-all shadow-[0_0_40px_rgba(0,0,0,0.5)] z-[2100] group/nav"
                                title="Previous Page"
                            >
                                <ChevronLeft size={40} strokeWidth={3} className="group-hover/nav:-translate-x-1 transition-transform" />
                            </button>
                            <button 
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex(prev => (prev === file_urls.length - 1 ? 0 : prev + 1));
                                }}
                                className="fixed right-6 md:right-12 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-charcoal/60 backdrop-blur-xl border-2 border-white/30 flex items-center justify-center text-white hover:bg-white hover:text-charcoal transition-all shadow-[0_0_40px_rgba(0,0,0,0.5)] z-[2100] group/nav"
                                title="Next Page"
                            >
                                <ChevronRight size={40} strokeWidth={3} className="group-hover/nav:translate-x-1 transition-transform" />
                            </button>
                            
                            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-charcoal/80 backdrop-blur-xl px-8 py-3 rounded-full border border-white/20 text-white font-black tracking-[0.4em] uppercase text-sm z-[2100] shadow-2xl">
                                Page {currentImageIndex + 1} / {file_urls.length}
                            </div>
                        </>
                    )}

                    <div 
                        className="relative w-full h-full overflow-hidden flex items-center justify-center p-4 md:p-20 no-scrollbar"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                setZoomedImage(null);
                                setZoomScale(1);
                            }
                        }}
                    >
                        <div 
                            className="relative transition-transform duration-200 ease-out flex items-center justify-center"
                            style={{ 
                                transform: `scale(${zoomScale})`,
                                transformOrigin: 'center center',
                                cursor: zoomScale > 1 ? 'grab' : 'zoom-in'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setZoomScale(prev => prev === 1 ? 2.5 : 1);
                            }}
                        >
                            <img
                                src={file_urls[currentImageIndex]}
                                alt="High Resolution View"
                                className="shadow-2xl rounded-lg transition-all duration-300 ring-4 ring-white/5"
                                style={{
                                    maxWidth: 'min(75vw, 1200px)',
                                    maxHeight: '75vh',
                                    width: 'auto',
                                    height: 'auto',
                                    objectFit: 'contain'
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => {
                            if (window.history.state && window.history.state.idx > 0) {
                                navigate(-1);
                            } else {
                                navigate('/archive');
                            }
                        }} 
                        className="flex items-center gap-2 text-charcoal/60 hover:text-charcoal transition-colors font-medium whitespace-nowrap"
                    >
                        <ArrowLeft size={18} />
                        Go Back
                    </button>

                    {(prevId || nextId) && (
                        <div className="flex items-center gap-1 bg-tan-light/10 border border-tan-light/30 rounded-lg p-1 ml-2 md:ml-6 shadow-sm">
                            <button 
                                onClick={() => prevId && navigate(`/items/${prevId}`, { state: { galleryIds } })} 
                                disabled={!prevId}
                                title="Previous Item"
                                className={`p-1.5 md:p-2 rounded transition-colors flex items-center gap-1 text-xs md:text-sm font-bold uppercase tracking-wider ${prevId ? 'text-charcoal hover:bg-white hover:text-tan hover:shadow-sm' : 'text-charcoal/20 cursor-not-allowed'}`}
                            >
                                <ChevronLeft size={16} strokeWidth={3} /> <span className="hidden sm:inline">Prev</span>
                            </button>
                            <div className="text-[10px] font-black text-charcoal/40 tracking-widest px-2 whitespace-nowrap">
                                {currentIndex + 1} / {galleryIds.length}
                            </div>
                            <button 
                                onClick={() => nextId && navigate(`/items/${nextId}`, { state: { galleryIds } })} 
                                disabled={!nextId}
                                title="Next Item"
                                className={`p-1.5 md:p-2 rounded transition-colors flex items-center gap-1 text-xs md:text-sm font-bold uppercase tracking-wider ${nextId ? 'text-charcoal hover:bg-white hover:text-tan hover:shadow-sm' : 'text-charcoal/20 cursor-not-allowed'}`}
                            >
                                <span className="hidden sm:inline">Next</span> <ChevronRight size={16} strokeWidth={3} />
                            </button>
                        </div>
                    )}
                </div>

                {isSAHSUser && (
                    <div className="flex gap-3">
                        <button
                            onClick={() => navigate(`/edit-item/${id}`)}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-tan-light/50 rounded-lg text-sm font-medium text-charcoal hover:bg-tan-light/20 transition-colors shadow-sm"
                        >
                            <Edit2 size={16} /> Edit
                        </button>
                        <button
                            onClick={handleDelete}
                            className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-100 transition-colors shadow-sm"
                        >
                            <Trash2 size={16} /> Delete
                        </button>
                    </div>
                )}
            </div>

            <div className="mb-12 max-w-6xl">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <h1 className="text-5xl md:text-7xl font-serif font-bold text-charcoal leading-tight tracking-tighter">
                        {item.title}
                    </h1>
                    {item.is_private && isSAHSUser && (
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-md translate-y-[-4px]">
                            <Lock size={14} /> Private Item
                        </div>
                    )}
                    {isCollectionPrivate && isSAHSUser && (
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-500 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-md translate-y-[-4px]">
                            <Lock size={14} /> Private Collection
                        </div>
                    )}
                </div>
                {item.item_type === 'Historic Figure' && item.also_known_as && (
                    <p className="text-2xl font-serif italic text-tan mb-4">"{item.also_known_as}"</p>
                )}
            </div>

            <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
                {/* Left Side: Image Viewer (all item types) */}
                <div className="w-full md:w-80 lg:w-[420px] shrink-0">
                    <div className="sticky top-8 space-y-4">
                        <div className="aspect-[3/4] bg-tan-light/20 rounded-2xl overflow-hidden border border-tan-light/50 relative shadow-md group">
                            {file_urls && file_urls.length > 0 ? (
                                <>
                                    <img
                                        src={file_urls[currentImageIndex]}
                                        alt={item.title}
                                        className="w-full h-full transition-all duration-500 cursor-zoom-in object-cover group-hover:scale-105"
                                        onClick={() => setZoomedImage(file_urls[currentImageIndex])}
                                    />
                                    
                                    {/* Navigation Arrows — always visible when multiple images */}
                                    {file_urls.length > 1 && (
                                        <>
                                            <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCurrentImageIndex(prev => (prev === 0 ? file_urls.length - 1 : prev - 1));
                                                }}
                                                className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-xl flex items-center justify-center text-charcoal transition-all hover:bg-tan hover:text-white hover:scale-110 z-30 border border-tan-light/50 active:scale-95"
                                            >
                                                <ChevronLeft size={28} strokeWidth={3} />
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCurrentImageIndex(prev => (prev === file_urls.length - 1 ? 0 : prev + 1));
                                                }}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-xl flex items-center justify-center text-charcoal transition-all hover:bg-tan hover:text-white hover:scale-110 z-30 border border-tan-light/50 active:scale-95"
                                            >
                                                <ChevronRight size={28} strokeWidth={3} />
                                            </button>

                                            {/* Page Indicator — always visible */}
                                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-charcoal/70 backdrop-blur-sm text-white px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase z-10">
                                                Page {currentImageIndex + 1} of {file_urls.length}
                                            </div>
                                        </>
                                    )}

                                    <div className="absolute inset-x-0 bottom-0 top-3/4 bg-gradient-to-t from-charcoal/40 to-transparent pointer-events-none" />
                                    <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                        <ZoomIn size={16} className="text-white" />
                                    </div>
                                </>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-tan-light bg-charcoal/5">
                                    <span className="font-serif text-6xl opacity-20">{item.title.charAt(0)}</span>
                                </div>
                            )}
                        </div>

                        {/* Pagination Dots */}
                        {file_urls && file_urls.length > 1 && (
                            <div className="flex justify-center gap-1.5 px-4 overflow-x-auto max-w-full no-scrollbar pb-2">
                                {file_urls.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentImageIndex(idx)}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${
                                            idx === currentImageIndex ? 'w-8 bg-tan' : 'w-2 bg-tan-light/30 hover:bg-tan/50'
                                        }`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side: Biography & Related Docs */}
                <div className="flex-1 flex flex-col">
                    {/* Main Narrative Block */}
                    <div className="mb-10 bg-white border border-tan-light/50 rounded-xl p-8 md:p-12 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-tan/40"></div>
                        <h3 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 pb-4 mb-8">
                            <FileText className="text-tan" size={24} />
                            {item.item_type === 'Historic Figure' ? 'Biography' : 'Description'}
                        </h3>
                        <div className="prose prose-lg md:prose-xl max-w-none text-charcoal/90 font-sans leading-relaxed whitespace-pre-wrap">
                            {item.description}
                        </div>
                    </div>

                    {/* Biography Sources Block */}
                    {item.biography_sources && (
                        <div className="mb-10 bg-tan-light/10 border border-tan-light/50 rounded-xl p-6 md:p-8 shadow-sm">
                            <h3 className="text-lg font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 pb-3 mb-4">
                                <BookOpen className="text-tan" size={20} />
                                {item.item_type === 'Historic Figure' ? 'Biography Sources' : 'Description Sources'}
                            </h3>
                            <div className="font-sans text-[15px] text-charcoal/80 leading-relaxed whitespace-pre-wrap">
                                {item.biography_sources}
                            </div>
                        </div>
                    )}

                    {/* SEAMLESS INFORMATION SECTION */}
                    <div className="mb-12">
                        <h3 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 pb-4 mb-8">
                            <Info className="text-tan" size={24} />
                            Information & Archival Details
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-12">
                            {/* Personal / Type Facts */}
                            <div className="space-y-6">
                                {item.item_type === 'Historic Figure' && (
                                    <>
                                        {item.full_name && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Full Name</p>
                                                <p className="text-lg font-serif text-charcoal">{item.full_name}</p>
                                            </div>
                                        )}
                                        {(item.birth_date || item.death_date) && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Dates of Life</p>
                                                <div className="grid grid-cols-2 gap-4">
                                                    {item.birth_date && (
                                                        <div>
                                                            <span className="text-[10px] font-bold text-tan uppercase tracking-widest block mb-0.5">Birth</span>
                                                            <p className="text-lg font-serif text-charcoal">{item.birth_date}</p>
                                                        </div>
                                                    )}
                                                    {item.death_date && (
                                                        <div className={item.birth_date ? "border-l border-tan/20 pl-4" : ""}>
                                                            <span className="text-[10px] font-bold text-tan uppercase tracking-widest block mb-0.5">Death</span>
                                                            <p className="text-lg font-serif text-charcoal">{item.death_date}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                {item.item_type === 'Historic Organization' && (
                                    <>
                                        {item.org_name && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Official Name</p>
                                                <p className="text-lg font-serif text-charcoal">{item.org_name}</p>
                                            </div>
                                        )}
                                        {(item.founding_date || item.dissolved_date) && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Organization Lifespan</p>
                                                <p className="text-lg font-serif text-charcoal">
                                                    {item.founding_date || '?'} — {item.dissolved_date || 'Present'}
                                                </p>
                                            </div>
                                        )}
                                        {item.alternative_names && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Alternative / Former Names</p>
                                                <p className="text-lg font-serif text-charcoal">{item.alternative_names}</p>
                                            </div>
                                        )}
                                    </>
                                )}
                                {!['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && (
                                    <div>
                                        <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Category</p>
                                        <p className="text-lg font-serif text-charcoal">{item.item_type}</p>
                                        {item.category && item.item_type !== 'Artifact' && (
                                            <span className="inline-block bg-tan/10 text-tan px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-tan/20 mt-2 capitalize font-sans">
                                                {item.category}
                                            </span>
                                        )}
                                    </div>
                                )}
                                    {collectionsData.length > 0 && !['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Part of Collection{collectionsData.length > 1 ? 's' : ''}</p>
                                            <div className="flex flex-col gap-2">
                                                {collectionsData.map(col => (
                                                    <Link key={col.id} to={`/collections/${col.id}`} className="text-lg font-serif text-tan hover:underline inline-flex items-center gap-1.5 align-top">
                                                        <BookOpen size={16} />
                                                        {col.title}
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                {item.condition && item.item_type !== 'Historic Figure' && (
                                    <div>
                                        <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Condition</p>
                                        <span className="inline-block bg-tan-light/10 text-charcoal/80 px-2.5 py-0.5 rounded-full text-[12px] font-bold border border-tan-light/30 mt-1 font-sans">
                                            {item.condition}
                                        </span>
                                    </div>
                                )}
                                {item.date && item.item_type !== 'Historic Figure' && (
                                    <div>
                                        <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Origin Date</p>
                                        <p className="text-lg font-serif text-charcoal">{item.date}</p>
                                    </div>
                                )}
                                {item.creator && item.item_type !== 'Historic Organization' && (
                                    <div>
                                        <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Creator / Author</p>
                                        <p className="text-lg font-serif text-charcoal">{item.creator}</p>
                                    </div>
                                )}
                            </div>

                            {/* Column 2: Secondary Context / Bio Details */}
                            <div className="space-y-6">
                                {item.item_type === 'Historic Organization' && (
                                    <>

                                        {item.creator && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Media / Data Contributor</p>
                                                <p className="text-lg font-serif text-charcoal">{item.creator}</p>
                                            </div>
                                        )}
                                        {item.historical_address && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                                    <MapPin size={12} className="text-tan" /> Historical Address
                                                </p>
                                                <p className="text-lg font-serif text-charcoal leading-snug">{item.historical_address}</p>
                                            </div>
                                        )}
                                    </>
                                )}
                                {item.item_type === 'Historic Figure' && (
                                    <>
                                        {item.occupation && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Primary Occupation</p>
                                                <p className="text-lg font-serif text-charcoal">{item.occupation}</p>
                                            </div>
                                        )}
                                        {item.birthplace && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Birthplace</p>
                                                <p className="text-lg font-serif text-charcoal">{item.birthplace}</p>
                                            </div>
                                        )}
                                        {item.historical_address && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                                    <MapPin size={12} className="text-tan" /> Historical Address
                                                </p>
                                                <p className="text-lg font-serif text-charcoal leading-snug">{item.historical_address}</p>
                                            </div>
                                        )}
                                    </>
                                )}
                                {item.item_type === 'Artifact' && (
                                    <>
                                        {item.donor && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Original Donor</p>
                                                <p className="text-lg font-serif text-charcoal">{item.donor}</p>
                                            </div>
                                        )}
                                    </>
                                )}
                                {/* Shifted Archival Meta for Figures/Orgs */}
                                {(item.item_type === 'Historic Figure' || item.item_type === 'Historic Organization') && (
                                    <div className="pt-4 space-y-6 border-t border-tan-light/20">
                                        {item.artifact_id && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans text-tan">Catalog ID #</p>
                                                <p className="text-lg font-serif font-bold text-tan">{item.artifact_id}</p>
                                            </div>
                                        )}
                                        {(item.archive_reference || item.identifier) && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Archival References</p>
                                                <p className="text-sm font-sans text-charcoal/80 leading-relaxed font-medium">
                                                    {item.archive_reference}
                                                    {item.identifier && <span className="block italic opacity-60 mt-0.5">{item.identifier}</span>}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Archival Tracking */}
                            <div className="space-y-6">
                                {item.artifact_id && item.item_type !== 'Historic Figure' && item.item_type !== 'Historic Organization' && (
                                    <div>
                                        <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans text-tan">Catalog ID #</p>
                                        <p className="text-lg font-serif font-bold text-tan">{item.artifact_id}</p>
                                    </div>
                                )}
                                {(item.archive_reference || item.identifier) && item.item_type !== 'Historic Figure' && item.item_type !== 'Historic Organization' && (
                                    <div>
                                        <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Archival References</p>
                                        <p className="text-sm font-sans text-charcoal/80 leading-relaxed font-medium">
                                            {item.archive_reference}
                                            {item.identifier && <span className="block italic opacity-60 mt-0.5">{item.identifier}</span>}
                                        </p>
                                    </div>
                                )}
                                {item.physical_location && item.item_type !== 'Historic Figure' && item.item_type !== 'Historic Organization' && (
                                    <div>
                                        <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                            <MapPin size={12} className="text-tan" /> Origin / Location
                                        </p>
                                        <p className="text-[15px] font-sans text-charcoal leading-snug">{item.physical_location}</p>
                                    </div>
                                )}
                                {item.historical_address && !['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && (
                                    <div>
                                        <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                            <MapPin size={12} className="text-tan" /> Historical Address
                                        </p>
                                        <p className="text-[15px] font-sans text-charcoal leading-snug">{item.historical_address}</p>
                                    </div>
                                )}
                                {(item.museum_location_id || item.museum_location || isSAHSUser) && item.item_type !== 'Historic Figure' && item.item_type !== 'Historic Organization' && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] font-sans">Physical Museum Shelf/Box</p>
                                            {isSAHSUser && !isEditingLocation && (
                                                <button onClick={handleEditLocationClick} className="text-[10px] text-tan hover:text-tan-light bg-tan/10 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition-colors">
                                                    <Edit2 size={10} /> Link
                                                </button>
                                            )}
                                        </div>
                                        
                                        {isEditingLocation ? (
                                            <div className="flex flex-col gap-3 mt-2 bg-cream/30 p-3 rounded-xl border border-tan-light/50">
                                                <select 
                                                    value={newLocationId} 
                                                    onChange={(e) => setNewLocationId(e.target.value)}
                                                    className="w-full bg-white border border-tan-light/50 p-2.5 rounded-lg text-sm outline-none focus:border-tan font-sans"
                                                    disabled={isSavingLocation}
                                                >
                                                    <option value="">-- No Location (Unassigned) --</option>
                                                    {[...allLocations].sort((a,b) => a.name.localeCompare(b.name)).map(loc => (
                                                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                                                    ))}
                                                </select>
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={() => setIsEditingLocation(false)} disabled={isSavingLocation} className="text-xs font-bold text-charcoal/50 hover:text-charcoal px-3 py-1.5 transition-colors">Cancel</button>
                                                    <button onClick={handleSaveLocation} disabled={isSavingLocation} className="text-xs font-bold bg-tan text-white px-4 py-1.5 rounded-lg hover:bg-charcoal transition-colors shadow-sm relative">
                                                        {isSavingLocation ? 'Saving...' : 'Confirm'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {(item.museum_location_ids && item.museum_location_ids.length > 0) || item.museum_location_id ? (
                                                    <div className="flex flex-col gap-2">
                                                        {Array.from(new Set([...(item.museum_location_ids || []), ...(item.museum_location_id ? [item.museum_location_id] : [])])).map(locId => {
                                                            const locObj = allLocations.find(l => l.id === locId);
                                                            const displayName = locObj?.name || locId;
                                                            return (
                                                                <p key={locId} className="text-[15px] font-sans text-charcoal leading-snug font-bold">
                                                                    {isSAHSUser ? (
                                                                        <Link to={`/locations/${locId}`} className="flex items-center gap-1.5 hover:text-tan transition-colors group">
                                                                            <Box size={16} className="text-tan" /> 
                                                                            <span className="underline underline-offset-4 decoration-tan/30 group-hover:decoration-tan">{displayName}</span>
                                                                        </Link>
                                                                    ) : (
                                                                        <span className="flex items-center gap-1.5">
                                                                            <Box size={16} className="text-tan" /> 
                                                                            {displayName}
                                                                        </span>
                                                                    )}
                                                                </p>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm font-sans text-charcoal/40 italic leading-snug font-medium">Currently Unassigned</p>
                                                )}
                                                {item.museum_location && !item.museum_location_id && (
                                                    <p className="text-[13px] font-sans text-charcoal leading-snug mt-2 p-2 bg-tan/5 rounded border border-tan/10 text-charcoal/70">
                                                        Legacy Record: <span className="font-bold">{item.museum_location}</span>
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tags and Source footer */}
                        <div className="mt-12 pt-8 border-t border-tan-light/30 grid grid-cols-1 md:grid-cols-2 gap-8">
                            {item.tags && item.tags.length > 0 && (
                                <div>
                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-3 font-sans">System Keywords</p>
                                    <div className="flex flex-wrap gap-2">
                                        {item.tags.map(tag => (
                                            <span key={tag} className="text-[9px] bg-charcoal/5 text-charcoal/60 px-2.5 py-1 rounded-md font-bold uppercase tracking-[0.1em] border border-charcoal/10 hover:bg-tan/10 hover:text-tan transition-colors cursor-default">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {item.source && !['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && (
                                <div className="md:text-right">
                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Collection Source</p>
                                    <p className="text-[13px] italic text-charcoal/60 font-serif leading-relaxed">
                                        {item.source}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Extended Archival Metadata */}
                    {(item.publisher || item.contributor || item.rights || item.relation || item.format || item.language || item.type || item.coverage) && (
                        <div className="mb-12 bg-white border border-tan-light/50 rounded-xl overflow-hidden shadow-sm">
                            <button
                                type="button"
                                onClick={() => setShowAdvancedDC(!showAdvancedDC)}
                                className="w-full px-6 py-4 bg-cream/30 flex justify-between items-center text-charcoal font-medium hover:bg-cream transition-colors border-b border-tan-light/50"
                            >
                                <span className="font-serif font-bold text-lg flex items-center gap-2">
                                    <BookOpen className="text-tan" size={18} />
                                    Extended Archival Metadata (Dublin Core)
                                </span>
                                {showAdvancedDC ? <ChevronUp size={20} className="text-charcoal/50" /> : <ChevronDown size={20} className="text-charcoal/50" />}
                            </button>
                            {showAdvancedDC && (
                                <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-8 gap-x-6 bg-white">
                                    {item.publisher && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Publisher</p>
                                            <p className="text-[15px] font-sans text-charcoal">{item.publisher}</p>
                                        </div>
                                    )}
                                    {item.contributor && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Contributor</p>
                                            <p className="text-[15px] font-sans text-charcoal">{item.contributor}</p>
                                        </div>
                                    )}
                                    {item.rights && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Rights</p>
                                            <p className="text-[15px] font-sans text-charcoal font-medium">{item.rights}</p>
                                        </div>
                                    )}
                                    {item.relation && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Relation</p>
                                            <p className="text-[15px] font-sans text-charcoal">{item.relation}</p>
                                        </div>
                                    )}
                                    {item.format && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Format</p>
                                            <p className="text-[15px] font-sans text-charcoal">{item.format}</p>
                                        </div>
                                    )}
                                    {item.language && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Language</p>
                                            <p className="text-[15px] font-sans text-charcoal">{item.language}</p>
                                        </div>
                                    )}
                                    {item.type && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Type (DC)</p>
                                            <p className="text-[15px] font-sans text-charcoal">{item.type}</p>
                                        </div>
                                    )}
                                    {item.coverage && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Coverage</p>
                                            <p className="text-[15px] font-sans text-charcoal">{item.coverage}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}


                    {/* Transcription Block */}
                    {item.transcription && (
                        <div className="mb-10 bg-tan-light/10 border border-tan-light/50 rounded-xl p-6 md:p-8 shadow-sm">
                            <h3 className="text-lg font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 pb-3 mb-4">
                                <FileText className="text-tan" size={20} />
                                Transcription
                            </h3>
                            <div className="font-mono text-sm text-charcoal/80 leading-relaxed whitespace-pre-wrap">
                                {item.transcription}
                            </div>
                        </div>
                    )}

                    {/* Google Map Display */}
                    {item.coordinates && (
                        <div className="mb-10 bg-white border border-tan-light/50 rounded-xl overflow-hidden shadow-sm h-[400px]">
                            <h3 className="text-lg font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 p-4 bg-tan-light/10 m-0">
                                <MapPin className="text-tan" size={20} />
                                Geographic Location Map
                            </h3>
                            <div className="h-[400px] w-full rounded-2xl overflow-hidden border border-tan-light shadow-sm">
                                <ArchiveMap items={[item]} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Full-Width Section: Relationships & Media */}
            <div className="flex flex-col gap-10 mt-12 pt-8 border-t border-tan-light/50">
                {/* Linked Documents for Figures / Artifacts */}
                {relatedDocumentItems.length > 0 && (
                    <div className="bg-cream/30 border border-tan-light/50 rounded-2xl overflow-hidden shadow-sm">
                        <button 
                            onClick={() => setShowLinkedItems(!showLinkedItems)}
                            className="w-full px-6 md:px-8 py-6 flex items-center justify-between hover:bg-cream/50 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-tan/10 flex items-center justify-center text-tan group-hover:scale-110 transition-transform">
                                    <BookOpen size={20} />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-xl font-serif font-bold text-charcoal">
                                        Linked Documents & Artifacts
                                    </h3>
                                    <p className="text-xs font-bold text-charcoal/40 uppercase tracking-widest mt-0.5">
                                        {relatedDocumentItems.length} {relatedDocumentItems.length === 1 ? 'associated item' : 'associated items'}
                                    </p>
                                </div>
                            </div>
                            <div className={`w-10 h-10 rounded-full bg-white border border-tan-light/50 flex items-center justify-center text-charcoal/40 transition-all ${showLinkedItems ? 'rotate-180 bg-tan text-white border-tan' : 'group-hover:border-tan group-hover:text-tan'}`}>
                                <ChevronDown size={20} strokeWidth={3} />
                            </div>
                        </button>
                        
                        {showLinkedItems && (
                            <div className="p-6 md:p-8 pt-0 border-t border-tan-light/20 bg-white/50 animate-in slide-in-from-top-4 duration-300">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-6">
                                    {relatedDocumentItems.map(doc => (
                                        <DocumentCard key={doc.id} item={doc} galleryIds={relatedDocumentItems.map(d => d.id || '')} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Related Figures */}
                {relatedFigureItems.length > 0 && (
                    <div>
                        <h3 className="text-xl font-serif font-bold text-charcoal mb-6 flex items-center gap-2">
                            <Users className="text-tan" size={24} />
                            Associated Historic Figures
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-6">
                            {relatedFigureItems.map(fig => (
                                <Link key={fig.id} to={`/items/${fig.id}`} state={{ galleryIds: relatedFigureItems.map(f => f.id || '') }} className="group block text-center">
                                    <div className="aspect-square bg-cream rounded-full overflow-hidden border-2 border-tan-light/50 mb-3 group-hover:border-tan transition-colors shadow-sm max-w-[150px] mx-auto">
                                        {fig.featured_image_url || fig.file_urls?.[0] ? (
                                            <img src={(fig.featured_image_url || fig.file_urls?.[0])!} alt={fig.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-tan/20 font-serif text-3xl">{fig.title.charAt(0)}</div>
                                        )}
                                    </div>
                                    <p className="font-serif font-bold text-charcoal group-hover:text-tan transition-colors">{fig.title}</p>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Related Organizations */}
                {relatedOrganizationItems.length > 0 && (
                    <div className="pt-4">
                        <h3 className="text-xl font-serif font-bold text-charcoal mb-6 flex items-center gap-2">
                            <BookOpen className="text-tan" size={24} />
                            Associated Organizations
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                            {relatedOrganizationItems.map(org => (
                                <Link key={org.id} to={`/items/${org.id}`} state={{ galleryIds: relatedOrganizationItems.map(o => o.id || '') }} className="group block text-center">
                                    <div className="aspect-[4/3] bg-cream rounded-xl overflow-hidden border border-tan-light/50 mb-3 group-hover:border-tan transition-colors shadow-sm">
                                        {org.featured_image_url || org.file_urls?.[0] ? (
                                            <img src={(org.featured_image_url || org.file_urls?.[0])!} alt={org.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-tan/20 font-serif text-3xl">{org.title ? org.title.charAt(0) : "O"}</div>
                                        )}
                                    </div>
                                    <p className="font-serif font-bold text-charcoal group-hover:text-tan transition-colors">{org.title}</p>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Thumbnail Strip — click to jump to image in left viewer */}
                {file_urls && file_urls.length > 1 && (
                    <div className="pt-4">
                        <h2 className="text-xl font-serif font-bold text-charcoal mb-4">All Pages / Media</h2>
                        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-3">
                            {file_urls.map((url, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentImageIndex(idx)}
                                    title={`Page ${idx + 1}`}
                                    className={`group relative aspect-[3/4] bg-tan-light/20 rounded-lg overflow-hidden border transition-all ${
                                        idx === currentImageIndex 
                                            ? 'border-tan ring-2 ring-tan/30 shadow-md' 
                                            : 'border-tan-light/50 hover:border-tan/50 shadow-sm opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    <img 
                                        src={url} 
                                        alt={`Page ${idx + 1}`} 
                                        loading="lazy" 
                                        decoding="async"
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                                    />
                                    <div className="absolute bottom-0 inset-x-0 bg-charcoal/60 text-white text-[9px] font-bold text-center py-0.5">
                                        {idx + 1}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Additional Media (Video/Audio) - Visible to everyone */}
                {item.additional_media_urls && item.additional_media_urls.length > 0 && (
                    <div className="pt-8 border-t border-tan-light/30">
                        <h3 className="text-xl font-serif font-bold text-charcoal mb-6 flex items-center gap-2">
                            <Camera className="text-tan" size={24} />
                            Additional Media & Recordings
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {item.additional_media_urls.map((url, idx) => {
                                const isAudio = url.toLowerCase().includes('.mp3') || url.toLowerCase().includes('.wav') || url.toLowerCase().includes('.m4a');
                                return (
                                    <div key={idx} className="bg-white border border-tan-light/50 rounded-xl overflow-hidden shadow-sm">
                                        <div className="p-4 bg-tan-light/10 border-b border-tan-light/30 flex items-center justify-between">
                                            <span className="text-xs font-black text-tan uppercase tracking-widest">Media Track {idx + 1}</span>
                                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-tan hover:text-charcoal transition-colors">
                                                <Maximize2 size={14} />
                                            </a>
                                        </div>
                                        <div className="p-6 flex flex-col items-center justify-center min-h-[150px] bg-indigo-50/20">
                                            {isAudio ? (
                                                <div className="w-full space-y-4 flex flex-col items-center">
                                                    <div className="w-16 h-16 bg-tan/20 rounded-full flex items-center justify-center text-tan animate-pulse">
                                                        <Camera size={32} />
                                                    </div>
                                                    <audio controls className="w-full">
                                                        <source src={url} />
                                                        Your browser does not support the audio element.
                                                    </audio>
                                                </div>
                                            ) : (
                                                <video controls className="w-full rounded-lg shadow-md max-h-[300px]">
                                                    <source src={url} />
                                                    Your browser does not support the video element.
                                                </video>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Accessioning Paperwork - Admin/Curator ONLY */}
                {isSAHSUser && !['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && item.accession_paperwork_urls && item.accession_paperwork_urls.length > 0 && (
                    <div className="mt-16 pt-12 border-t-2 border-dashed border-tan-light/50 bg-tan/5 rounded-3xl p-8 md:p-12">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2">
                                    <Lock className="text-tan" size={24} />
                                    Accessioning Paperwork
                                </h3>
                                <p className="text-xs font-bold text-charcoal/40 uppercase tracking-widest mt-1">Internal Archival Documentation</p>
                            </div>
                            <span className="bg-charcoal text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">Restricted Access</span>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                            {item.accession_paperwork_urls.map((url, idx) => (
                                <div key={idx} className="group relative">
                                    <div 
                                        className="aspect-[3/4] bg-white rounded-xl overflow-hidden border-2 border-tan-light/30 shadow-sm group-hover:border-tan transition-all cursor-zoom-in"
                                        onClick={() => setZoomedImage(url)}
                                    >
                                        <img 
                                            src={url} 
                                            alt={`Paperwork ${idx + 1}`} 
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        />
                                        <div className="absolute inset-0 bg-charcoal/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <ZoomIn size={24} className="text-white" />
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between px-1">
                                        <span className="text-[10px] font-bold text-charcoal/60 uppercase tracking-widest">Page {idx + 1}</span>
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-tan hover:text-charcoal transition-colors">
                                            <Maximize2 size={12} />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Keep Exploring Section */}
            {exploreItems.length > 0 && (
                <div className="mt-16 pt-12 border-t border-tan-light/50">
                    <div className="mb-8 text-center">
                        <h2 className="text-3xl font-serif font-bold text-charcoal mb-3">Keep Exploring</h2>
                        <p className="text-charcoal/60 font-sans max-w-2xl mx-auto">
                            Discover more from our archives that share similar themes or origins with this item.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {exploreItems.map(exploreItem => (
                            <DocumentCard 
                                key={exploreItem.id} 
                                item={exploreItem} 
                                galleryIds={exploreItems.map(i => i.id || '')} 
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
