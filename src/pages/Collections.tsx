import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import type { Collection } from '../types/database';

export function Collections() {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const { isSAHSUser } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchCollections = async () => {
            try {
                const q = query(collection(db, 'collections'), orderBy('created_at', 'desc'));
                const querySnapshot = await getDocs(q);

                const collectionsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Collection[];

                setCollections(collectionsData);
            } catch (error) {
                console.error("Error fetching collections:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCollections();
    }, []);

    const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
        e.preventDefault(); // Stop Link navigation

        const isConfirmed = window.confirm(`Are you sure you want to delete the "${title}" collection?\n\nThe items in this collection will NOT be deleted, but they will no longer belong to this collection. This action cannot be undone.`);

        if (!isConfirmed) return;

        try {
            await deleteDoc(doc(db, 'collections', id));
            setCollections(prev => prev.filter(c => c.id !== id));
        } catch (error) {
            console.error("Error deleting collection:", error);
            alert("Failed to delete the collection. Please try again.");
        }
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-8 border-b border-tan-light/50 pb-6 pr-4">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <FolderOpen className="text-tan" size={32} />
                        Curated Collections
                    </h1>
                    <p className="text-charcoal/70 text-lg max-w-2xl">
                        Explore groups of curated items categorized by specific themes, time periods, or historical events for deeper context.
                    </p>
                </div>

                {isSAHSUser && (
                    <button
                        onClick={() => navigate('/add-collection')}
                        className="bg-tan text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium hover:bg-charcoal transition-colors hover:scale-[1.02] active:scale-[0.98] shadow-sm ml-4 whitespace-nowrap"
                    >
                        <Plus size={18} /> Add Collection
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex-1 flex justify-center items-center text-charcoal/60 font-serif text-lg">
                    Loading collections...
                </div>
            ) : collections.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-cream/30 rounded-2xl border border-tan-light/50">
                    <FolderOpen size={48} className="text-tan/30 mb-4" />
                    <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">No Collections Found</h3>
                    <p className="text-charcoal/60 max-w-md">There are currently no curated collections available. Check back later as we organize more of our archives.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
                    {collections.map((col) => (
                        <Link
                            key={col.id}
                            to={`/collections/${col.id}`}
                            className="group flex flex-col bg-white rounded-xl border border-tan-light/50 overflow-hidden hover:shadow-md transition-all duration-300 hover:border-tan/40"
                        >
                            <div className="aspect-[16/9] bg-tan-light/20 relative overflow-hidden">
                                {col.featured_image_url || col.file_urls?.[0] || col.cover_image_url ? (
                                    <img
                                        src={col.featured_image_url || col.file_urls?.[0] || col.cover_image_url}
                                        alt={col.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-tan-light bg-charcoal/5">
                                        <FolderOpen size={48} className="opacity-20" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-charcoal/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                                {isSAHSUser && (
                                    <button
                                        onClick={(e) => handleDelete(e, col.id, col.title)}
                                        className="absolute top-3 right-3 p-2 bg-red-600/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-sm z-10"
                                        title="Delete Collection"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}

                                <div className="absolute bottom-4 left-4 right-4">
                                    <h2 className="text-xl font-serif font-bold text-white mb-1 line-clamp-2 leading-tight">
                                        {col.title}
                                    </h2>
                                </div>
                            </div>

                            <div className="p-5 flex-1 flex flex-col">
                                <p className="text-sm text-charcoal/70 line-clamp-3 mb-4 flex-1">
                                    {col.description || "No description provided."}
                                </p>
                                <div className="mt-auto flex items-center text-xs font-bold text-tan uppercase tracking-wider group-hover:text-charcoal transition-colors">
                                    View Collection &rarr;
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
