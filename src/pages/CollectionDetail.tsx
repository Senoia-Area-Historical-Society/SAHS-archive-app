import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, FolderOpen, Image as ImageIcon, Lock, Users, Plus, X, Search, CheckCircle, Minus, Edit2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, or, arrayUnion, arrayRemove } from 'firebase/firestore';
import { DocumentCard } from '../components/DocumentCard';
import { CollectionGridImage } from '../components/CollectionGridImage';
import type { Collection, ArchiveItem } from '../types/database';

export function CollectionDetail() {
    const { id } = useParams();
    const [collectionData, setCollectionData] = useState<Collection | null>(null);
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const { isSAHSUser } = useAuth();
    
    // Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [allOtherItems, setAllOtherItems] = useState<ArchiveItem[]>([]);
    const [allCollections, setAllCollections] = useState<Collection[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [isAdding, setIsAdding] = useState(false);


    useEffect(() => {
        const fetchCollectionAndItems = async () => {
            if (!id) return;
            try {
                // Fetch collection details
                const docRef = doc(db, 'collections', id);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    setCollectionData({ id: docSnap.id, ...docSnap.data() } as Collection);
                } else {
                    console.error("No such collection!");
                }

                // Fetch items in this collection
                const q = query(
                    collection(db, 'archive_items'), 
                    or(where('collection_id', '==', id), where('collection_ids', 'array-contains', id))
                );
                
                const querySnapshot = await getDocs(q);
                const itemsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArchiveItem[];
                
                // Sort client-side to avoid needing a Firestore composite index
                itemsData.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
                
                // Filter private items for non-SAHS users
                if (!isSAHSUser) {
                    setItems(itemsData.filter(i => !i.is_private));
                } else {
                    setItems(itemsData);
                }
            } catch (error) {
                console.error("Error fetching collection details:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCollectionAndItems();
    }, [id, isSAHSUser]);

    const handleOpenAddModal = async () => {
        setIsAddModalOpen(true);
        setSearchQuery("");
        setSelectedItemIds(new Set());
        
        try {
            // Fetch all items
            const itemsSnap = await getDocs(query(collection(db, 'archive_items')));
            const allItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ArchiveItem));
            
            // Filter out items already in this collection
            setAllOtherItems(allItems.filter(item => {
                const legacyMatch = item.collection_id === id;
                const arrayMatch = id ? item.collection_ids?.includes(id) : false;
                return !(legacyMatch || arrayMatch);
            }));

            // Fetch all collections for warning context
            const colsSnap = await getDocs(query(collection(db, 'collections')));
            setAllCollections(colsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Collection)));
        } catch (error) {
            console.error("Failed to load items for modal", error);
        }
    };

    const toggleItemSelection = (item: ArchiveItem) => {
        if (selectedItemIds.has(item.id || '')) {
            const next = new Set(selectedItemIds);
            next.delete(item.id || '');
            setSelectedItemIds(next);
        } else {
            const next = new Set(selectedItemIds);
            next.add(item.id || '');
            setSelectedItemIds(next);
        }
    };

    const handleAddSelectedItems = async () => {
        if (!id || selectedItemIds.size === 0) return;
        setIsAdding(true);
        try {
            const promises = Array.from(selectedItemIds).map(itemId => 
                updateDoc(doc(db, 'archive_items', itemId), { 
                    collection_ids: arrayUnion(id)
                })
            );
            await Promise.all(promises);
            
            // Refresh current items
            const q = query(
                collection(db, 'archive_items'), 
                or(where('collection_id', '==', id), where('collection_ids', 'array-contains', id))
            );
            const querySnapshot = await getDocs(q);
            const itemsData = querySnapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as ArchiveItem[];
            itemsData.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
            
            if (!isSAHSUser) {
                setItems(itemsData.filter(i => !i.is_private));
            } else {
                setItems(itemsData);
            }
            
            setIsAddModalOpen(false);
        } catch (error) {
            console.error("Error updating items:", error);
            alert("Failed to add items to collection.");
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemoveItem = async (itemId: string, event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        
        if (!window.confirm("Are you sure you want to remove this item from the collection? (It will not be deleted from the archive)")) {
            return;
        }
        
        try {
            await updateDoc(doc(db, 'archive_items', itemId), { 
                collection_id: null,
                collection_ids: arrayRemove(id)
            });
            setItems(prev => prev.filter(item => item.id !== itemId));
        } catch (error) {
            console.error("Error removing item:", error);
            alert("Failed to remove item.");
        }
    };

    const filteredOtherItems = useMemo(() => {
        const lowerQ = searchQuery.toLowerCase();
        if (!lowerQ) return allOtherItems.slice(0, 50); // limit to 50 when no query
        return allOtherItems.filter(item => 
            (item.title && item.title.toLowerCase().includes(lowerQ)) ||
            (item.id && item.id.toLowerCase().includes(lowerQ)) ||
            (item.artifact_id && item.artifact_id.toLowerCase().includes(lowerQ)) ||
            (item.archive_reference && item.archive_reference.toLowerCase().includes(lowerQ)) ||
            (item.item_type && item.item_type.toLowerCase().includes(lowerQ))
        ).slice(0, 50);
    }, [searchQuery, allOtherItems]);

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading collection...</div>;
    }

    if (!collectionData || (collectionData.is_private && !isSAHSUser)) {
        return (
            <div className="max-w-6xl mx-auto py-12 text-center">
                <h2 className="text-2xl font-serif text-charcoal mb-4">
                    {!collectionData ? "Collection not found" : "Unauthorized: This collection is private"}
                </h2>
                <Link to="/collections" className="text-tan hover:text-charcoal transition-colors">
                    &larr; Back to Collections
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-full mx-auto h-full flex flex-col animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-6">
                <Link to="/collections" className="inline-flex items-center text-sm font-bold text-tan uppercase tracking-wider hover:text-charcoal transition-colors">
                    <ChevronLeft size={16} className="mr-1" /> Back to Collections
                </Link>
                {isSAHSUser && (
                    <Link to={`/edit-collection/${collectionData.id}`} className="inline-flex items-center gap-2 text-sm font-bold bg-tan/10 text-tan hover:bg-tan hover:text-white px-4 py-2 rounded-lg transition-colors">
                        <Edit2 size={16} /> Edit Collection
                    </Link>
                )}
            </div>

            <div className="bg-white rounded-2xl border border-tan-light/50 overflow-hidden mb-10 shadow-sm flex flex-col md:flex-row">
                <div className="md:w-1/3 bg-tan-light/20 relative min-h-[250px] md:min-h-full flex-shrink-0">
                    <CollectionGridImage 
                        collectionId={collectionData.id}
                        fallbackImage={collectionData.featured_image_url || collectionData.file_urls?.[0]}
                        items={items}
                    />
                </div>
                
                <div className="p-8 md:p-10 flex-1 flex flex-col justify-center">
                    <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4 text-charcoal tracking-tight">
                        {collectionData.title}
                    </h1>
                    <p className="text-charcoal/70 text-lg max-w-3xl leading-relaxed whitespace-pre-wrap">
                        {collectionData.description || "No description provided."}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-4 text-sm font-bold text-charcoal/50 uppercase tracking-wider">
                            <span className="flex items-center gap-2"><ImageIcon size={16} /> {items.length} Items</span>
                        </div>
                        {collectionData.is_private && isSAHSUser && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                <Lock size={12} /> Private Collection
                            </div>
                        )}
                        {!collectionData.is_private && isSAHSUser && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 border border-green-100 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                <Users size={12} /> Public Collection
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-serif font-bold text-charcoal tracking-tight flex items-center gap-3">
                    Items in this Collection
                    <span className="bg-tan/10 text-tan text-sm py-1 px-3 rounded-full font-sans">{items.length}</span>
                </h2>
                {isSAHSUser && (
                    <button 
                        onClick={handleOpenAddModal}
                        className="bg-tan text-white px-4 py-2 rounded-lg font-bold hover:bg-charcoal transition-colors flex items-center gap-2 shadow-sm text-sm"
                    >
                        <Plus size={16} /> Add Existing Items
                    </button>
                )}
            </div>

            <div className="flex-1">
                {items.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                        {items.map(item => (
                            <div key={item.id} className="relative group">
                                <DocumentCard item={item} galleryIds={items.map(i => i.id || '')} collectionId={id} />
                                {isSAHSUser && (
                                    <button 
                                        onClick={(e) => handleRemoveItem(item.id || '', e)}
                                        className="absolute top-3 right-3 p-2 bg-charcoal/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-red-500 shadow-md"
                                        title="Remove from Collection"
                                    >
                                        <Minus size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-cream/30 rounded-xl border border-tan-light/50 shadow-sm">
                        <FolderOpen size={48} className="mx-auto text-tan/30 mb-4" />
                        <p className="text-charcoal-light text-xl font-serif mb-2 text-charcoal/70">No items available.</p>
                        <p className="text-charcoal-light/60 font-sans max-w-md mx-auto">There are currently no items added to this collection.</p>
                    </div>
                )}
            </div>

            {/* Add Items Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl relative">
                        <div className="p-6 border-b border-tan-light/30 flex justify-between items-center bg-cream/30 rounded-t-2xl">
                            <h2 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2">
                                <Plus size={24} className="text-tan" /> Add to Collection
                            </h2>
                            <button 
                                onClick={() => setIsAddModalOpen(false)}
                                className="text-charcoal/50 hover:text-charcoal transition-colors p-2 hover:bg-white rounded-full shadow-sm"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 flex-1 overflow-hidden flex flex-col">
                            <div className="relative mb-6">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={20} />
                                <input
                                    type="text"
                                    placeholder="Search archive items by title, ID, or type..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-white border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all font-sans text-charcoal shadow-sm"
                                    autoFocus
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 space-y-2 minimal-scrollbar">
                                {allOtherItems.length === 0 ? (
                                    <div className="text-center py-12 text-charcoal/50 italic">
                                        Loading items...
                                    </div>
                                ) : filteredOtherItems.length === 0 ? (
                                    <div className="text-center py-12 text-charcoal/50 italic">
                                        No items found matching your search.
                                    </div>
                                ) : (
                                    filteredOtherItems.map(item => {
                                        const isSelected = selectedItemIds.has(item.id || '');
                                        const ownerCollection = item.collection_id ? allCollections.find(c => c.id === item.collection_id) : null;
                                        return (
                                            <div 
                                                key={item.id}
                                                onClick={() => toggleItemSelection(item)}
                                                className={`p-3 rounded-lg border flex items-center gap-4 cursor-pointer transition-all ${isSelected ? 'border-tan bg-tan/5' : 'border-tan-light/30 hover:border-tan/50 hover:bg-cream/20'}`}
                                            >
                                                <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isSelected ? 'bg-tan border-tan text-white' : 'border-charcoal/30 bg-white'}`}>
                                                    {isSelected && <CheckCircle size={14} className="stroke-[3]" />}
                                                </div>
                                                {item.featured_image_url || (item.file_urls && item.file_urls.length > 0) ? (
                                                    <img src={item.featured_image_url || item.file_urls![0]} alt={item.title} className="w-10 h-10 object-cover rounded shadow-sm" />
                                                ) : (
                                                    <div className="w-10 h-10 bg-cream flex items-center justify-center rounded text-tan shadow-sm"><ImageIcon size={16} /></div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-charcoal truncate">{item.title}</h3>
                                                    <p className="text-xs text-charcoal/60 truncate flex items-center gap-2">
                                                        {(item.artifact_id || item.archive_reference) && (
                                                            <span className="font-mono text-[10px] bg-tan/10 text-tan px-1.5 py-0.5 rounded font-bold">
                                                                {item.artifact_id || item.archive_reference}
                                                            </span>
                                                        )}
                                                        <span>{item.item_type}</span>
                                                        {ownerCollection && (
                                                            <span className="text-amber-600 font-bold flex items-center gap-1">
                                                                &bull; In: {ownerCollection.title}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="p-6 border-t border-tan-light/30 bg-cream/30 rounded-b-2xl flex justify-between items-center">
                            <span className="text-sm font-bold text-charcoal/60">
                                {selectedItemIds.size} item{selectedItemIds.size !== 1 ? 's' : ''} selected
                            </span>
                            <div className="flex space-x-3">
                                <button 
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-6 py-2 rounded-xl font-bold text-charcoal bg-white border border-charcoal/10 hover:bg-charcoal/5 transition-colors shadow-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddSelectedItems}
                                    disabled={selectedItemIds.size === 0 || isAdding}
                                    className="px-6 py-2 rounded-xl font-bold text-white bg-tan hover:bg-charcoal transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                                >
                                    {isAdding ? "Adding..." : "Add to Collection"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
