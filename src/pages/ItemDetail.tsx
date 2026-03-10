import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Edit2, Trash2, FileText, ZoomIn, X, MapPin, Info, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { DocumentCard } from '../components/DocumentCard';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, getDocs, deleteDoc, where, documentId } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { ArchiveItem } from '../types/database';

export function ItemDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isSAHSUser } = useAuth();

    const [item, setItem] = useState<ArchiveItem | null>(null);
    const [relatedFigureItems, setRelatedFigureItems] = useState<ArchiveItem[]>([]);
    const [relatedDocumentItems, setRelatedDocumentItems] = useState<ArchiveItem[]>([]);
    const [relatedOrganizationItems, setRelatedOrganizationItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);

    useEffect(() => {
        const fetchItemAndRelated = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'archive_items', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...(docSnap.data() || {}) } as ArchiveItem;
                    setItem(data);



                    // 1) Forward explicit references defined on THIS item
                    const fetchForward = async (ids: string[] | undefined) => {
                        if (!ids || ids.length === 0) return [];
                        // Firestore 'in' has a 30 item limit
                        const chunkedIds = ids.slice(0, 30);
                        const q = query(collection(db, 'archive_items'), where(documentId(), 'in', chunkedIds));
                        const snap = await getDocs(q);
                        return snap.docs.map(d => ({ id: d.id, ...d.data() })) as ArchiveItem[];
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
                        return snap.docs.map(d => ({ id: d.id, ...d.data() })) as ArchiveItem[];
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
    const coverImage = item.featured_image_url || (file_urls && file_urls.length > 0 ? file_urls[0] : null);

    return (
        <div className="flex flex-col h-full max-w-full mx-auto animate-in fade-in duration-500 pb-12">
            {zoomedImage && (
                <div
                    className="fixed inset-0 z-[100] bg-charcoal/95 flex items-center justify-center p-4 md:p-12 cursor-zoom-out"
                    onClick={() => setZoomedImage(null)}
                >
                    <div className="relative max-w-full max-h-full overflow-auto">
                        <img
                            src={zoomedImage}
                            alt="Zoomed Review"
                            className="max-w-none w-auto h-auto min-w-full rounded-sm shadow-2xl"
                        />
                    </div>
                    <button className="absolute top-8 right-8 text-white hover:text-tan transition-colors">
                        <X size={32} />
                    </button>
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 text-sm bg-charcoal/50 px-6 py-2 rounded-full backdrop-blur-md border border-white/10">
                        Click anywhere to exit • Use mouse to pan & zoom
                    </div>
                </div>
            )}

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

            <div className="mb-8 max-w-4xl">
                <h1 className="text-5xl font-serif font-bold text-charcoal leading-tight mb-4 tracking-tight">
                    {item.title}
                </h1>
                <div className="prose prose-lg text-charcoal/80 font-sans leading-relaxed whitespace-pre-wrap">
                    <p>{item.description}</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-10">
                {/* Left Side: Portrait & Facts */}
                <div className="w-full md:w-96 lg:w-[450px] shrink-0 flex flex-col gap-6">
                    <div className="aspect-[3/4] bg-tan-light/20 rounded-2xl overflow-hidden border border-tan-light/50 relative shadow-md group cursor-zoom-in" onClick={() => coverImage && setZoomedImage(coverImage)}>
                        {coverImage ? (
                            <>
                                <img
                                    src={coverImage}
                                    alt={item.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-charcoal/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                    <ZoomIn size={32} />
                                </div>
                            </>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-tan-light bg-charcoal/5">
                                <span className="font-serif text-6xl opacity-20">{item.title.charAt(0)}</span>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-xl border border-tan-light/50 p-8 shadow-sm">
                        <h3 className="text-sm font-black text-charcoal/60 uppercase tracking-widest border-b border-tan-light/50 pb-2 mb-4">Information</h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Item Type</p>
                                <p className="text-lg font-serif text-charcoal">{item.item_type}</p>
                            </div>
                            {item.date && (
                                <div>
                                    <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Date</p>
                                    <p className="text-lg font-serif text-charcoal">{item.date}</p>
                                </div>
                            )}
                            {item.archive_reference && item.item_type !== 'Artifact' && (
                                <div>
                                    <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                        <FileText size={14} /> Filing Code
                                    </p>
                                    <p className="text-lg font-serif text-charcoal">{item.archive_reference}</p>
                                </div>
                            )}
                            {item.identifier && item.item_type !== 'Artifact' && (
                                <div>
                                    <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                        <BookOpen size={14} /> Archive Reference
                                    </p>
                                    <p className="text-lg font-serif text-charcoal">{item.identifier}</p>
                                </div>
                            )}
                            {item.creator && (
                                <div>
                                    <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Creator</p>
                                    <p className="text-lg font-serif text-charcoal">{item.creator}</p>
                                </div>
                            )}
                            {item.subject && (
                                <div>
                                    <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Subject</p>
                                    <p className="text-lg font-serif text-charcoal">{item.subject}</p>
                                </div>
                            )}

                            {/* Figure Specific Facts */}
                            {item.item_type === 'Historic Figure' && (
                                <div className="pt-4 border-t border-tan-light/50 mt-4 space-y-4">
                                    <h3 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-4">Timeline & Origins</h3>
                                    {item.full_name && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Full Name</p>
                                            <p className="text-lg font-serif text-charcoal">{item.full_name}</p>
                                        </div>
                                    )}
                                    {item.also_known_as && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Also Known As</p>
                                            <p className="text-lg font-serif text-charcoal italic">"{item.also_known_as}"</p>
                                        </div>
                                    )}
                                    {item.birth_date && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Birth Date</p>
                                            <p className="text-lg font-serif text-charcoal">{item.birth_date}</p>
                                        </div>
                                    )}
                                    {item.death_date && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Death Date</p>
                                            <p className="text-lg font-serif text-charcoal">{item.death_date}</p>
                                        </div>
                                    )}
                                    {item.birthplace && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Birthplace</p>
                                            <p className="text-lg font-serif text-charcoal">{item.birthplace}</p>
                                        </div>
                                    )}
                                    {item.occupation && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Occupation</p>
                                            <p className="text-lg font-serif text-charcoal">{item.occupation}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Organization Specific Facts */}
                            {item.item_type === 'Historic Organization' && (
                                <div className="pt-4 border-t border-tan-light/50 mt-4 space-y-4">
                                    <h3 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-4">Organization History</h3>
                                    {item.org_name && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Full Name</p>
                                            <p className="text-lg font-serif text-charcoal">{item.org_name}</p>
                                        </div>
                                    )}
                                    {item.alternative_names && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Alternative Names</p>
                                            <p className="text-lg font-serif text-charcoal italic">{item.alternative_names}</p>
                                        </div>
                                    )}
                                    {item.founding_date && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Founding Date</p>
                                            <p className="text-lg font-serif text-charcoal">{item.founding_date}</p>
                                        </div>
                                    )}
                                    {item.dissolved_date && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Closed / Dissolved</p>
                                            <p className="text-lg font-serif text-charcoal">{item.dissolved_date}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Artifact Specific Facts */}
                            {item.item_type === 'Artifact' && (
                                <div className="pt-4 border-t border-tan-light/50 mt-4 space-y-4">
                                    <h3 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-4">Provenance & Sourcing</h3>
                                    {item.artifact_type && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5 whitespace-nowrap">Artifact Type</p>
                                            <span className="inline-block bg-tan/10 text-tan px-3 py-1 rounded-full text-xs font-bold border border-tan/20 mt-1 capitalize">
                                                {item.artifact_type}
                                            </span>
                                        </div>
                                    )}
                                    {item.artifact_id && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">ID #</p>
                                            <p className="text-lg font-serif text-charcoal">{item.artifact_id}</p>
                                        </div>
                                    )}
                                    {item.donor && (
                                        <div>
                                            <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Original Donor / Contributor</p>
                                            <p className="text-lg font-serif text-charcoal">{item.donor}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {item.category && item.item_type !== 'Artifact' && (
                                <div className="mb-4">
                                    <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-1">Archive Category</p>
                                    <span className="inline-block bg-tan/10 text-tan px-3 py-1 rounded-full text-xs font-bold border border-tan/20">
                                        {item.category}
                                    </span>
                                </div>
                            )}

                            {item.tags && item.tags.length > 0 && (
                                <div>
                                    <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-2">Subject Tags</p>
                                    <div className="flex flex-wrap gap-2">
                                        {item.tags.map(tag => (
                                            <span key={tag} className="text-[10px] bg-beige text-charcoal px-2.5 py-1.5 rounded-md font-bold uppercase tracking-widest border border-tan-light/30">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <h3 className="text-sm font-black text-charcoal/60 uppercase tracking-widest border-b border-tan-light/50 pb-2 mb-4 pt-4">Archival Tracking</h3>
                            <div className="space-y-4">
                                {item.condition && (
                                    <div>
                                        <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1"><Info size={14} /> Condition</p>
                                        <p className="text-lg font-serif text-charcoal">{item.condition}</p>
                                    </div>
                                )}
                                {item.physical_location && (
                                    <div>
                                        <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1"><MapPin size={14} /> Origin / Place</p>
                                        <p className="text-lg font-serif text-charcoal">{item.physical_location}</p>
                                    </div>
                                )}
                                {item.museum_location && (
                                    <div>
                                        <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1"><Info size={14} /> Museum Location</p>
                                        <p className="text-lg font-serif text-charcoal">{item.museum_location}</p>
                                    </div>
                                )}
                                {item.coverage && (
                                    <div>
                                        <p className="text-sm text-charcoal/60 font-bold uppercase tracking-wider mb-0.5">Coverage / Place</p>
                                        <p className="text-lg font-serif text-charcoal">{item.coverage}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Biography & Related Docs */}
                <div className="flex-1 flex flex-col">


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
                </div>
            </div>

            {/* Bottom Full-Width Section: Relationships & Media */}
            <div className="flex flex-col gap-10 mt-12 pt-8 border-t border-tan-light/50">
                {/* Linked Documents for Figures / Artifacts */}
                {relatedDocumentItems.length > 0 && (
                    <div className="bg-cream/30 border border-tan-light/50 rounded-xl p-6 md:p-8 shadow-sm">
                        <h3 className="text-lg font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 pb-3 mb-6">
                            <BookOpen className="text-tan" size={20} />
                            Linked Documents & Artifacts
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {relatedDocumentItems.map(doc => (
                                <DocumentCard key={doc.id} item={doc} />
                            ))}
                        </div>
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
                                <Link key={fig.id} to={`/items/${fig.id}`} className="group block text-center">
                                    <div className="aspect-square bg-cream rounded-full overflow-hidden border-2 border-tan-light/50 mb-3 group-hover:border-tan transition-colors shadow-sm max-w-[150px] mx-auto">
                                        {fig.file_urls?.[0] ? (
                                            <img src={fig.file_urls[0]} alt={fig.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
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
                                <Link key={org.id} to={`/items/${org.id}`} className="group block text-center">
                                    <div className="aspect-[4/3] bg-cream rounded-xl overflow-hidden border border-tan-light/50 mb-3 group-hover:border-tan transition-colors shadow-sm">
                                        {org.file_urls?.[0] ? (
                                            <img src={org.file_urls[0]} alt={org.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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

                {/* Secondary Media */}
                {file_urls && file_urls.length > 1 && (
                    <div className="pt-4">
                        <h2 className="text-xl font-serif font-bold text-charcoal mb-4">Additional Media / Scans</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                            {file_urls.filter(url => url !== coverImage).map((url, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setZoomedImage(url)}
                                    className="group relative aspect-square bg-tan-light/20 rounded-xl overflow-hidden border border-tan-light/50 hover:shadow-md transition-all"
                                >
                                    <img src={url} alt={`${item.title} media ${idx + 2}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    <div className="absolute inset-0 bg-charcoal/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                        <ZoomIn size={20} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
