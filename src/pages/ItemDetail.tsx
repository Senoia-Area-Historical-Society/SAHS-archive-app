import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Edit2, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { DocumentCard } from '../components/DocumentCard';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, limit, getDocs, deleteDoc, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { ArchiveItem } from '../types/database';

export function ItemDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isSAHSUser } = useAuth();

    const [item, setItem] = useState<ArchiveItem | null>(null);
    const [relatedItems, setRelatedItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const fetchItemAndRelated = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'archive_items', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...(docSnap.data() || {}) } as ArchiveItem;
                    setItem(data);

                    // Fetch a couple of docs to serve as related, based on overlapping tags if possible
                    if (data.tags && data.tags.length > 0) {
                        const relatedQuery = query(collection(db, 'archive_items'), where('tags', 'array-contains-any', data.tags), limit(3));
                        const relatedSnap = await getDocs(relatedQuery);
                        const rDocs = relatedSnap.docs
                            .map(d => ({ id: d.id, ...d.data() })) as ArchiveItem[];
                        // Filter out self
                        setRelatedItems(rDocs.filter(d => d.id !== data.id));
                    } else {
                        // Just get recent items if no tags
                        const docsQuery = query(collection(db, 'archive_items'), limit(2));
                        const docsSnap = await getDocs(docsQuery);
                        const rDocs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ArchiveItem[];
                        setRelatedItems(rDocs.filter(d => d.id !== data.id));
                    }
                }

            } catch (error) {
                console.error("Error fetching item details:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchItemAndRelated();
    }, [id]);

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

    if (!item) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <h2 className="text-2xl font-serif text-charcoal">Item Not Found</h2>
                <Link to="/archive" className="mt-4 text-tan hover:underline">Return to Archive</Link>
            </div>
        );
    }

    const { file_urls } = item;
    const coverImage = file_urls && file_urls.length > 0 ? file_urls[0] : null;

    return (
        <div className="flex flex-col h-full max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="mb-8 flex justify-between items-center">
                <Link to="/archive" className="flex items-center gap-2 text-charcoal/60 hover:text-charcoal transition-colors font-medium">
                    <ArrowLeft size={18} />
                    Back to Archive
                </Link>

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

            <div className="flex flex-col md:flex-row gap-10">
                {/* Left Side: Portrait & Facts */}
                <div className="w-full md:w-80 shrink-0 flex flex-col gap-6">
                    <div className="aspect-[3/4] bg-tan-light/20 rounded-2xl overflow-hidden border border-tan-light/50 relative shadow-sm">
                        {coverImage ? (
                            <img
                                src={coverImage}
                                alt={item.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-tan-light bg-charcoal/5">
                                <span className="font-serif text-6xl opacity-20">{item.title.charAt(0)}</span>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-xl border border-tan-light/50 p-6 shadow-sm">
                        <h3 className="text-xs font-bold text-charcoal/40 uppercase tracking-widest border-b border-tan-light/50 pb-2 mb-4">Dublin Core Metadata</h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-0.5">Item Type</p>
                                <p className="font-medium text-charcoal">{item.item_type}</p>
                            </div>
                            {item.date && (
                                <div>
                                    <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-0.5">Date</p>
                                    <p className="font-medium text-charcoal">{item.date}</p>
                                </div>
                            )}
                            {item.creator && (
                                <div>
                                    <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-0.5">Creator</p>
                                    <p className="font-medium text-charcoal">{item.creator}</p>
                                </div>
                            )}
                            {item.subject && (
                                <div>
                                    <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-0.5">Subject</p>
                                    <p className="font-medium text-charcoal">{item.subject}</p>
                                </div>
                            )}
                            {item.tags && item.tags.length > 0 && (
                                <div>
                                    <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-0.5">Tags</p>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {item.tags.map(tag => (
                                            <span key={tag} className="text-[10px] bg-tan-light/50 text-charcoal px-2.5 py-1 rounded-full font-medium uppercase tracking-wider">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Side: Biography & Related Docs */}
                <div className="flex-1 flex flex-col">
                    <div className="mb-10">
                        <h1 className="text-5xl font-serif font-bold text-charcoal leading-tight mb-4 tracking-tight">
                            {item.title}
                        </h1>
                        <div className="prose prose-lg text-charcoal/80 font-sans leading-relaxed whitespace-pre-wrap">
                            <p>{item.description}</p>
                        </div>
                    </div>

                    {/* Secondary Media */}
                    {file_urls && file_urls.length > 1 && (
                        <div className="pt-8 border-t border-tan-light/50 mb-10">
                            <h2 className="text-xl font-serif font-bold text-charcoal mb-4">Additional Media</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {file_urls.slice(1).map((url, idx) => (
                                    <a key={idx} href={url} target="_blank" rel="noreferrer" className="block aspect-square bg-tan-light/20 rounded-xl overflow-hidden border border-tan-light/50 hover:opacity-80 transition-opacity">
                                        <img src={url} alt={`${item.title} media ${idx + 2}`} className="w-full h-full object-cover" />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {relatedItems.length > 0 && (
                        <div className="pt-8 border-t border-tan-light/50">
                            <div className="flex items-center gap-3 mb-6">
                                <BookOpen size={20} className="text-tan" />
                                <h2 className="text-2xl font-serif font-bold text-charcoal">Related Items</h2>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
                                {relatedItems.map(related => (
                                    <DocumentCard key={related.id} item={related} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
