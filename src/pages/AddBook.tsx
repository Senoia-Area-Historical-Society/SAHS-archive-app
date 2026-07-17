import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Image as ImageIcon, AlertCircle, X, MapPin, Search } from 'lucide-react';
import { db, storage, functions } from '../lib/firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../contexts/AuthContext';
import type { MuseumLocation } from '../types/database';
import { ImageCropper } from '../components/ImageCropper';

export function AddBook() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const { user } = useAuth();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [fetchedCoverUrl, setFetchedCoverUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    
    // File upload state
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [isCropping, setIsCropping] = useState(false);

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
    const [status, setStatus] = useState<'Available' | 'Reference Only' | 'Checked Out' | 'Missing'>('Reference Only');
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);

    useEffect(() => {
        // Fetch locations for select dropdown
        const fetchLocations = async () => {
            try {
                const snap = await getDocs(collection(db, 'locations'));
                const locData = snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as MuseumLocation[];
                locData.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
                setLocations(locData);
            } catch (err) {
                console.error("Error loading locations:", err);
            }
        };
        fetchLocations();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverFile(file);
            const previewUrl = URL.createObjectURL(file);
            setCoverPreviewUrl(previewUrl);
        }
    };

    const removeCoverFile = () => {
        if (coverPreviewUrl && coverPreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(coverPreviewUrl);
        }
        setCoverFile(null);
        setCoverPreviewUrl(null);
        setFetchedCoverUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleCropComplete = (croppedBlob: Blob) => {
        if (coverPreviewUrl && coverPreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(coverPreviewUrl);
        }
        const name = coverFile ? coverFile.name : 'cover.jpg';
        const croppedFile = new File([croppedBlob], name, { type: 'image/jpeg' });
        setCoverFile(croppedFile);
        const newPreviewUrl = URL.createObjectURL(croppedFile);
        setCoverPreviewUrl(newPreviewUrl);
        setIsCropping(false);
        setFetchedCoverUrl(null);
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

            let bookData = null;
            let activeKey = null;

            try {
                const bibkeys = keys.join(',');
                const response = await fetch(`https://openlibrary.org/api/books?bibkeys=${bibkeys}&format=json&jscmd=data`);
                if (response.ok) {
                    const data = await response.json();
                    activeKey = keys.find(k => data[k]);
                    bookData = activeKey ? data[activeKey] : null;
                }
            } catch (olErr) {
                console.error("Open Library lookup failed:", olErr);
            }

            let source: 'openlibrary' | 'googlebooks' | 'isbnsearch' = 'openlibrary';
            let googleBookInfo: any = null;
            let fallbackBookInfo: any = null;

            if (!bookData) {
                // Fallback to Google Books API
                try {
                    let googleRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${cleanedIsbn}`);
                    let googleData = googleRes.ok ? await googleRes.json() : null;

                    // If no results, try the converted variant
                    if (!googleData || !googleData.items || googleData.items.length === 0) {
                        let altIsbn = null;
                        if (cleanedIsbn.length === 10) {
                            altIsbn = isbn10To13(cleanedIsbn);
                        } else if (cleanedIsbn.length === 13) {
                            altIsbn = isbn13To10(cleanedIsbn);
                        }

                        if (altIsbn) {
                            googleRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${altIsbn}`);
                            googleData = googleRes.ok ? await googleRes.json() : null;
                        }
                    }

                    if (googleData && googleData.items && googleData.items.length > 0) {
                        googleBookInfo = googleData.items[0].volumeInfo;
                        source = 'googlebooks';
                    }
                } catch (gErr) {
                    console.error("Google Books fallback failed:", gErr);
                }
            }

            if (!bookData && !googleBookInfo) {
                // Fallback to custom Cloud Function for isbnsearch.org
                try {
                    const lookupIsbnFn = httpsCallable(functions, 'lookupIsbnFallback');
                    const res = await lookupIsbnFn({ isbn: cleanedIsbn });
                    const data = res.data as { success: boolean; book?: any; error?: string };
                    if (data.success && data.book) {
                        fallbackBookInfo = data.book;
                        source = 'isbnsearch';
                    }
                } catch (fallbackErr) {
                    console.error("isbnsearch.org fallback lookup failed:", fallbackErr);
                }
            }

            if (!bookData && !googleBookInfo && !fallbackBookInfo) {
                setError("No book details found for this ISBN in Open Library, Google Books, or ISBN Search.");
                setIsLookingUp(false);
                return;
            }

            if (source === 'openlibrary' && bookData) {
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
                }

                if (bookData.subjects && bookData.subjects.length > 0) {
                    setSubjects(bookData.subjects.slice(0, 5).map((s: any) => s.name).join(', '));
                }
            } else if (source === 'googlebooks' && googleBookInfo) {
                // Populate form fields using Google Books schema
                if (googleBookInfo.title) {
                    setTitle(googleBookInfo.subtitle ? `${googleBookInfo.title}: ${googleBookInfo.subtitle}` : googleBookInfo.title);
                }
                
                if (googleBookInfo.authors && googleBookInfo.authors.length > 0) {
                    setAuthors(googleBookInfo.authors.join(', '));
                }
                
                if (googleBookInfo.publisher) {
                    setPublisher(googleBookInfo.publisher);
                }
                
                if (googleBookInfo.publishedDate) {
                    const yearMatch = googleBookInfo.publishedDate.match(/\d{4}/);
                    setPublishYear(yearMatch ? yearMatch[0] : googleBookInfo.publishedDate);
                }

                if (googleBookInfo.description) {
                    setDescription(googleBookInfo.description);
                }

                let coverUrlToUse = null;
                if (googleBookInfo.imageLinks) {
                    const coverImg = googleBookInfo.imageLinks.thumbnail || googleBookInfo.imageLinks.smallThumbnail;
                    if (coverImg) {
                        coverUrlToUse = coverImg.replace('http://', 'https://');
                    }
                }

                if (coverUrlToUse) {
                    setFetchedCoverUrl(coverUrlToUse);
                    setCoverPreviewUrl(coverUrlToUse);
                }

                if (googleBookInfo.categories && googleBookInfo.categories.length > 0) {
                    setSubjects(googleBookInfo.categories.slice(0, 5).join(', '));
                }
            } else if (source === 'isbnsearch' && fallbackBookInfo) {
                // Populate form fields using parsed isbnsearch.org schema
                if (fallbackBookInfo.title) {
                    setTitle(fallbackBookInfo.title);
                }
                
                if (fallbackBookInfo.authors) {
                    setAuthors(fallbackBookInfo.authors);
                }
                
                if (fallbackBookInfo.publisher) {
                    setPublisher(fallbackBookInfo.publisher);
                }
                
                if (fallbackBookInfo.publishYear) {
                    setPublishYear(fallbackBookInfo.publishYear);
                }

                if (fallbackBookInfo.coverUrl) {
                    setFetchedCoverUrl(fallbackBookInfo.coverUrl);
                    setCoverPreviewUrl(fallbackBookInfo.coverUrl);
                }
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
            let coverUrl = null;

            // Upload cover image to Firebase Storage if selected
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

            // Construct new book record
            const newBook = {
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
                created_at: new Date().toISOString(),
                uploaded_by_email: user?.email || null,
                uploaded_by_name: user?.displayName || null,
            };

            const docRef = await addDoc(collection(db, 'library_books'), newBook);
            navigate(`/library/${docRef.id}`);
        } catch (err) {
            console.error("Error saving library book:", err);
            setError("Failed to add book to catalog. Please check your network and try again.");
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

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
            {/* Header */}
            <div className="border-b border-tan-light/30 pb-4">
                <Link to="/library" className="text-sm font-bold text-charcoal/70 hover:text-charcoal transition-colors">
                    &larr; Back to Catalog
                </Link>
                <h1 className="font-serif text-3xl font-bold text-charcoal mt-2">
                    Catalog New Book
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
                            
                            {coverPreviewUrl ? (
                                <div className="space-y-3">
                                    <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-cream/20 border border-tan-light/30 group">
                                        <img src={coverPreviewUrl} alt="Cover Preview" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-charcoal/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setIsCropping(true)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-charcoal hover:bg-tan hover:text-white rounded-lg transition-all text-xs font-bold shadow-md"
                                                title="Crop & Rotate"
                                            >
                                                Edit / Rotate
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={removeCoverFile}
                                            className="absolute top-2 right-2 bg-charcoal/80 text-white p-1.5 rounded-full hover:bg-charcoal transition-colors z-10"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsCropping(true)}
                                        className="w-full py-2 bg-tan/10 text-tan hover:bg-tan hover:text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                                    >
                                        Crop & Rotate Image
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
                                    <option value="Reference Only">Reference Only (In-Museum)</option>
                                    <option value="Available">Available</option>
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
                                    placeholder="e.g. History of Senoia (1860-1920)"
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
                                        placeholder="e.g. Heritage Press"
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
                                        placeholder="e.g. 1974"
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
                                            placeholder="e.g. 978-3-16-148410-0"
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
                                        placeholder="e.g. 975.8 SEN (Dewey or custom)"
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
                                        placeholder="e.g. Clara Henderson Family"
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
                                        placeholder="e.g. L2026.04"
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
                                    placeholder="Enter details on chapters, historical contents, index listings, or context about the local families listed..."
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
                                        <p className="col-span-full text-center text-xs text-charcoal/40 italic py-4">No museum locations found. Create them first.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Submission Actions */}
                <div className="flex justify-end gap-4 border-t border-tan-light/30 pt-6">
                    <Link
                        to="/library"
                        className="px-6 py-3 bg-white hover:bg-cream/20 text-charcoal border border-tan-light rounded-xl font-bold transition-all text-sm"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-8 py-3 bg-tan hover:bg-tan-dark disabled:opacity-50 text-white rounded-xl font-bold transition-all text-sm shadow-md flex items-center gap-2"
                    >
                        {isSubmitting ? "Cataloging Book..." : "Catalog Book"}
                    </button>
                </div>
            </form>
            {isCropping && coverPreviewUrl && (
                <ImageCropper
                    image={coverPreviewUrl}
                    onCropComplete={handleCropComplete}
                    onCancel={() => setIsCropping(false)}
                    aspectRatio={0.75}
                />
            )}
        </div>
    );
}
