import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Edit, MapPin, Tag, Calendar, User, Award, CheckCircle, AlertTriangle, HelpCircle, Trash2, QrCode } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import type { LibraryBook, MuseumLocation, ArchiveItem } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

export function LibraryDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isSAHSUser } = useAuth();

    const [book, setBook] = useState<LibraryBook | null>(null);
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    const [relatedItems, setRelatedItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDeleteBook = async () => {
        if (!book) return;
        if (!window.confirm(`Are you sure you want to delete "${book.title}"? This action cannot be undone.`)) {
            return;
        }
        setIsDeleting(true);
        setError(null);
        try {
            const bookRef = doc(db, 'library_books', book.id);
            await deleteDoc(bookRef);
            navigate('/library');
        } catch (err) {
            console.error("Error deleting book:", err);
            setError("Failed to delete book. Please check your network and try again.");
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        if (!id) return;

        const fetchBookDetails = async () => {
            try {
                setLoading(true);
                // Fetch book document
                const bookRef = doc(db, 'library_books', id);
                const bookSnap = await getDoc(bookRef);

                if (!bookSnap.exists()) {
                    setError("Book not found in the library catalog.");
                    return;
                }

                const bookData = { id: bookSnap.id, ...bookSnap.data() } as LibraryBook;
                setBook(bookData);

                // Fetch linked locations
                if (bookData.museum_location_ids && bookData.museum_location_ids.length > 0) {
                    const locPromises = bookData.museum_location_ids.map(async (locId) => {
                        const locRef = doc(db, 'locations', locId);
                        const locSnap = await getDoc(locRef);
                        if (locSnap.exists()) {
                            return { id: locSnap.id, ...locSnap.data() } as MuseumLocation;
                        }
                        return null;
                    });
                    const locs = await Promise.all(locPromises);
                    setLocations(locs.filter((l): l is MuseumLocation => l !== null));
                }

                // Fetch related items if there are any
                if (bookData.related_items && bookData.related_items.length > 0) {
                    const itemPromises = bookData.related_items.map(async (itemId) => {
                        const itemRef = doc(db, 'archive_items', itemId);
                        const itemSnap = await getDoc(itemRef);
                        if (itemSnap.exists()) {
                            return { id: itemSnap.id, ...itemSnap.data() } as ArchiveItem;
                        }
                        return null;
                    });
                    const items = await Promise.all(itemPromises);
                    setRelatedItems(items.filter((i): i is ArchiveItem => i !== null));
                }
            } catch (err) {
                console.error("Error fetching book details:", err);
                setError("Failed to load book details. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        fetchBookDetails();
    }, [id]);

    const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
        'Available': {
            bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
            text: 'text-emerald-700',
            icon: <CheckCircle className="w-4 h-4 text-emerald-600" />,
            label: 'Available'
        },
        'Reference Only': {
            bg: 'bg-amber-50 text-amber-800 border-amber-200',
            text: 'text-amber-700',
            icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
            label: 'Reference Only'
        },
        'Checked Out': {
            bg: 'bg-blue-50 text-blue-800 border-blue-200',
            text: 'text-blue-700',
            icon: <Calendar className="w-4 h-4 text-blue-600" />,
            label: 'Checked Out'
        },
        'Missing': {
            bg: 'bg-rose-50 text-rose-800 border-rose-200',
            text: 'text-rose-700',
            icon: <AlertTriangle className="w-4 h-4 text-rose-600" />,
            label: 'Missing'
        }
    };

    const currentStatus = book ? statusConfig[book.status] || {
        bg: 'bg-gray-50 text-gray-800 border-gray-200',
        text: 'text-gray-700',
        icon: <HelpCircle className="w-4 h-4 text-gray-600" />,
        label: book.status
    } : null;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                <p className="font-serif text-charcoal/60 text-lg italic">Loading book profile...</p>
            </div>
        );
    }

    if (error || !book) {
        return (
            <div className="max-w-xl mx-auto text-center space-y-6 pt-12">
                <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl border border-rose-200 font-medium">
                    {error || "An unexpected error occurred."}
                </div>
                <Link
                    to="/library"
                    className="inline-flex items-center gap-2 text-tan hover:text-tan-dark font-bold border-b-2 border-tan/30 hover:border-tan-dark/50 pb-0.5 transition-colors"
                >
                    <ArrowLeft size={16} /> Back to Library Catalog
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Navigation back and edit buttons */}
            <div className="flex justify-between items-center border-b border-tan-light/30 pb-4">
                <Link
                    to="/library"
                    className="inline-flex items-center gap-2 text-charcoal/70 hover:text-charcoal font-bold transition-colors text-sm"
                >
                    <ArrowLeft size={16} /> Back to Library
                </Link>
                {isSAHSUser && (
                    <div className="flex gap-3">
                        <button
                            onClick={handleDeleteBook}
                            disabled={isDeleting}
                            className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2.5 rounded-xl font-bold transition-all text-sm"
                        >
                            <Trash2 size={16} />
                            {isDeleting ? "Deleting..." : "Delete Book"}
                        </button>
                        <Link
                            to={`/library/edit/${book.id}`}
                            className="flex items-center gap-2 bg-tan hover:bg-tan-dark text-white px-4 py-2.5 rounded-xl font-bold transition-all text-sm shadow-md"
                        >
                            <Edit size={16} />
                            Edit Catalog Record
                        </Link>
                    </div>
                )}
            </div>

            {/* Book Info Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Book Cover Visual (4 columns on lg) */}
                <div className="lg:col-span-4 flex flex-col items-center">
                    <div className="w-full max-w-[280px] aspect-[3/4] bg-cream/10 border border-tan-light/40 rounded-2xl shadow-md overflow-hidden relative group">
                        {book.cover_image_url ? (
                            <img
                                src={book.cover_image_url}
                                alt={book.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            /* Placeholder Cover */
                            <div className="w-full h-full bg-gradient-to-tr from-tan-dark/15 to-tan/5 p-8 flex flex-col justify-between text-center select-none">
                                <div className="text-center">
                                    <BookOpen size={48} className="text-tan/40 mx-auto mt-4" />
                                </div>
                                <div className="space-y-3">
                                    <p className="font-serif text-lg font-bold text-charcoal/80 leading-snug line-clamp-4">
                                        {book.title}
                                    </p>
                                    <p className="text-xs font-sans font-bold text-charcoal/50 uppercase tracking-widest">
                                        {book.authors?.join(', ')}
                                    </p>
                                </div>
                                <div className="text-sm text-charcoal/40 font-mono">
                                    {book.call_number || "NO CALL NUMBER"}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Accession & Condition info directly under cover */}
                    <div className="w-full max-w-[280px] mt-4 space-y-2 text-center">
                        {book.call_number && (
                            <div className="bg-charcoal text-cream font-mono text-sm px-3 py-1.5 rounded-lg inline-block shadow-sm">
                                Call #: {book.call_number}
                            </div>
                        )}
                        {book.condition && (
                            <p className="text-xs font-semibold text-charcoal/60">
                                Condition: <span className="text-charcoal font-bold">{book.condition}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Bibliographic Details (8 columns on lg) */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2 items-center">
                            {/* Lending status badge */}
                            {currentStatus && (
                                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border shadow-sm ${currentStatus.bg}`}>
                                    {currentStatus.icon}
                                    {currentStatus.label}
                                </span>
                            )}
                            {/* Accession number */}
                            {book.accession_number && (
                                <span className="bg-cream/40 text-charcoal/60 border border-tan-light/30 text-[11px] font-bold px-2.5 py-1 rounded-full">
                                    Accession: #{book.accession_number}
                                </span>
                            )}
                        </div>
                        
                        <h1 className="font-serif text-3xl sm:text-4xl font-extrabold text-charcoal leading-tight">
                            {book.title}
                        </h1>

                        <p className="text-lg font-sans font-semibold text-tan flex items-center gap-2">
                            <User size={18} />
                            By {book.authors?.join(', ')}
                        </p>
                    </div>

                    {/* Metadata Card grid */}
                    <div className="bg-white border border-tan-light/50 rounded-2xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm w-full">
                        <div className="flex items-start gap-3">
                            <Calendar className="text-tan shrink-0 mt-0.5" size={18} />
                            <div>
                                <h4 className="text-xs font-bold text-charcoal/50 uppercase tracking-wider">Publish Year / Publisher</h4>
                                <p className="font-medium text-charcoal mt-0.5">
                                    {book.publish_year || 'Unknown Year'} {book.publisher ? `by ${book.publisher}` : ''}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <Award className="text-tan shrink-0 mt-0.5" size={18} />
                            <div>
                                <h4 className="text-xs font-bold text-charcoal/50 uppercase tracking-wider">Donor / Provenance</h4>
                                <p className="font-medium text-charcoal mt-0.5">
                                    {book.donor || 'Not recorded'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <BookOpen className="text-tan shrink-0 mt-0.5" size={18} />
                            <div>
                                <h4 className="text-xs font-bold text-charcoal/50 uppercase tracking-wider">ISBN</h4>
                                <p className="font-medium text-charcoal mt-0.5 font-mono">
                                    {book.isbn || 'None / Unknown'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <Tag className="text-tan shrink-0 mt-0.5" size={18} />
                            <div>
                                <h4 className="text-xs font-bold text-charcoal/50 uppercase tracking-wider">Subject Classification</h4>
                                <p className="font-medium text-charcoal mt-0.5">
                                    {book.call_number ? `Dewey / Custom (${book.call_number.split(' ')[0]})` : 'Unclassified'}
                                </p>
                            </div>
                        </div>
                    </div>


                    {/* Description Section */}
                    <div className="space-y-2">
                        <h2 className="font-serif text-xl font-bold text-charcoal border-b border-tan-light/20 pb-2">
                            Description & Historical Significance
                        </h2>
                        <div className="text-charcoal-light leading-relaxed font-sans whitespace-pre-wrap text-[15px]">
                            {book.description || "No description or historical context has been cataloged for this book yet."}
                        </div>
                    </div>

                    {/* Subjects / Tags */}
                    {book.subjects && book.subjects.length > 0 && (
                        <div className="space-y-2 pt-2">
                            <h3 className="text-xs font-bold text-charcoal/60 uppercase tracking-wider">Subjects & Tags</h3>
                            <div className="flex flex-wrap gap-2">
                                {book.subjects.map((subject, idx) => (
                                    <span key={idx} className="flex items-center gap-1.5 bg-cream/40 text-charcoal/70 px-3 py-1 rounded-xl text-xs font-bold border border-tan-light/30">
                                        <Tag size={12} className="text-tan" />
                                        {subject}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Physical Location Cards - Curator/Admin Only */}
                    {isSAHSUser && (
                        <div className="space-y-3 pt-4">
                            <h2 className="font-serif text-xl font-bold text-charcoal border-b border-tan-light/20 pb-2">
                                Physical Location inside Museum
                            </h2>
                            {locations.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {locations.map((loc) => (
                                        <Link
                                            key={loc.id}
                                            to={`/locations/${loc.id}`}
                                            className="flex items-center gap-4 bg-white hover:bg-cream/15 border border-tan-light/50 p-4 rounded-xl shadow-sm transition-all hover:border-tan"
                                        >
                                            <div className="w-10 h-10 bg-tan/10 text-tan rounded-lg flex items-center justify-center shrink-0 border border-tan-light/20">
                                                <MapPin size={20} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-charcoal text-sm truncate">{loc.name}</h4>
                                                <p className="text-xs text-charcoal-light truncate mt-0.5">
                                                    {loc.description || "View shelf placement & map coordinates"}
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-cream/20 border border-dashed border-tan-light/60 rounded-xl p-6 text-center text-charcoal/50 italic text-sm">
                                    This book has not been assigned a structured museum location yet.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Related Archive Items */}
                    {relatedItems.length > 0 && (
                        <div className="space-y-3 pt-4">
                            <h2 className="font-serif text-xl font-bold text-charcoal border-b border-tan-light/20 pb-2">
                                Related Archive Items
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {relatedItems.map((item) => (
                                    <Link
                                        key={item.id}
                                        to={`/items/${item.id}`}
                                        className="flex items-center gap-4 bg-white hover:bg-cream/15 border border-tan-light/50 p-4 rounded-xl shadow-sm transition-all hover:border-tan"
                                    >
                                        <div className="w-10 h-10 bg-tan/10 text-tan rounded-lg flex items-center justify-center shrink-0 border border-tan-light/20 font-serif font-bold text-sm">
                                            {item.item_type[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-charcoal text-sm truncate">{item.title}</h4>
                                            <p className="text-xs text-charcoal-light truncate mt-0.5">
                                                Type: {item.item_type}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isSAHSUser && (
                <div className="mt-16 pt-12 border-t border-tan-light/50 w-full max-w-4xl mx-auto flex flex-col items-center sm:items-start animate-in fade-in duration-300">
                    <h3 className="text-2xl font-serif font-bold text-charcoal mb-4 flex items-center gap-2">
                        <QrCode className="text-tan" size={24} />
                        Library Book QR Code
                    </h3>
                    <div className="bg-white border border-tan-light/50 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto">
                        <div className="bg-white p-2 rounded-xl border border-tan-light/20 shadow-sm shrink-0">
                            <QRCodeDisplay 
                                value={`book:${book.id}`}
                                label={book.title}
                                subLabel="Library Book Tag"
                                size={140}
                            />
                        </div>
                        <div className="text-center sm:text-left space-y-2">
                            <p className="text-base font-bold text-charcoal">Physical Library Label</p>
                            <p className="text-xs text-charcoal/60 leading-relaxed max-w-md">
                                This QR code links directly to this book's catalog details. You can click the card to expand, download a high-resolution PNG image, or print a professional physical label.
                            </p>
                            <span className="inline-block bg-tan/10 text-tan text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider font-sans">
                                Curator / Admin Privilege
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
