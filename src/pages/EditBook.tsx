import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Image as ImageIcon, AlertCircle, X, MapPin, Trash2, Search } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { doc, getDoc, updateDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import type { LibraryBook, MuseumLocation } from '../types/database';

export default function EditBook() {
    const { id } = useParams<{ id: string }>();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [fetchedCoverUrl, setFetchedCoverUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    
    // File upload state
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
    const [existingCoverUrl, setExistingCoverUrl] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);

    // Form states
    const [title, setTitle] = useState('');
    const [authors, setAuthors] = useState('');
    const [publisher, setPublisher] = useState('');
    const [publishYear, setPublishYear] = useState('');
    const [isbn, setIsbn] = useState('');
    const [callNumber, setCallNumber] = useState('');
    const [description, setDescription] = useState('');
    const [subjects, setSubjects] = useState('');
    const [donor, setDonor] = useState('');
    const [accessionNumber, setAccessionNumber] = useState('');
    const [condition, setCondition] = useState<'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Fragile'>('Good');
    const [status, setStatus] = useState<'Available' | 'Reference Only' | 'Checked Out' | 'Missing'>('Available');
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            try {
                // Fetch book details
                const bookRef = doc(db, 'library_books', id);
                const bookSnap = await getDoc(bookRef);

                if (!bookSnap.exists()) {
                    setError("Book not found in library catalog.");
                    setLoading(false);
                    return;
                }

                const bookData = bookSnap.data() as LibraryBook;
                setTitle(bookData.title || '');
                setAuthors(bookData.authors?.join(', ') || '');
                setPublisher(bookData.publisher || '');
                setPublishYear(bookData.publish_year ? String(bookData.publish_year) : '');
                setIsbn(bookData.isbn || '');
                setCallNumber(bookData.call_number || '');
                setDescription(bookData.description || '');
                setSubjects(bookData.subjects?.join(', ') || '');
                setDonor(bookData.donor || '');
                setAccessionNumber(bookData.accession_number || '');
                setCondition(bookData.condition || 'Good');
                setStatus(bookData.status || 'Available');
                setSelectedLocationIds(bookData.museum_location_ids || []);
                setExistingCoverUrl(bookData.cover_image_url || null);

                // Fetch locations for select picker
                const locSnap = await getDocs(collection(db, 'locations'));
                const locData = locSnap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as MuseumLocation[];
                locData.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
                setLocations(locData);
            } catch (err) {
                console.error("Error loading edit book page:", err);
                setError("Failed to fetch catalog record.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverFile(file);
            const previewUrl = URL.createObjectURL(file);
            setCoverPreviewUrl(previewUrl);
            setExistingCoverUrl(null); // Overwrite old cover image
        }
    };

    const removeCoverFile = () => {
        if (coverPreviewUrl && coverPreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(coverPreviewUrl);
        }
        setCoverFile(null);
        setCoverPreviewUrl(null);
        setExistingCoverUrl(null);
        setFetchedCoverUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const isbn10To13 = (isbn10: string): string | null => {
        if (isbn10.length !== 10) return null;
        const base = '978' + isbn10.substring(0, 9);
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        return base + checkDigit;
    };

    const isbn13To10 = (isbn13: string): string | null => {
        if (isbn13.length !== 13 || !isbn13.startsWith('978')) return null;
        const base = isbn13.substring(3, 12);
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(base[i], 10) * (10 - i);
        }
        const rem = sum % 11;
        const check = (11 - rem) % 11;
        const checkDigit = check === 10 ? 'X' : check.toString();
        return base + checkDigit;
    };

    const handleIsbnLookup = async () => {
        const cleanedIsbn = isbn.replace(/[^0-9X]/gi, '').trim();
        if (!cleanedIsbn) {
            setError("Please enter a valid ISBN number first.");
            return;
        }

        setIsLookingUp(true);
        setError(null);

        try {
            // Build keys list with converted variants to increase lookup success
            const keys = [`ISBN:${cleanedIsbn}`];
            if (cleanedIsbn.length === 10) {
                const conv13 = isbn10To13(cleanedIsbn);
                if (conv13) keys.push(`ISBN:${conv13}`);
            } else if (cleanedIsbn.length === 13) {
                const conv10 = isbn13To10(cleanedIsbn);
                if (conv10) keys.push(`ISBN:${conv10}`);
            }

            const bibkeys = keys.join(',');
            const response = await fetch(`https://openlibrary.org/api/books?bibkeys=${bibkeys}&format=json&jscmd=data`);
            if (!response.ok) throw new Error("Network response was not ok");
            
            const data = await response.json();
            
            // Find which key returned data
            const activeKey = keys.find(k => data[k]);
            const bookData = activeKey ? data[activeKey] : null;

            if (!bookData) {
                setError("No book details found for this ISBN in the Open Library database.");
                setIsLookingUp(false);
                return;
            }

            const matchedIsbn = activeKey!.replace('ISBN:', '');

            // Populate form fields
            if (bookData.title) setTitle(bookData.title);
            
            if (bookData.authors && bookData.authors.length > 0) {
                setAuthors(bookData.authors.map((a: any) => a.name).join(', '));
            }
            
            if (bookData.publishers && bookData.publishers.length > 0) {
                setPublisher(bookData.publishers[0].name);
            }
            
            if (bookData.publish_date) {
                const yearMatch = bookData.publish_date.match(/\d{4}/);
                setPublishYear(yearMatch ? yearMatch[0] : bookData.publish_date);
            }

            let desc = '';
            if (bookData.subtitle) {
                desc += `${bookData.subtitle}\n\n`;
            }
            if (typeof bookData.notes === 'string') {
                desc += bookData.notes;
            } else if (bookData.excerpts && bookData.excerpts.length > 0) {
                desc += bookData.excerpts[0].text;
            }
            if (desc) {
                setDescription(desc);
            }

            let coverUrlToUse = null;
            if (bookData.cover) {
                const coverImg = bookData.cover.large || bookData.cover.medium || bookData.cover.small;
                if (coverImg) {
                    coverUrlToUse = coverImg.replace('http://', 'https://');
                }
            }

            if (!coverUrlToUse && matchedIsbn) {
                const directIsbnUrl = `https://covers.openlibrary.org/b/isbn/${matchedIsbn}-L.jpg`;
                const coverExists = await new Promise<boolean>((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve(true);
                    img.onerror = () => resolve(false);
                    img.src = `${directIsbnUrl}?default=false`;
                });
                if (coverExists) {
                    coverUrlToUse = directIsbnUrl;
                }
            }

            if (coverUrlToUse) {
                setFetchedCoverUrl(coverUrlToUse);
                setCoverPreviewUrl(coverUrlToUse);
                setExistingCoverUrl(null); // Clear existing since we have a new fetched cover
            }

            if (bookData.subjects && bookData.subjects.length > 0) {
                setSubjects(bookData.subjects.slice(0, 5).map((s: any) => s.name).join(', '));
            }

        } catch (err) {
            console.error("Error looking up ISBN:", err);
            setError("Failed to fetch book data. Please check the ISBN and try again.");
        } finally {
            setIsLookingUp(false);
        }
    };

    const handleLocationToggle = (id: string) => {
        setSelectedLocationIds(prev => 
            prev.includes(id) ? prev.filter(lid => lid !== id) : [...prev, id]
        );
    };

    const handleDeleteBook = async () => {
        if (!id) return;
        if (!window.confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
            return;
        }
        setIsDeleting(true);
        setError(null);
        try {
            const bookRef = doc(db, 'library_books', id);
            await deleteDoc(bookRef);
            navigate('/library');
        } catch (err) {
            console.error("Error deleting book:", err);
            setError("Failed to delete book. Please check your network and try again.");
            setIsDeleting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;
        if (!title.trim()) {
            setError("Book Title is required.");
            return;
        }
        if (!authors.trim()) {
            setError("At least one Author is required.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            let coverUrl = existingCoverUrl;

            // Upload new cover image to Firebase Storage if selected
            if (coverFile) {
                setUploadProgress(0);
                const storageRef = ref(storage, `archive_media/library_covers/${Date.now()}_${coverFile.name}`);
                const uploadTask = uploadBytesResumable(storageRef, coverFile);

                coverUrl = await new Promise<string>((resolve, reject) => {
                    uploadTask.on('state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(Math.round(progress));
                        },
                        (err) => reject(err),
                        async () => {
                            const url = await getDownloadURL(uploadTask.snapshot.ref);
                            resolve(url);
                        }
                    );
                });
            }

            // Parse comma-separated inputs
            const authorList = authors.split(',').map(a => a.trim()).filter(a => a !== '');
            const subjectList = subjects.split(',').map(s => s.trim()).filter(s => s !== '');

            // Construct update payload
            const bookRef = doc(db, 'library_books', id);
            await updateDoc(bookRef, {
                title: title.trim(),
                authors: authorList,
                publisher: publisher.trim() || null,
                publish_year: publishYear.trim() || null,
                isbn: isbn.trim() || null,
                call_number: callNumber.trim() || null,
                description: description.trim() || null,
                subjects: subjectList,
                donor: donor.trim() || null,
                accession_number: accessionNumber.trim() || null,
                condition,
                status,
                cover_image_url: coverUrl || fetchedCoverUrl || null,
                museum_location_ids: selectedLocationIds,
                updated_at: new Date().toISOString(),
                updated_by_email: user?.email || null,
                updated_by_name: user?.displayName || null,
            });

            navigate(`/library/${id}`);
        } catch (err) {
            console.error("Error saving library book edits:", err);
            setError("Failed to update catalog record. Please try again.");
            setIsSubmitting(false);
        }
    };

    // Cleanup object URL on unmount
    useEffect(() => {
        return () => {
            if (coverPreviewUrl) {
                URL.revokeObjectURL(coverPreviewUrl);
            }
        };
    }, [coverPreviewUrl]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                <p className="font-serif text-charcoal/60 text-lg italic">Loading catalog record...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
            {/* Header */}
            <div className="border-b border-tan-light/30 pb-4">
                <Link to={`/library/${id}`} className="text-sm font-bold text-charcoal/70 hover:text-charcoal transition-colors">
                    &larr; Cancel Edits
                </Link>
                <h1 className="font-serif text-3xl font-bold text-charcoal mt-2">
                    Edit Catalog Record
                </h1>
            </div>

            {error && (
                <div className="bg-rose-50 text-rose-600 p-4 rounded-xl border border-rose-200 flex items-center gap-3">
                    <AlertCircle size={20} className="shrink-0" />
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
                    
                    {/* Left Column: Cover Upload & Status/Condition */}
                    <div className="md:col-span-1 space-y-6">
                        
                        {/* Cover Image Upload Card */}
                        <div className="bg-white border border-tan-light/50 rounded-2xl p-5 shadow-sm space-y-4">
                            <h3 className="text-xs font-bold text-charcoal/70 uppercase tracking-wider">Book Cover Image</h3>
                            
                            {coverPreviewUrl || existingCoverUrl ? (
                                <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-cream/20 border border-tan-light/30">
                                    <img 
                                        src={coverPreviewUrl || existingCoverUrl!} 
                                        alt="Cover" 
                                        className="w-full h-full object-cover" 
                                    />
                                    <button
                                        type="button"
                                        onClick={removeCoverFile}
                                        className="absolute top-2 right-2 bg-charcoal/80 text-white p-1.5 rounded-full hover:bg-charcoal transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="aspect-[3/4] border-2 border-dashed border-tan-light/50 rounded-xl flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:bg-cream/10 transition-colors"
                                >
                                    <ImageIcon size={32} className="text-tan/50 mb-2" />
                                    <p className="text-xs font-bold text-tan">Upload Cover Image</p>
                                    <p className="text-[10px] text-charcoal/40 mt-1">PNG, JPG, or WEBP</p>
                                </div>
                            )}

                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/*"
                                className="hidden"
                            />
                            
                            {uploadProgress !== null && (
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold text-charcoal/50">
                                        <span>Uploading...</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="w-full bg-cream rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-tan h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Status & Condition */}
                        <div className="bg-white border border-tan-light/50 rounded-2xl p-5 shadow-sm space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Lending Status</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as any)}
                                    className="w-full px-3 py-2 bg-cream/20 border border-tan-light/50 rounded-lg outline-none focus:border-tan text-sm font-semibold text-charcoal"
                                >
                                    <option value="Available">Available</option>
                                    <option value="Reference Only">Reference Only (In-Museum)</option>
                                    <option value="Checked Out">Checked Out</option>
                                    <option value="Missing">Missing</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Book Condition</label>
                                <select
                                    value={condition}
                                    onChange={(e) => setCondition(e.target.value as any)}
                                    className="w-full px-3 py-2 bg-cream/20 border border-tan-light/50 rounded-lg outline-none focus:border-tan text-sm font-semibold text-charcoal"
                                >
                                    <option value="Excellent">Excellent</option>
                                    <option value="Good">Good</option>
                                    <option value="Fair">Fair</option>
                                    <option value="Poor">Poor</option>
                                    <option value="Fragile">Fragile</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Metadata Fields */}
                    <div className="md:col-span-2 space-y-6 bg-white border border-tan-light/50 rounded-2xl p-6 shadow-sm">
                        <h3 className="font-serif text-lg font-bold text-charcoal border-b border-tan-light/20 pb-2 mb-4">Bibliographic Information</h3>
                        
                        <div className="space-y-4">
                            {/* Title */}
                            <div>
                                <label htmlFor="title" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-1.5">Book Title *</label>
                                <input
                                    required
                                    type="text"
                                    id="title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan transition-all font-sans text-charcoal font-medium text-sm"
                                />
                            </div>

                            {/* Authors */}
                            <div>
                                <label htmlFor="authors" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-1.5">Author(s) / Editor(s) *</label>
                                <input
                                    required
                                    type="text"
                                    id="authors"
                                    value={authors}
                                    onChange={(e) => setAuthors(e.target.value)}
                                    placeholder="e.g. Jane Doe, John Smith (comma separated)"
                                    className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan transition-all font-sans text-charcoal font-medium text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Publisher */}
                                <div>
                                    <label htmlFor="publisher" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-1.5">Publisher</label>
                                    <input
                                        type="text"
                                        id="publisher"
                                        value={publisher}
                                        onChange={(e) => setPublisher(e.target.value)}
                                        className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan transition-all font-sans text-charcoal font-medium text-sm"
                                    />
                                </div>

                                {/* Publish Year */}
                                <div>
                                    <label htmlFor="publishYear" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-1.5">Publication Year</label>
                                    <input
                                        type="text"
                                        id="publishYear"
                                        value={publishYear}
                                        onChange={(e) => setPublishYear(e.target.value)}
                                        className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan transition-all font-sans text-charcoal font-medium text-sm"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* ISBN */}
                                <div>
                                    <label htmlFor="isbn" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-1.5">ISBN Number</label>
                                    <div className="flex gap-2 items-stretch">
                                        <input
                                            type="text"
                                            id="isbn"
                                            value={isbn}
                                            onChange={(e) => setIsbn(e.target.value)}
                                            className="flex-1 bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan transition-all font-sans text-charcoal font-mono text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleIsbnLookup}
                                            disabled={isLookingUp || !isbn.trim()}
                                            className="px-4 bg-tan hover:bg-charcoal text-white rounded-lg transition-all active:scale-95 shadow-sm disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center shrink-0 w-11"
                                            title="Search ISBN details"
                                        >
                                            {isLookingUp ? (
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <Search size={18} />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Call Number */}
                                <div>
                                    <label htmlFor="callNumber" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-1.5">Call Number / Spine Label</label>
                                    <input
                                        type="text"
                                        id="callNumber"
                                        value={callNumber}
                                        onChange={(e) => setCallNumber(e.target.value)}
                                        className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan transition-all font-sans text-charcoal font-mono text-sm"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Donor */}
                                <div>
                                    <label htmlFor="donor" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-1.5">Donor Name</label>
                                    <input
                                        type="text"
                                        id="donor"
                                        value={donor}
                                        onChange={(e) => setDonor(e.target.value)}
                                        className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan transition-all font-sans text-charcoal font-medium text-sm"
                                    />
                                </div>

                                {/* Accession Number */}
                                <div>
                                    <label htmlFor="accessionNumber" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-1.5">Accession Number</label>
                                    <input
                                        type="text"
                                        id="accessionNumber"
                                        value={accessionNumber}
                                        onChange={(e) => setAccessionNumber(e.target.value)}
                                        className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan transition-all font-sans text-charcoal font-medium text-sm"
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label htmlFor="description" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-1.5">Summary & Context</label>
                                <textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={4}
                                    className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan transition-all font-sans text-charcoal text-sm leading-relaxed resize-none"
                                ></textarea>
                            </div>

                            {/* Subjects/Tags */}
                            <div>
                                <label htmlFor="subjects" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-1.5">Subjects / Keywords</label>
                                <input
                                    type="text"
                                    id="subjects"
                                    value={subjects}
                                    onChange={(e) => setSubjects(e.target.value)}
                                    placeholder="e.g. Genealogy, Civil War, Railroads, Families (comma separated)"
                                    className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan transition-all font-sans text-charcoal font-medium text-sm"
                                />
                            </div>

                            {/* Museum Location Selector */}
                            <div className="space-y-2 pt-2 border-t border-tan-light/20">
                                <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider flex items-center gap-1">
                                    <MapPin size={14} className="text-tan" />
                                    Assign Museum Locations (Multi-select)
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[180px] overflow-y-auto p-2 border border-tan-light/30 rounded-lg bg-cream/5">
                                    {locations.map((loc) => {
                                        const isSelected = selectedLocationIds.includes(loc.id);
                                        return (
                                            <button
                                                type="button"
                                                key={loc.id}
                                                onClick={() => handleLocationToggle(loc.id)}
                                                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all text-left flex items-center justify-between gap-1.5 ${isSelected ? 'bg-tan/10 text-tan border-tan' : 'bg-white text-charcoal/70 border-tan-light/30 hover:border-tan-light/80'}`}
                                            >
                                                <span className="truncate">{loc.name}</span>
                                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-tan shrink-0"></span>}
                                            </button>
                                        );
                                    })}
                                    {locations.length === 0 && (
                                        <p className="col-span-full text-center text-xs text-charcoal/40 italic py-4">No museum locations found.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Submission Actions */}
                <div className="flex justify-between items-center border-t border-tan-light/30 pt-6">
                    <button
                        type="button"
                        onClick={handleDeleteBook}
                        disabled={isSubmitting || isDeleting}
                        className="px-5 py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold transition-all text-sm flex items-center gap-2"
                    >
                        <Trash2 size={16} />
                        {isDeleting ? "Deleting..." : "Delete Book"}
                    </button>
                    <div className="flex gap-4">
                        <Link
                            to={`/library/${id}`}
                            className="px-6 py-3 bg-white hover:bg-cream/20 text-charcoal border border-tan-light rounded-xl font-bold transition-all text-sm"
                        >
                            Cancel
                        </Link>
                        <button
                            type="submit"
                            disabled={isSubmitting || isDeleting}
                            className="px-8 py-3 bg-tan hover:bg-tan-dark disabled:opacity-50 text-white rounded-xl font-bold transition-all text-sm shadow-md flex items-center gap-2"
                        >
                            {isSubmitting ? "Saving Edits..." : "Save Edits"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
