import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, BookOpen, Edit2, Trash2, FileText, ZoomIn, ZoomOut, X, MapPin, Info, Users, ChevronLeft, ChevronRight, ChevronDown, Lock, Link2, User, Pin, CornerUpLeft } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { DocumentCard } from '../components/DocumentCard';
import { OptimizedImage } from '../components/OptimizedImage';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, getDocs, deleteDoc, where, documentId, updateDoc, or, limit, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { ArchiveItem, MuseumLocation } from '../types/database';
import { containsBannedWords } from '../utils/profanityFilter';

export function ItemDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { isSAHSUser, user, hasResearchAccess, isAdmin, isCurator, isMember, memberData } = useAuth();

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
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [collectionsData, setCollectionsData] = useState<{id: string, title: string, is_private?: boolean}[]>([]);
    const [isCollectionPrivate, setIsCollectionPrivate] = useState(false);
    
    const [showLinkedItems, setShowLinkedItems] = useState(false);

    // Inline Location Editing State
    const [isEditingLocation, setIsEditingLocation] = useState(false);
    const [allLocations, setAllLocations] = useState<MuseumLocation[]>([]);
    const [newLocationId, setNewLocationId] = useState('');
    const [isSavingLocation, setIsSavingLocation] = useState(false);

    // Bookmarking / Folder Workspace States
    const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
    const [userFolders, setUserFolders] = useState<{ id: string; name: string; itemIds: string[] }[]>([]);
    const [loadingFolders, setLoadingFolders] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

    // Sticky Note Workspace States
    const [noteContent, setNoteContent] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
    const isInitialLoad = useRef(true);

    // Fetch Note Content
    useEffect(() => {
        if (!user || !user.email || !hasResearchAccess || !id) return;
        const email = user.email.toLowerCase();
        isInitialLoad.current = true;

        const fetchNote = async () => {
            try {
                const noteRef = doc(db, 'members', email, 'research_notes', id);
                const noteSnap = await getDoc(noteRef);
                if (noteSnap.exists()) {
                    setNoteContent(noteSnap.data().content || '');
                } else {
                    setNoteContent('');
                }
            } catch (err) {
                console.error("Error fetching sticky note:", err);
            } finally {
                setTimeout(() => {
                    isInitialLoad.current = false;
                }, 150);
            }
        };

        fetchNote();
    }, [user, hasResearchAccess, id]);

    // Auto-Save Effect (Debounced)
    useEffect(() => {
        if (isInitialLoad.current) return;
        if (!user || !user.email || !hasResearchAccess || !id) return;
        const email = user.email.toLowerCase();

        const saveTimeout = setTimeout(async () => {
            try {
                setIsSavingNote(true);
                const noteRef = doc(db, 'members', email, 'research_notes', id);
                
                await setDoc(noteRef, {
                    itemId: id,
                    content: noteContent,
                    lastUpdated: new Date().toISOString()
                });
                
                setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } catch (err) {
                console.error("Error saving sticky note:", err);
            } finally {
                setIsSavingNote(false);
            }
        }, 1200);

        return () => clearTimeout(saveTimeout);
    }, [noteContent, user, hasResearchAccess, id]);

    // Comments States & Callback Logic
    const [comments, setComments] = useState<{
        id: string;
        authorName: string;
        authorEmail: string;
        role: 'Admin' | 'Curator' | 'Member';
        content: string;
        createdAt: string;
        parentId?: string;
    }[]>([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [newCommentText, setNewCommentText] = useState('');
    const [isPostingComment, setIsPostingComment] = useState(false);
    const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [isPostingReply, setIsPostingReply] = useState(false);

    const fetchComments = async () => {
        if (!id) return;
        setLoadingComments(true);
        try {
            const commentsCol = collection(db, 'archive_items', id, 'comments');
            const snap = await getDocs(commentsCol);
            const commentsList = snap.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            })) as any[];
            
            // Sort oldest first
            commentsList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            setComments(commentsList);
        } catch (err) {
            console.error("Error loading comments:", err);
        } finally {
            setLoadingComments(false);
        }
    };

    useEffect(() => {
        fetchComments();
    }, [id]);

    const handlePostComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !id || newCommentText.trim() === '') return;

        if (containsBannedWords(newCommentText)) {
            showToast("Your comment contains words that are not permitted on this platform. Please edit your comment and try again.");
            return;
        }

        setIsPostingComment(true);

        let authorName = user.displayName || '';
        if (isMember && memberData?.name) {
            authorName = memberData.name;
        }
        if (!authorName) {
            const prefix = user.email.split('@')[0];
            authorName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
        }

        let role: 'Admin' | 'Curator' | 'Member' = 'Member';
        if (isAdmin) role = 'Admin';
        else if (isCurator) role = 'Curator';

        try {
            const commentsCol = collection(db, 'archive_items', id, 'comments');
            const newDocRef = doc(commentsCol);
            const payload = {
                id: newDocRef.id,
                itemId: id,
                authorName,
                authorEmail: user.email.toLowerCase(),
                role,
                content: newCommentText.trim(),
                createdAt: new Date().toISOString(),
                status: 'approved'
            };

            await setDoc(newDocRef, payload);
            setComments(prev => [...prev, payload]);
            setNewCommentText('');
            showToast("Comment posted successfully!");
        } catch (err: any) {
            console.error("Error posting comment:", err);
            const errMsg = err?.message || '';
            if (errMsg.toLowerCase().includes('permission-denied') || err?.code === 'permission-denied') {
                showToast("Failed: Permission Denied. Check that firestore.rules are published and your account is added.");
            } else {
                showToast(`Failed to post comment: ${err?.code || err?.message || 'Unknown Error'}`);
            }
        } finally {
            setIsPostingComment(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!id) return;
        if (!window.confirm("Are you sure you want to moderate and delete this comment?")) return;

        try {
            const commentRef = doc(db, 'archive_items', id, 'comments', commentId);
            await deleteDoc(commentRef);
            setComments(prev => prev.filter(c => c.id !== commentId));
            showToast("Comment successfully moderated.");
        } catch (err: any) {
            console.error("Error deleting comment:", err);
            const errMsg = err?.message || '';
            if (errMsg.toLowerCase().includes('permission-denied') || err?.code === 'permission-denied') {
                showToast("Failed: Permission Denied. You do not have curator/admin rights to moderate this comment.");
            } else {
                showToast(`Failed to moderate comment: ${err?.code || err?.message || 'Unknown Error'}`);
            }
        }
    };

    const handlePostReply = async (e: React.FormEvent, parentId: string) => {
        e.preventDefault();
        if (!user || !user.email || !id || replyText.trim() === '') return;

        if (containsBannedWords(replyText)) {
            showToast("Your reply contains words that are not permitted on this platform. Please edit your reply and try again.");
            return;
        }

        setIsPostingReply(true);

        let authorName = user.displayName || '';
        if (isMember && memberData?.name) {
            authorName = memberData.name;
        }
        if (!authorName) {
            const prefix = user.email.split('@')[0];
            authorName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
        }

        let role: 'Admin' | 'Curator' | 'Member' = 'Member';
        if (isAdmin) role = 'Admin';
        else if (isCurator) role = 'Curator';

        try {
            const commentsCol = collection(db, 'archive_items', id, 'comments');
            const newDocRef = doc(commentsCol);
            const payload = {
                id: newDocRef.id,
                itemId: id,
                parentId,
                authorName,
                authorEmail: user.email.toLowerCase(),
                role,
                content: replyText.trim(),
                createdAt: new Date().toISOString(),
                status: 'approved'
            };

            await setDoc(newDocRef, payload);
            setComments(prev => [...prev, payload]);
            setReplyText('');
            setReplyingToCommentId(null);
            showToast("Reply posted successfully!");
        } catch (err: any) {
            console.error("Error posting reply:", err);
            const errMsg = err?.message || '';
            if (errMsg.toLowerCase().includes('permission-denied') || err?.code === 'permission-denied') {
                showToast("Failed: Permission Denied. Check your rules and account status.");
            } else {
                showToast(`Failed to post reply: ${err?.code || 'Unknown Error'}`);
            }
        } finally {
            setIsPostingReply(false);
        }
    };

    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => {
            setToastMessage(null);
        }, 3000);
    };

    useEffect(() => {
        if (!isBookmarkModalOpen) {
            setSelectedFolderId(null);
        }
    }, [isBookmarkModalOpen]);

    useEffect(() => {
        if (!user || !user.email || !hasResearchAccess || !isBookmarkModalOpen) return;
        const email = user.email.toLowerCase();

        const fetchUserFolders = async () => {
            setLoadingFolders(true);
            try {
                const foldersCol = collection(db, 'members', email, 'research_folders');
                const snap = await getDocs(foldersCol);
                const foldersData = snap.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name || '',
                    itemIds: doc.data().itemIds || []
                }));
                setUserFolders(foldersData);
            } catch (err) {
                console.error("Error fetching research folders", err);
            } finally {
                setLoadingFolders(false);
            }
        };

        fetchUserFolders();
    }, [user, hasResearchAccess, isBookmarkModalOpen]);

    const handleToggleBookmark = async (folderId: string, itemIds: string[]) => {
        if (!user || !user.email || !id) return;
        const email = user.email.toLowerCase();
        
        const isBookmarked = itemIds.includes(id);
        const updatedItemIds = isBookmarked 
            ? itemIds.filter(itemId => itemId !== id) 
            : [...itemIds, id];

        try {
            const folderRef = doc(db, 'members', email, 'research_folders', folderId);
            await updateDoc(folderRef, { itemIds: updatedItemIds });
            
            setUserFolders(prev => prev.map(f => f.id === folderId ? { ...f, itemIds: updatedItemIds } : f));
            showToast(isBookmarked ? "Removed from folder" : "Saved to research folder!");
            setIsBookmarkModalOpen(false);
        } catch (error) {
            console.error("Error updating bookmark:", error);
            showToast("Failed to update bookmark.");
        }
    };

    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !newFolderName.trim() || !id) return;
        const email = user.email.toLowerCase();

        setIsCreatingFolder(true);
        try {
            const foldersCol = collection(db, 'members', email, 'research_folders');
            const newDocRef = doc(foldersCol);
            
            await setDoc(newDocRef, {
                name: newFolderName.trim(),
                createdAt: new Date().toISOString(),
                itemIds: [id]
            });

            setUserFolders(prev => [...prev, {
                id: newDocRef.id,
                name: newFolderName.trim(),
                itemIds: [id]
            }]);

            setNewFolderName('');
            showToast("Created folder and saved item!");
        } catch (error) {
            console.error("Error creating folder:", error);
            showToast("Failed to create folder.");
        } finally {
            setIsCreatingFolder(false);
        }
    };

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
                            // Parallelize collection fetching to avoid sequential waterfall latency
                            const collSnaps = await Promise.all(cIds.map(cid => getDoc(doc(db, 'collections', cid))));
                            const colls = collSnaps
                                .filter(s => s.exists())
                                .map(s => ({ id: s.id, ...s.data() } as any));
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
                            ),
                            limit(12) // Critical: Limit fetching to avoid downloading entire collections
                        );
                    } else {
                        exploreQuery = query(
                            collection(db, 'archive_items'), 
                            where('item_type', '==', data.item_type),
                            limit(12)
                        );
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

                    // Fetch only required locations to resolve names
                    const locIds = data.museum_location_ids || (data.museum_location_id ? [data.museum_location_id] : []);
                    if (locIds.length > 0) {
                        try {
                            const locSnaps = await Promise.all(locIds.map(lid => getDoc(doc(db, 'locations', lid))));
                            const locs = locSnaps
                                .filter(s => s.exists())
                                .map(s => ({ id: s.id, docId: s.id, ...s.data() } as MuseumLocation));

                            const parentIds = Array.from(new Set(locs.filter(l => l.parent_location_id).map(l => l.parent_location_id as string)));
                            if (parentIds.length > 0) {
                                const parentSnaps = await Promise.all(parentIds.map(pid => getDoc(doc(db, 'locations', pid))));
                                const parentLocs = parentSnaps.filter(s => s.exists()).map(s => ({ id: s.id, docId: s.id, ...s.data() } as MuseumLocation));
                                locs.push(...parentLocs);
                            }

                            setAllLocations(prev => {
                                const newMap = new Map(prev.map(l => [l.docId || l.id, l]));
                                locs.forEach(l => {
                                    newMap.set(l.docId || l.id, l);
                                    if (l.id) newMap.set(l.id, l);
                                });
                                return Array.from(newMap.values());
                            });
                        } catch (err) {
                            console.error("Could not fetch specific locations", err);
                        }
                    }
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
        <div className="flex flex-col min-h-screen max-w-full mx-auto animate-in fade-in duration-500 pb-12">
            {zoomedImage && (
                <div
                    className="fixed inset-0 z-[2000] bg-charcoal/95 flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden animate-in fade-in duration-300"
                    onClick={() => {
                        setZoomedImage(null);
                        setZoomScale(1);
                        setPan({ x: 0, y: 0 });
                    }}
                >
                    {/* Controls Overlay */}
                    <div className="absolute top-8 right-8 flex items-center gap-4 z-[2100]" onClick={e => e.stopPropagation()}>
                        <div className="flex bg-white/10 backdrop-blur-md rounded-full border border-white/20 p-1 shadow-2xl">
                            <button 
                                onClick={() => {
                                    setZoomScale(prev => {
                                        const newScale = Math.max(0.5, prev - 0.25);
                                        if (newScale <= 1) setPan({ x: 0, y: 0 });
                                        return newScale;
                                    });
                                }}
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
                                setPan({ x: 0, y: 0 });
                            }}
                            className="p-3 bg-white/10 backdrop-blur-md hover:bg-red-500/40 rounded-full text-white transition-all border border-white/20 shadow-2xl group"
                        >
                            <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
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
                                <ChevronLeft size={32} strokeWidth={3} className="group-hover/nav:-translate-x-1 transition-transform" />
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
                                <ChevronRight size={32} strokeWidth={3} className="group-hover/nav:translate-x-1 transition-transform" />
                            </button>
                        </>
                    )}
                    
                    {file_urls && (file_urls.length > 1 || (item.file_captions && item.file_captions[0])) && (
                        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-charcoal/80 backdrop-blur-xl px-8 py-3 rounded-2xl border border-white/20 text-white font-black tracking-[0.4em] uppercase text-sm z-[2100] shadow-2xl text-center min-w-[200px] max-w-[80vw]">
                            {file_urls.length > 1 && (
                                <div>Page {currentImageIndex + 1} / {file_urls.length}</div>
                            )}
                            {item.file_captions && item.file_captions[currentImageIndex] && (
                                <div className={`text-[11px] font-medium tracking-normal normal-case text-white/90 ${file_urls.length > 1 ? 'mt-2 border-t border-white/20 pt-2' : ''}`}>
                                    {item.file_captions[currentImageIndex]}
                                </div>
                            )}
                        </div>
                    )}

                    <div 
                        className="relative w-full h-full overflow-hidden flex items-center justify-center p-4 md:p-20 no-scrollbar"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                setZoomedImage(null);
                                setZoomScale(1);
                                setPan({ x: 0, y: 0 });
                            }
                        }}
                        onWheel={(e) => {
                            if (zoomScale > 1) {
                                setPan(prev => ({
                                    x: prev.x - e.deltaX,
                                    y: prev.y - e.deltaY
                                }));
                            }
                        }}
                    >
                        <div 
                            className="relative flex items-center justify-center"
                            style={{ 
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`,
                                transformOrigin: 'center center',
                                cursor: isDragging ? 'grabbing' : (zoomScale > 1 ? 'grab' : 'zoom-in'),
                                transition: isDragging ? 'none' : 'transform 200ms ease-out'
                            }}
                            onClick={(e) => {
                                e.stopPropagation(); // Stop the click from bubbling up to the closing background
                                if (zoomScale === 1) {
                                    setZoomScale(2.5);
                                }
                            }}
                            onMouseDown={(e) => {
                                if (zoomScale > 1) {
                                    e.preventDefault();
                                    setIsDragging(true);
                                    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
                                }
                            }}
                            onMouseMove={(e) => {
                                if (isDragging && zoomScale > 1) {
                                    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
                                }
                            }}
                            onMouseUp={() => setIsDragging(false)}
                            onMouseLeave={() => setIsDragging(false)}
                            onTouchStart={(e) => {
                                if (zoomScale > 1 && e.touches.length === 1) {
                                    setIsDragging(true);
                                    setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
                                }
                            }}
                            onTouchMove={(e) => {
                                if (isDragging && zoomScale > 1 && e.touches.length === 1) {
                                    setPan({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y });
                                }
                            }}
                            onTouchEnd={() => setIsDragging(false)}
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

                <div className="flex gap-3 items-center">
                    {hasResearchAccess && (
                        <button
                            onClick={() => setIsBookmarkModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-tan to-tan-dark text-white rounded-lg text-sm font-medium hover:from-charcoal hover:to-charcoal transition-all shadow-sm"
                        >
                            <BookOpen size={16} /> Save to Folder
                        </button>
                    )}

                    {isSAHSUser && (
                        <>
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
                        </>
                    )}
                </div>
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
                <div className="w-full lg:w-[420px] shrink-0">
                    <div className="lg:sticky lg:top-8 space-y-4">
                        <div className="aspect-[3/4] bg-tan-light/20 rounded-2xl overflow-hidden border border-tan-light/50 relative shadow-md group">
                            {file_urls && file_urls.length > 0 ? (
                                <>
                                    <OptimizedImage
                                        src={file_urls[currentImageIndex]}
                                        alt={item.title}
                                        optimizedWidth={800}
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
                                                <ChevronLeft size={20} strokeWidth={3} />
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCurrentImageIndex(prev => (prev === file_urls.length - 1 ? 0 : prev + 1));
                                                }}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-xl flex items-center justify-center text-charcoal transition-all hover:bg-tan hover:text-white hover:scale-110 z-30 border border-tan-light/50 active:scale-95"
                                            >
                                                <ChevronRight size={20} strokeWidth={3} />
                                            </button>

                                            {/* Page Indicator */}
                                            <div className={`absolute ${item.file_captions && item.file_captions[currentImageIndex] ? 'top-4 left-4' : 'bottom-4 left-1/2 -translate-x-1/2'} bg-charcoal/70 backdrop-blur-sm text-white px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase z-20 transition-all`}>
                                                Page {currentImageIndex + 1} of {file_urls.length}
                                            </div>
                                        </>
                                    )}

                                    <div className="absolute inset-x-0 bottom-0 top-3/4 bg-gradient-to-t from-charcoal/40 to-transparent pointer-events-none z-0" />
                                    <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                        <ZoomIn size={16} className="text-white" />
                                    </div>
                                    
                                    {item.file_captions && item.file_captions[currentImageIndex] && (
                                        <div className="absolute bottom-0 left-0 right-0 bg-charcoal/80 backdrop-blur-md text-white/90 px-4 py-3 text-xs leading-relaxed z-10 border-t border-white/10 max-h-32 overflow-y-auto no-scrollbar font-sans font-medium">
                                            {item.file_captions[currentImageIndex]}
                                        </div>
                                    )}
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

                        {/* Tactile Pushpin Sticky Note Widget */}
                        {hasResearchAccess && (
                            <div className="mt-8 relative transition-all duration-300 hover:-translate-y-1">
                                {/* Pushpin graphic */}
                                <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 z-20 text-red-500 drop-shadow-[0_2px_3px_rgba(0,0,0,0.355)]">
                                    <Pin size={28} strokeWidth={2.5} fill="currentColor" className="rotate-45" />
                                </div>

                                {/* Tactile yellow paper base */}
                                <div className="bg-[#fefbbf] border-t-2 border-yellow-200/60 rounded-b-lg shadow-[0_8px_20px_rgba(0,0,0,0.15)] p-6 pt-8 flex flex-col gap-3 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/10 before:to-black/5 before:pointer-events-none">
                                    {/* Paper texture overlay */}
                                    <div className="absolute inset-0 bg-[radial-gradient(#eab308_1px,transparent_1px)] [background-size:16px_16px] opacity-[0.08] pointer-events-none" />

                                    <div className="flex justify-between items-center border-b border-yellow-300/40 pb-2">
                                        <h4 className="font-serif font-black text-sm text-[#854d0e] tracking-wider uppercase">
                                            Private Research Note
                                        </h4>
                                        <div className="flex items-center gap-1.5 text-[10px] font-sans font-bold text-[#854d0e]/60">
                                            {isSavingNote ? (
                                                <span className="flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#a16207] animate-ping" />
                                                    Saving...
                                                </span>
                                            ) : lastSavedTime ? (
                                                <span>Saved {lastSavedTime}</span>
                                            ) : (
                                                <span>Auto-saves as you type</span>
                                            )}
                                        </div>
                                    </div>

                                    <textarea
                                        value={noteContent}
                                        onChange={(e) => setNoteContent(e.target.value)}
                                        placeholder="Add transcription ideas, genealogical clues, or private notes for your historical research..."
                                        maxLength={1000}
                                        rows={4}
                                        className="w-full bg-transparent resize-none border-none outline-none font-handwriting text-2xl text-[#713f12] placeholder-[#a16207]/40 leading-relaxed font-normal no-scrollbar"
                                        style={{ fontFamily: "'Caveat', cursive, sans-serif" }}
                                    />

                                    <div className="flex justify-between items-center text-[10px] font-sans font-bold text-[#a16207]/60 mt-1">
                                        <span>✏️ Private to you</span>
                                        <span>{noteContent.length} / 1000 characters</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side: Biography & Related Docs */}
                <div className="flex-1 block lg:overflow-x-hidden lg:overflow-y-auto lg:pr-6 lg:pb-8 lg:max-h-[85vh]">
                    {/* Main Narrative Block */}
                    <div className="mb-10 bg-white border border-tan-light/50 rounded-xl p-8 md:p-12 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-tan/40"></div>
                        <h3 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 pb-4 mb-8">
                            <FileText className="text-tan" size={32} />
                            {item.item_type === 'Historic Figure' ? 'Biography' : 'Description'}
                        </h3>
                        <div className="prose prose-lg md:prose-xl max-w-none text-charcoal/90 font-sans leading-relaxed whitespace-pre-wrap break-words">
                            {item.description}
                        </div>
                    </div>

                    {/* Biography Sources Block */}
                    {item.biography_sources && (
                        <div className="mb-10 bg-tan-light/10 border border-tan-light/50 rounded-xl p-6 md:p-8 shadow-sm">
                            <h3 className="text-3xl font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 pb-3 mb-4">
                                <BookOpen className="text-tan" size={28} />
                                {item.item_type === 'Historic Figure' ? 'Biography Sources' : 'Description Sources'}
                            </h3>
                            <div className="font-sans text-[15px] text-charcoal/80 leading-relaxed whitespace-pre-wrap break-words">
                                {item.biography_sources}
                            </div>
                        </div>
                    )}

                    {/* SEAMLESS INFORMATION SECTION */}
                    <div className="mb-12">
                        <h3 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 pb-4 mb-8">
                            <Info className="text-tan" size={32} />
                            Information & Archival Details
                        </h3>

                        {item.item_type === 'Historic Figure' ? (
                            <div className={`grid grid-cols-1 ${!!(item.artifact_id || item.archive_reference || item.identifier) ? "md:grid-cols-2" : ""} gap-x-16 gap-y-12`}>
                                {/* Column 1: Identity & Life */}
                                <div className="space-y-8">
                                    <div>
                                        <h4 className="text-[11px] font-black text-tan uppercase tracking-[0.3em] mb-6 pb-2 border-b border-tan/10">Personal Identity</h4>
                                        <div className="space-y-6">
                                            {item.full_name && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Full Name</p>
                                                    <p className="text-xl font-serif text-charcoal leading-tight">{item.full_name}</p>
                                                </div>
                                            )}
                                            {(item.birth_date || item.death_date) && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Dates of Life</p>
                                                    <div className="flex flex-wrap gap-x-10 gap-y-4">
                                                        {item.birth_date && (
                                                            <div>
                                                                <span className="text-[10px] font-bold text-tan uppercase tracking-widest block mb-1">Birth</span>
                                                                <p className="text-lg font-serif text-charcoal">{item.birth_date}</p>
                                                            </div>
                                                        )}
                                                        {item.death_date && (
                                                            <div>
                                                                <span className="text-[10px] font-bold text-tan uppercase tracking-widest block mb-1">Death</span>
                                                                <p className="text-lg font-serif text-charcoal">{item.death_date}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {item.birthplace && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Birthplace</p>
                                                    <p className="text-lg font-serif text-charcoal">{item.birthplace}</p>
                                                </div>
                                            )}
                                            {item.occupation && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Primary Occupation</p>
                                                    <p className="text-lg font-serif text-charcoal">{item.occupation}</p>
                                                </div>
                                            )}
                                            {item.historical_address && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                                        <MapPin size={12} className="text-tan" /> Historical Address
                                                    </p>
                                                    <p className="text-lg font-serif text-charcoal leading-snug break-words">{item.historical_address}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Column 2: Archival Registry */}
                                {!!(item.artifact_id || item.archive_reference || item.identifier) && (
                                    <div className="space-y-8">
                                        <div>
                                            <h4 className="text-[11px] font-black text-tan uppercase tracking-[0.3em] mb-6 pb-2 border-b border-tan/10">Archival Registry</h4>
                                            <div className="space-y-6">
                                                {item.artifact_id && (
                                                    <div>
                                                        <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans text-tan">Catalog ID #</p>
                                                        <p className="text-xl font-serif font-bold text-tan">{item.artifact_id}</p>
                                                    </div>
                                                )}
                                                {(item.archive_reference || item.identifier) && (
                                                    <div>
                                                        <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Archival References</p>
                                                        <p className="text-base font-sans text-charcoal/80 leading-relaxed font-medium">
                                                            {item.archive_reference}
                                                            {item.identifier && <span className="block italic opacity-60 mt-1">{item.identifier}</span>}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-12">
                                {/* Personal / Type Facts */}
                                <div className="space-y-6">
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
                                                        <Link key={col.id} to={`/collections/${col.id}`} className="text-lg font-serif text-tan hover:underline block break-words leading-snug">
                                                            <BookOpen size={16} className="inline-block mr-1.5 -mt-1 shrink-0" />
                                                            <span>{col.title}</span>
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    {item.condition && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Condition</p>
                                            <span className="inline-block bg-tan-light/10 text-charcoal/80 px-2.5 py-0.5 rounded-full text-[12px] font-bold border border-tan-light/30 mt-1 font-sans">
                                                {item.condition}
                                            </span>
                                        </div>
                                    )}
                                    {item.date && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Origin Date</p>
                                            <p className="text-lg font-serif text-charcoal">{item.date}</p>
                                        </div>
                                    )}
                                    {item.creator && !['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Creator / Author</p>
                                            <p className="text-lg font-serif text-charcoal">{item.creator}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Column 2: Context / Donor Details */}
                                <div className="space-y-6">
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
                                                    <p className="text-lg font-serif text-charcoal leading-snug break-words">{item.historical_address}</p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Archival Tracking */}
                                <div className="space-y-6">
                                    {item.artifact_id && item.item_type !== 'Historic Organization' && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans text-tan">Catalog ID #</p>
                                            <p className="text-lg font-serif font-bold text-tan">{item.artifact_id}</p>
                                        </div>
                                    )}
                                    {(item.archive_reference || item.identifier) && item.item_type !== 'Historic Organization' && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Archival References</p>
                                            <p className="text-sm font-sans text-charcoal/80 leading-relaxed font-medium">
                                                {item.archive_reference}
                                                {item.identifier && <span className="block italic opacity-60 mt-0.5">{item.identifier}</span>}
                                            </p>
                                        </div>
                                    )}
                                    {item.physical_location && item.item_type !== 'Historic Organization' && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                                <MapPin size={12} className="text-tan" /> Origin / Location
                                            </p>
                                            <p className="text-[15px] font-sans text-charcoal leading-snug break-words">{item.physical_location}</p>
                                        </div>
                                    )}
                                    {item.historical_address && !['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                                <MapPin size={12} className="text-tan" /> Historical Address
                                            </p>
                                            <p className="text-[15px] font-sans text-charcoal leading-snug break-words">{item.historical_address}</p>
                                        </div>
                                    )}
                                    {(item.museum_location_id || item.museum_location || isSAHSUser) && item.item_type !== 'Historic Organization' && (
                                        <div>
                                            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-2 mb-2">
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] font-sans flex-1 min-w-[120px]">Physical Museum Shelf/Box</p>
                                                {isSAHSUser && !isEditingLocation && (
                                                    <button onClick={handleEditLocationClick} className="text-[10px] text-tan hover:text-tan-light bg-tan/10 px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 transition-colors shrink-0">
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
                                                                const locObj = allLocations.find(l => l.id === locId || l.docId === locId);
                                                                let breadcrumbText = locObj?.name || 'Loading location...';
                                                                
                                                                if (locObj?.parent_location_id) {
                                                                    const parentObj = allLocations.find(l => l.docId === locObj.parent_location_id);
                                                                    if (parentObj) {
                                                                        breadcrumbText = `${parentObj.name} > ${locObj.name}`;
                                                                    }
                                                                }

                                                                return (
                                                                    <Link key={locId} to={`/locations/${locId}`} className="text-lg font-serif text-tan hover:underline block break-words leading-snug">
                                                                        <MapPin size={18} className="inline-block mr-1.5 -mt-1 shrink-0" />
                                                                        <span>{breadcrumbText}</span>
                                                                    </Link>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p className="text-lg font-serif text-charcoal/40 italic">Not currently placed on museum blueprint</p>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Historical Comments & Public Discussions (Full Width) */}
            <div className="mt-16 pt-12 border-t border-tan-light/50 w-full">
                <h3 className="text-3xl font-serif font-bold text-charcoal flex items-center gap-3 border-b border-tan-light/50 pb-4 mb-8">
                    <Users className="text-tan" size={32} />
                    Historical Discussions
                    <span className="bg-tan/10 text-tan text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider font-sans">
                        {comments.length} Comments
                    </span>
                </h3>

                {/* Comments Thread */}
                {loadingComments ? (
                    <div className="py-12 text-center font-serif text-charcoal/50 italic flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                        Loading discussions...
                    </div>
                ) : comments.length === 0 ? (
                    <div className="text-center py-12 bg-cream/30 rounded-2xl border border-dashed border-tan-light/50 mb-10 max-w-4xl mx-auto">
                        <p className="font-serif text-charcoal/50 italic text-base">No comments have been posted yet. Be the first to share an annotation or question!</p>
                    </div>
                ) : (
                    <div className="space-y-8 mb-10 max-w-4xl mx-auto max-h-[600px] overflow-y-auto pr-4 no-scrollbar">
                        {(() => {
                            const parentComments = comments.filter(c => !c.parentId);
                            return parentComments.map(c => {
                                const isAuthor = user && user.email && user.email.toLowerCase() === c.authorEmail.toLowerCase();
                                const canDelete = isSAHSUser || isAuthor;
                                const replies = comments.filter(reply => reply.parentId === c.id);

                                return (
                                    <div key={c.id} className="space-y-5 border-b border-tan-light/20 pb-6 last:border-0 last:pb-0">
                                        {/* Parent Comment Card */}
                                        <div className="bg-white border border-tan-light/40 rounded-xl p-5 md:p-6 shadow-xs flex gap-5 transition-all hover:border-tan-light/70 relative group">
                                            {/* Monogram Avatar */}
                                            <div className="w-12 h-12 rounded-full bg-tan/10 border border-tan/20 flex items-center justify-center shrink-0">
                                                <span className="font-serif font-black text-base text-tan-dark">
                                                    {c.authorName.charAt(0).toUpperCase()}
                                                </span>
                                            </div>

                                            {/* Content Block */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                                                    <span className="font-serif font-bold text-[15px] text-charcoal truncate">{c.authorName}</span>
                                                    
                                                    {/* Role Badge */}
                                                    {c.role === 'Admin' ? (
                                                        <span className="bg-red-50 text-red-700 border border-red-200/50 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full font-sans">
                                                            🌟 Admin
                                                        </span>
                                                    ) : c.role === 'Curator' ? (
                                                        <span className="bg-tan/10 text-tan-dark border border-tan/20 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full font-sans">
                                                            🌟 Curator
                                                        </span>
                                                    ) : (
                                                        <span className="bg-charcoal/5 text-charcoal/70 border border-charcoal/10 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full font-sans">
                                                            📜 Member
                                                        </span>
                                                    )}

                                                    <div className="text-xs text-charcoal/40 font-sans ml-auto flex items-center gap-3">
                                                        <span>{new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                        
                                                        {/* Reply Trigger Icon */}
                                                        {hasResearchAccess && (
                                                            <button
                                                                onClick={() => {
                                                                    if (replyingToCommentId === c.id) {
                                                                        setReplyingToCommentId(null);
                                                                    } else {
                                                                        setReplyingToCommentId(c.id);
                                                                        setReplyText('');
                                                                    }
                                                                }}
                                                                className={`p-1 hover:bg-tan/10 rounded-lg text-charcoal/50 hover:text-tan transition-all flex items-center gap-1 ${
                                                                    replyingToCommentId === c.id ? 'text-tan bg-tan/10' : ''
                                                                }`}
                                                                title="Reply to comment"
                                                            >
                                                                <CornerUpLeft size={14} />
                                                            </button>
                                                        )}

                                                        {canDelete && (
                                                            <button
                                                                onClick={() => handleDeleteComment(c.id)}
                                                                className="p-1 hover:bg-red-50 rounded-lg text-charcoal/40 hover:text-red-600 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                                                title={isAuthor ? "Delete comment" : "Moderate comment (Admin)"}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-[15px] font-sans text-charcoal/90 leading-relaxed break-words whitespace-pre-wrap">
                                                    {c.content}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Nested Threaded Replies */}
                                        {replies.length > 0 && (
                                            <div className="pl-10 md:pl-14 border-l-2 border-tan/20 space-y-4 ml-6">
                                                {replies.map(reply => {
                                                    const isReplyAuthor = user && user.email && user.email.toLowerCase() === reply.authorEmail.toLowerCase();
                                                    const canDeleteReply = isSAHSUser || isReplyAuthor;

                                                    return (
                                                        <div key={reply.id} className="bg-tan-light/5 border border-tan-light/30 rounded-xl p-4 md:p-5 shadow-2xs flex gap-4 transition-all hover:border-tan-light/60 relative group">
                                                            {/* Monogram Avatar */}
                                                            <div className="w-10 h-10 rounded-full bg-tan/10 border border-tan/20 flex items-center justify-center shrink-0">
                                                                <span className="font-serif font-black text-sm text-tan-dark">
                                                                    {reply.authorName.charAt(0).toUpperCase()}
                                                                </span>
                                                            </div>

                                                            {/* Content Block */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5">
                                                                    <span className="font-serif font-bold text-[14px] text-charcoal truncate">{reply.authorName}</span>
                                                                    
                                                                    {/* Role Badge */}
                                                                    {reply.role === 'Admin' ? (
                                                                        <span className="bg-red-50 text-red-700 border border-red-200/50 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full font-sans">
                                                                            🌟 Admin
                                                                        </span>
                                                                    ) : reply.role === 'Curator' ? (
                                                                        <span className="bg-tan/10 text-tan-dark border border-tan/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full font-sans">
                                                                            🌟 Curator
                                                                        </span>
                                                                    ) : (
                                                                        <span className="bg-charcoal/5 text-charcoal/70 border border-charcoal/10 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full font-sans">
                                                                            📜 Member
                                                                        </span>
                                                                    )}

                                                                    <div className="text-xs text-charcoal/40 font-sans ml-auto flex items-center gap-2">
                                                                        <span>{new Date(reply.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                                        {canDeleteReply && (
                                                                            <button
                                                                                onClick={() => handleDeleteComment(reply.id)}
                                                                                className="p-1 hover:bg-red-50 rounded-lg text-charcoal/40 hover:text-red-600 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                                                                title={isReplyAuthor ? "Delete reply" : "Moderate reply (Admin)"}
                                                                            >
                                                                                <Trash2 size={13} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <p className="text-[14px] font-sans text-charcoal/80 leading-relaxed break-words whitespace-pre-wrap">
                                                                    {reply.content}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Inline Reply Input Area */}
                                        {replyingToCommentId === c.id && (
                                            <div className="pl-10 md:pl-14 ml-6 border-l-2 border-tan/20 animate-in slide-in-from-top-2 duration-300">
                                                <form onSubmit={(e) => handlePostReply(e, c.id)} className="bg-tan-light/10 p-5 rounded-xl border border-tan-light/50 flex gap-4 items-start">
                                                    <div className="w-10 h-10 rounded-full bg-charcoal text-cream flex items-center justify-center shrink-0 font-serif font-bold text-sm">
                                                        {user?.email?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 flex flex-col gap-3">
                                                        <textarea
                                                            value={replyText}
                                                            onChange={(e) => setReplyText(e.target.value)}
                                                            placeholder={`Write a reply to ${c.authorName}...`}
                                                            rows={2}
                                                            maxLength={500}
                                                            className="w-full bg-white border border-tan-light/60 p-3 rounded-lg text-sm outline-none focus:border-tan font-sans leading-relaxed resize-none shadow-2xs"
                                                            required
                                                        />
                                                        <div className="flex justify-between items-center text-[10px] font-sans font-bold text-charcoal/40">
                                                            <span>💬 Replying as {isMember ? 'Verified Member' : 'Curator/Admin'}</span>
                                                            <div className="flex items-center gap-3">
                                                                    <span>{replyText.length} / 500 characters</span>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setReplyingToCommentId(null)}
                                                                        className="px-3 py-1.5 border border-charcoal/20 hover:bg-black/5 text-charcoal font-bold rounded-lg text-xs transition-all"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        type="submit"
                                                                        disabled={isPostingReply || replyText.trim() === ''}
                                                                        className="px-4 py-1.5 bg-gradient-to-r from-tan to-tan-dark text-white font-bold rounded-lg text-xs transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                                                    >
                                                                        {isPostingReply ? 'Replying...' : 'Post Reply'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </form>
                                            </div>
                                        )}
                                    </div>
                                );
                            });
                        })()}
                    </div>
                )}

                {/* Reply / Post Comment Box */}
                <div className="max-w-4xl mx-auto">
                    {hasResearchAccess ? (
                        <form onSubmit={handlePostComment} className="flex gap-5 items-start bg-tan-light/10 p-6 rounded-2xl border border-tan-light/50">
                            {/* Avatar */}
                            <div className="w-12 h-12 rounded-full bg-charcoal text-cream flex items-center justify-center shrink-0 font-serif font-bold text-base">
                                {user?.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 flex flex-col gap-4">
                                <textarea
                                    value={newCommentText}
                                    onChange={(e) => setNewCommentText(e.target.value)}
                                    placeholder="Share historical context, source leads, or collaborative notes about this record..."
                                    rows={4}
                                    maxLength={800}
                                    className="w-full bg-white border border-tan-light/60 p-4 rounded-xl text-sm outline-none focus:border-tan font-sans leading-relaxed resize-none shadow-xs"
                                    required
                                />
                                <div className="flex justify-between items-center text-[10px] font-sans font-bold text-charcoal/40">
                                    <span>💬 Posting publicly as {isMember ? 'Verified Member' : 'Curator/Admin'}</span>
                                    <div className="flex items-center gap-3">
                                        <span>{newCommentText.length} / 800 characters</span>
                                        <button
                                            type="submit"
                                            disabled={isPostingComment || newCommentText.trim() === ''}
                                            className="px-6 py-2.5 bg-gradient-to-r from-tan to-tan-dark text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 disabled:opacity-50"
                                        >
                                            {isPostingComment ? 'Posting...' : 'Post Comment'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    ) : (
                        <div className="bg-gradient-to-br from-cream to-white border border-tan-light rounded-2xl p-8 text-center shadow-xs flex flex-col items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-tan/10 flex items-center justify-center text-tan">
                                <Lock size={20} />
                            </div>
                            <h4 className="font-serif font-bold text-lg text-charcoal">Join the Historical Circle</h4>
                            <p className="text-charcoal/60 font-sans text-xs max-w-sm leading-relaxed">
                                Only verified, active members of the Senoia Area Historical Society can post comments and contribute transcript annotations. Visitors are welcome to read existing comments.
                            </p>
                            <div className="flex gap-4 mt-2">
                                <Link
                                    to="/login"
                                    className="px-6 py-2.5 bg-charcoal hover:bg-tan text-white font-bold rounded-xl text-xs transition-all shadow-sm font-sans"
                                >
                                    Log In / Sign Up
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
{/* RELATED ITEMS DROP TAB */}
                    {(relatedFigureItems.length > 0 || relatedDocumentItems.length > 0 || relatedOrganizationItems.length > 0) && (
                        <div className="mt-16">
                            <button 
                                onClick={() => setShowLinkedItems(!showLinkedItems)}
                                className="w-full flex items-center justify-center gap-4 py-4 border-t border-tan-light/30 group hover:bg-tan-light/5 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Link2 className="text-tan" size={28} />
                                    <span className="text-3xl font-serif font-bold text-charcoal">Connected Archive Items</span>
                                    <span className="bg-tan/10 text-tan text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest font-sans">
                                        {relatedFigureItems.length + relatedDocumentItems.length + relatedOrganizationItems.length} Records
                                    </span>
                                </div>
                                <div className={`transition-transform duration-300 ${showLinkedItems ? 'rotate-180' : ''}`}>
                                    <ChevronDown className="text-tan" size={32} />
                                </div>
                            </button>

                            {showLinkedItems && (
                                <div className="py-10 animate-in slide-in-from-top-4 fade-in duration-300 space-y-12">
                                    {relatedDocumentItems.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-6 flex items-center justify-center gap-2 font-sans">
                                                <FileText size={14} /> Documents & Artifacts
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                                {relatedDocumentItems.map(relItem => (
                                                    <DocumentCard 
                                                        key={relItem.id} 
                                                        item={relItem} 
                                                        galleryIds={relatedDocumentItems.map(i => i.id || '')} 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {relatedOrganizationItems.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-6 flex items-center justify-center gap-2 font-sans">
                                                <Users size={14} /> Related Organizations
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                                {relatedOrganizationItems.map(relItem => (
                                                    <DocumentCard 
                                                        key={relItem.id} 
                                                        item={relItem} 
                                                        galleryIds={relatedOrganizationItems.map(i => i.id || '')} 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {relatedFigureItems.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-6 flex items-center justify-center gap-2 font-sans">
                                                <User size={14} /> Related Historical Figures
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                                {relatedFigureItems.map(relItem => (
                                                    <DocumentCard 
                                                        key={relItem.id} 
                                                        item={relItem} 
                                                        galleryIds={relatedFigureItems.map(i => i.id || '')} 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

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
            {/* Bookmark Modal */}
            {isBookmarkModalOpen && (
                <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div 
                        className="bg-cream border border-tan/30 w-full max-w-md rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 animate-in zoom-in duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center border-b border-tan/20 pb-4">
                            <div className="flex items-center gap-2">
                                <BookOpen className="text-tan" size={24} />
                                <h3 className="font-serif font-bold text-xl text-charcoal">Save to My Research</h3>
                            </div>
                            <button 
                                onClick={() => setIsBookmarkModalOpen(false)}
                                className="p-2 hover:bg-black/5 rounded-full text-charcoal/60 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* List Existing Folders */}
                        <div className="flex-1 max-h-[250px] overflow-y-auto pr-2 no-scrollbar space-y-3">
                            <p className="text-[11px] font-black text-tan uppercase tracking-[0.2em] mb-2 font-sans">Select a Research Folder</p>
                            {loadingFolders ? (
                                <div className="py-6 text-center text-charcoal/60 font-serif italic">Loading folders...</div>
                            ) : userFolders.length === 0 ? (
                                <div className="py-6 text-center text-charcoal/40 text-sm font-sans italic border border-dashed border-tan/30 rounded-xl">
                                    No folders created yet. Create one below to begin organizing your research.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {userFolders.map(folder => {
                                        const isBookmarked = folder.itemIds.includes(id || '');
                                        const isSelected = folder.id === selectedFolderId;
                                        return (
                                            <button
                                                key={folder.id}
                                                onClick={() => setSelectedFolderId(isSelected ? null : folder.id)}
                                                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                                                    isSelected
                                                        ? 'bg-tan/10 border-tan text-tan font-bold'
                                                        : 'bg-white hover:bg-tan-light/10 border-tan-light/40 text-charcoal hover:border-tan/40'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-lg">📁</span>
                                                    <div>
                                                        <p className="font-serif leading-snug">
                                                            {folder.name}
                                                            {isBookmarked && (
                                                                <span className="ml-2 text-[9px] bg-tan/20 text-tan-dark px-1.5 py-0.5 rounded font-sans uppercase font-black tracking-wider">
                                                                    Saved
                                                                </span>
                                                            )}
                                                        </p>
                                                        <p className="text-[10px] text-charcoal/40 font-mono tracking-wider mt-0.5">{folder.itemIds.length} bookmarked items</p>
                                                    </div>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                                    isSelected 
                                                        ? 'bg-tan border-tan text-white' 
                                                        : 'border-tan-light/80 bg-white'
                                                }`}>
                                                    {isSelected && <span className="text-[10px]">✓</span>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Explicit Confirm Button */}
                        {selectedFolderId && (() => {
                            const selectedFolder = userFolders.find(f => f.id === selectedFolderId);
                            const isBookmarked = selectedFolder?.itemIds.includes(id || '');
                            return (
                                <button
                                    onClick={() => selectedFolder && handleToggleBookmark(selectedFolder.id, selectedFolder.itemIds)}
                                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-[0.98] animate-in slide-in-from-bottom-2 duration-300 ${
                                        isBookmarked 
                                            ? 'bg-red-500 hover:bg-red-600 text-white' 
                                            : 'bg-gradient-to-r from-tan to-tan-dark text-white hover:from-charcoal hover:to-charcoal'
                                    }`}
                                >
                                    <BookOpen size={16} />
                                    {isBookmarked ? (
                                        <>Remove from "{selectedFolder?.name}"</>
                                    ) : (
                                        <>Save to "{selectedFolder?.name}"</>
                                    )}
                                </button>
                            );
                        })()}

                        {/* Create New Folder Form */}
                        <form onSubmit={handleCreateFolder} className="border-t border-tan/20 pt-6 mt-2 flex flex-col gap-3">
                            <p className="text-[11px] font-black text-tan uppercase tracking-[0.2em] font-sans">Create a New Folder</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="e.g. Senoia Families, Civil War Documents"
                                    value={newFolderName}
                                    onChange={e => setNewFolderName(e.target.value)}
                                    className="flex-1 bg-white border border-tan-light/50 p-2.5 rounded-xl text-sm outline-none focus:border-tan font-sans"
                                    disabled={isCreatingFolder}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="bg-charcoal text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-tan transition-all font-sans whitespace-nowrap shadow-sm"
                                    disabled={isCreatingFolder}
                                >
                                    {isCreatingFolder ? 'Creating...' : 'Create & Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Toast Message Notification */}
            {toastMessage && (
                <div className="fixed bottom-8 right-8 z-[2500] bg-charcoal text-cream border border-tan/30 px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300 font-serif font-semibold text-[15px]">
                    <span className="text-xl">✨</span>
                    <span>{toastMessage}</span>
                </div>
            )}
        </div>
    );
}
