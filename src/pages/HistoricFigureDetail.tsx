import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Edit2, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { DocumentCard } from '../components/DocumentCard';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, limit, getDocs, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { HistoricFigure, DocumentRecord } from '../types/database';

export function HistoricFigureDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isSAHSUser } = useAuth();

    const [figure, setFigure] = useState<HistoricFigure | null>(null);
    const [relatedDocs, setRelatedDocs] = useState<DocumentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const fetchFigureAndDocs = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'historic_figures', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setFigure({ id: docSnap.id, ...(docSnap.data() || {}) } as HistoricFigure);
                }

                // Fetch a couple of docs to serve as related
                const docsQuery = query(collection(db, 'documents'), limit(2));
                const docsSnap = await getDocs(docsQuery);
                const rDocs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as DocumentRecord[];
                setRelatedDocs(rDocs);

            } catch (error) {
                console.error("Error fetching figure details:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchFigureAndDocs();
    }, [id]);

    const handleDelete = async () => {
        if (!id || !window.confirm('Are you sure you want to delete this figure?')) return;

        setIsDeleting(true);
        try {
            await deleteDoc(doc(db, 'historic_figures', id));
            navigate('/figures');
        } catch (error) {
            console.error("Error deleting figure:", error);
            alert("Failed to delete figure.");
            setIsDeleting(false);
        }
    };

    if (loading || isDeleting) {
        return <div className="flex justify-center items-center h-full text-charcoal/60 font-serif text-lg">{isDeleting ? 'Deleting...' : 'Loading figure...'}</div>;
    }

    if (!figure) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <h2 className="text-2xl font-serif text-charcoal">Figure Not Found</h2>
                <Link to="/figures" className="mt-4 text-tan hover:underline">Return to Figures</Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="mb-8 flex justify-between items-center">
                <Link to="/figures" className="flex items-center gap-2 text-charcoal/60 hover:text-charcoal transition-colors font-medium">
                    <ArrowLeft size={18} />
                    Back to Figures
                </Link>

                {isSAHSUser && (
                    <div className="flex gap-3">
                        <button
                            onClick={() => navigate(`/edit-figure/${id}`)}
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
                        {figure.portrait_url ? (
                            <img
                                src={figure.portrait_url}
                                alt={figure.full_name}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-tan-light bg-charcoal/5">
                                <span className="font-serif text-6xl opacity-20">{figure.full_name.charAt(0)}</span>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-xl border border-tan-light/50 p-6 shadow-sm">
                        <h3 className="text-xs font-bold text-charcoal/40 uppercase tracking-widest border-b border-tan-light/50 pb-2 mb-4">Quick Facts</h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-0.5">Type</p>
                                <p className="font-medium text-charcoal">{figure.type}</p>
                            </div>
                            <div>
                                <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-0.5">Life Dates</p>
                                <p className="font-medium text-charcoal">{figure.life_dates || 'Unknown'}</p>
                            </div>
                            {figure.also_known_as && (
                                <div>
                                    <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-0.5">Also Known As</p>
                                    <p className="font-medium text-charcoal">{figure.also_known_as}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Side: Biography & Related Docs */}
                <div className="flex-1 flex flex-col">
                    <div className="mb-10">
                        <h1 className="text-5xl font-serif font-bold text-charcoal leading-tight mb-4 tracking-tight">
                            {figure.full_name}
                        </h1>
                        <div className="prose prose-lg text-charcoal/80 font-sans leading-relaxed">
                            <p>{figure.biography}</p>
                        </div>
                    </div>

                    {relatedDocs.length > 0 && (
                        <div className="pt-8 border-t border-tan-light/50">
                            <div className="flex items-center gap-3 mb-6">
                                <BookOpen size={20} className="text-tan" />
                                <h2 className="text-2xl font-serif font-bold text-charcoal">Associated Archive Records</h2>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
                                {relatedDocs.map(doc => (
                                    <DocumentCard key={doc.id} doc={doc} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
