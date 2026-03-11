import { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, CheckCircle, AlertCircle, ChevronDown, ChevronUp, BookOpen, Sparkles, X, Plus, Search, FileText, Tag } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, getDocs, query } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { extractMetadataFromFile } from '../lib/gemini';
import type { ItemType, Collection, ArchiveItem } from '../types/database';

export function AddItem() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [featuredImageIndex, setFeaturedImageIndex] = useState(0);
    const [fileObjectURLs, setFileObjectURLs] = useState<Map<File, string>>(new Map());

    // Clean up blob URLs on unmount
    useEffect(() => {
        return () => {
            fileObjectURLs.forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    // Update object URLs when files change
    useEffect(() => {
        setFileObjectURLs(prev => {
            const next = new Map(prev);
            // Add new files
            selectedFiles.forEach(file => {
                if (!next.has(file)) {
                    next.set(file, URL.createObjectURL(file));
                }
            });
            // Cleanup removed files
            next.forEach((url, file) => {
                if (!selectedFiles.includes(file)) {
                    URL.revokeObjectURL(url);
                    next.delete(file);
                }
            });
            return next;
        });
    }, [selectedFiles]);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [itemType, setItemType] = useState<ItemType>('Document');
    const [showAdvancedDC, setShowAdvancedDC] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);

    // New Fields & Data State
    const [collections, setCollections] = useState<Collection[]>([]);
    const [allFigures, setAllFigures] = useState<{ id: string, title: string }[]>([]);
    const [selectedRelatedFigures, setSelectedRelatedFigures] = useState<{ id: string, title: string }[]>([]);
    const [figureSearch, setFigureSearch] = useState('');
    const [showFigureResults, setShowFigureResults] = useState(false);
    const [allOrgs, setAllOrgs] = useState<{ id: string, title: string }[]>([]);
    const [selectedRelatedOrgs, setSelectedRelatedOrgs] = useState<{ id: string, title: string }[]>([]);
    const [orgSearch, setOrgSearch] = useState('');
    const [showOrgResults, setShowOrgResults] = useState(false);
    const [allExistingTags, setAllExistingTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [currentTags, setCurrentTags] = useState<string[]>([]);
    const [showTagSuggestions, setShowTagSuggestions] = useState(false);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);
    const [physicalLocationValue, setPhysicalLocationValue] = useState('SAHS (Physical Archive)');

    // Document linking for Figures
    const [allDocs, setAllDocs] = useState<{ id: string, title: string }[]>([]);
    const [selectedRelatedDocs, setSelectedRelatedDocs] = useState<{ id: string, title: string }[]>([]);
    const [docSearch, setDocSearch] = useState('');
    const [showDocResults, setShowDocResults] = useState(false);

    const [selectedCollectionId, setSelectedCollectionId] = useState("");

    const handleCollectionChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === 'NEW_COLLECTION') {
            const title = window.prompt("Enter the name of the new collection:");
            if (title && title.trim()) {
                try {
                    const newCollData = {
                        title: title.trim(),
                        description: '',
                        created_at: new Date().toISOString()
                    };
                    const docRef = await addDoc(collection(db, 'collections'), newCollData);
                    const newColl = { id: docRef.id, ...newCollData } as Collection;
                    setCollections(prev => [...prev, newColl].sort((a, b) => a.title.localeCompare(b.title)));
                    setSelectedCollectionId(docRef.id);
                } catch (err) {
                    alert("Failed to create collection.");
                    setSelectedCollectionId("");
                }
            } else {
                setSelectedCollectionId("");
            }
        } else {
            setSelectedCollectionId(val);
        }
    };

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch Collections
                const qColl = query(collection(db, 'collections'));
                const collSnap = await getDocs(qColl);
                const collectionsData = collSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Collection[];
                setCollections(collectionsData.sort((a, b) => a.title.localeCompare(b.title)));

                // Fetch all archive items once and filter in memory to avoid index requirements
                const qItemsAll = query(collection(db, 'archive_items'));
                const itemsSnapAll = await getDocs(qItemsAll);
                const allItemsData = itemsSnapAll.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

                const figures = allItemsData
                    .filter(i => i.item_type === 'Historic Figure')
                    .map(i => ({ id: i.id, title: i.title || i.full_name || "Unnamed Figure" }));
                setAllFigures(figures.sort((a, b) => a.title.localeCompare(b.title)));

                const docs = allItemsData
                    .filter(i => i.item_type === 'Document')
                    .map(i => ({ id: i.id, title: i.title || "Untitled Document" }));
                setAllDocs(docs.sort((a, b) => a.title.localeCompare(b.title)));

                const orgs = allItemsData
                    .filter(i => i.item_type === 'Historic Organization')
                    .map(i => ({ id: i.id, title: i.title || i.org_name || "Unnamed Organization" }));
                setAllOrgs(orgs.sort((a, b) => a.title.localeCompare(b.title)));

                // Fetch All Tags for suggestions
                const tags = new Set<string>();
                allItemsData.forEach(item => {
                    if (item.tags) item.tags.forEach((t: string) => tags.add(t));
                });
                setAllExistingTags(Array.from(tags).sort());

            } catch (error) {
                console.error("Error fetching initial form data:", error);
            }
        };
        fetchInitialData();
    }, []);

    const handleAutoExtract = async () => {
        if (selectedFiles.length === 0) {
            setError("Please select a file first before extracting metadata.");
            return;
        }

        const file = selectedFiles[0];
        setIsExtracting(true);
        setError(null);

        try {
            const metadata = await extractMetadataFromFile(file);
            console.log("Extracted Metadata:", metadata);

            const form = document.getElementById('add-item-form') as HTMLFormElement;
            if (!form) return;

            const setVal = (name: string, val?: string | null) => {
                const el = form.elements.namedItem(name);
                if (el) (el as HTMLInputElement).value = val || '';
            }

            if (metadata.dc_type?.toLowerCase().includes('text') || metadata.dc_type?.toLowerCase().includes('document')) {
                setItemType('Document');
            } else if (metadata.dc_type?.toLowerCase().includes('person') || metadata.dc_type?.toLowerCase().includes('figure')) {
                setItemType('Historic Figure');
            } else if (metadata.dc_type?.toLowerCase().includes('organization') || metadata.dc_type?.toLowerCase().includes('business') || metadata.dc_type?.toLowerCase().includes('church')) {
                setItemType('Historic Organization');
            }

            setVal('title', metadata.title);
            setVal('description', metadata.description);
            setVal('transcription', metadata.transcription);
            setVal('date', metadata.date);
            setVal('creator', metadata.creator);
            setVal('subject', metadata.subject);
            setVal('archive_reference', metadata.archive_reference);
            setVal('location', metadata.coverage);

            if (metadata.tags) {
                setCurrentTags(prev => Array.from(new Set([...prev, ...(metadata.tags || [])])));
            }

            // Extended fields
            setVal('publisher', metadata.publisher);
            setVal('language', metadata.language);
            setVal('format', metadata.format);
            setVal('identifier', metadata.identifier);
            setVal('source', metadata.source);

            if (metadata.publisher || metadata.language || metadata.format || metadata.identifier) {
                setShowAdvancedDC(true);
            }

            (form.elements.namedItem('title') as HTMLInputElement)?.focus();

        } catch (err: any) {
            setError(err.message || "Something went wrong during AI extraction.");
        } finally {
            setIsExtracting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const formData = new FormData(e.target as HTMLFormElement);
            let fileUrls: string[] = [];

            if (selectedFiles.length > 0) {
                const totalFiles = selectedFiles.length;
                let completedFiles = 0;
                setUploadProgress(0);

                for (const file of selectedFiles) {
                    const storageRef = ref(storage, `archive_media/${Date.now()}_${file.name}`);
                    const uploadTask = uploadBytesResumable(storageRef, file);

                    await new Promise<void>((resolve, reject) => {
                        uploadTask.on('state_changed',
                            (snapshot) => {
                                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                const overallProgress = ((completedFiles * 100) + progress) / totalFiles;
                                setUploadProgress(Math.round(overallProgress));
                            },
                            (error) => reject(error),
                            async () => {
                                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                                fileUrls.push(downloadUrl);
                                completedFiles++;
                                resolve();
                            }
                        );
                    });
                }
            }

            /*
             - [x] Enhance manual upload form with professional archival fields:
        - [x] Condition, Location, Category dropdowns
        - [x] Historic Figure relationship linking
        - [x] Date, Transcription, and Archive Ref fields
    - [x] Implement high-resolution zoom and scroll functionality for document images
    - [x] Update Item Detail view to display all new metadata fields and associated figures
    - [x] Verify UI/UX matches reference site aesthetics (Premium layout)
            */

            const itemData: Omit<ArchiveItem, 'id'> = {
                item_type: itemType,
                file_urls: fileUrls,
                featured_image_url: fileUrls[featuredImageIndex] || (fileUrls.length > 0 ? fileUrls[0] : null),
                tags: currentTags,
                collection_id: (formData.get('collection_id') as string) || "",
                created_at: new Date().toISOString(),

                title: formData.get('title') as string || "",
                description: formData.get('description') as string || "",
                transcription: formData.get('transcription') as string || "",
                archive_reference: formData.get('archive_reference') as string || "",
                date: formData.get('date') as string || "",
                creator: formData.get('creator') as string || "",
                subject: formData.get('subject') as string || "",
                coverage: formData.get('location') as string || "",

                category: formData.get('category') as string || "",

                // SAHS Specific
                condition: (formData.get('condition') as any) || null,
                physical_location: (formData.get('physical_location') as any) || null,
                historical_address: formData.get('historical_address') as string || "",
                related_figures: selectedRelatedFigures.map(f => f.id),
                related_documents: selectedRelatedDocs.map(d => d.id),
                related_organizations: selectedRelatedOrgs.map(o => o.id),
                donor: formData.get('donor') as string || "",

                // Figure Specific Biographics
                full_name: formData.get('full_name') as string || "",
                also_known_as: formData.get('also_known_as') as string || "",
                birth_date: formData.get('birth_date') as string || "",
                death_date: formData.get('death_date') as string || "",
                birthplace: formData.get('birthplace') as string || "",
                occupation: formData.get('occupation') as string || "",

                // Organization Specific Biographics
                org_name: formData.get('org_name') as string || "",
                alternative_names: formData.get('alternative_names') as string || "",
                founding_date: formData.get('founding_date') as string || "",
                dissolved_date: formData.get('dissolved_date') as string || "",

                // Advanced DC Elements
                publisher: formData.get('publisher') as string || "",
                contributor: formData.get('contributor') as string || "",
                rights: formData.get('rights') as string || "",
                relation: formData.get('relation') as string || "",
                format: formData.get('format') as string || "",
                language: formData.get('language') as string || "",
                type: formData.get('dc_type') as string || "",
                identifier: formData.get('identifier') as string || "",
                source: formData.get('source') as string || "",

                artifact_id: formData.get('artifact_id') as string || "",
                artifact_type: formData.get('artifact_type') as string || "",
                museum_location: formData.get('museum_location') as string || "",
            };

            await addDoc(collection(db, 'archive_items'), itemData);
            setSuccess(true);
        } catch (err: any) {
            console.error("Error adding item: ", err);
            setError(err.message || "Failed to add item. Please check your Firebase configuration.");
        } finally {
            setIsSubmitting(false);
            setUploadProgress(null);
        }
    };

    const addTag = (tag: string) => {
        const normalized = tag.trim();
        if (normalized && !currentTags.includes(normalized)) {
            setCurrentTags([...currentTags, normalized]);
        }
        setTagInput('');
        setShowTagSuggestions(false);
    };

    const removeTag = (tag: string) => {
        setCurrentTags(currentTags.filter(t => t !== tag));
    };

    const filteredSuggestions = allExistingTags.filter(t =>
        t.toLowerCase().includes(tagInput.toLowerCase()) && !currentTags.includes(t)
    );

    const filteredFigures = allFigures.filter(f =>
        f.title.toLowerCase().includes(figureSearch.toLowerCase()) &&
        !selectedRelatedFigures.find(sf => sf.id === f.id)
    );

    const filteredDocs = allDocs.filter(d =>
        d.title.toLowerCase().includes(docSearch.toLowerCase()) &&
        !selectedRelatedDocs.find(sd => sd.id === d.id)
    );

    const filteredOrgs = allOrgs.filter(o =>
        o.title.toLowerCase().includes(orgSearch.toLowerCase()) &&
        !selectedRelatedOrgs.find(so => so.id === o.id)
    );

    if (success) {
        return (
            <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-tan-light/50 text-tan rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={32} />
                </div>
                <h2 className="text-3xl font-serif font-bold text-charcoal mb-2">Item Archived</h2>
                <p className="text-charcoal/70 mb-8 text-center max-w-md">The item has been successfully preserved in the archive database.</p>
                <button
                    onClick={() => {
                        setSuccess(false);
                        setSelectedFiles([]);
                        setCurrentTags([]);
                        setSelectedRelatedFigures([]);
                        setSelectedRelatedDocs([]);
                        setSelectedRelatedOrgs([]);
                        setUploadProgress(null);
                        (document.getElementById('add-item-form') as HTMLFormElement)?.reset();
                    }}
                    className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors"
                >
                    Archive Another Item
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-5xl mx-auto h-full flex flex-col pb-12 relative text-charcoal">
            {/* Zoom Overlay */}
            {zoomedImage && (
                <div
                    className="fixed inset-0 z-[100] bg-charcoal/90 flex items-center justify-center p-4 md:p-12 cursor-zoom-out"
                    onClick={() => setZoomedImage(null)}
                >
                    <div className="relative max-w-full max-h-full overflow-auto">
                        <img
                            src={zoomedImage}
                            alt="Zoomed Preview"
                            className="max-w-none w-auto h-auto min-w-full rounded shadow-2xl"
                        />
                    </div>
                    <button className="absolute top-8 right-8 text-white hover:text-tan transition-colors">
                        <X size={32} />
                    </button>
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-charcoal/50 px-4 py-2 rounded-full backdrop-blur-sm">
                        Use mouse/scroll to move around
                    </div>
                </div>
            )}

            <div className="mb-8 border-b border-tan-light/50 pb-6">
                <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                    <Upload className="text-tan" size={32} />
                    Ingest Archive Item
                </h1>
                <p className="text-charcoal/70 text-lg">Preserve a new document, photograph, or historic figure in the digital vault.</p>
            </div>

            {error && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p className="font-medium text-sm">{error}</p>
                </div>
            )}

            <form id="add-item-form" onSubmit={handleSubmit} className="bg-white rounded-2xl border border-tan-light/50 shadow-sm flex flex-col overflow-hidden">

                {/* Section 1: Files & Type */}
                <div className="p-8 border-b border-tan-light/50 bg-cream/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div>
                            <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-3">Item Classification *</label>
                            <div className="flex bg-white rounded-xl border border-tan-light/50 p-1.5 mb-8 gap-1 flex-wrap">
                                {(["Document", "Historic Figure", "Historic Organization", "Artifact"] as const).map(type => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setItemType(type)}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${itemType === type ? 'bg-tan text-white shadow-md' : 'text-charcoal/50 hover:text-charcoal hover:bg-cream'}`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>

                            <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-3 underline underline-offset-4 decoration-tan/30 flex items-center">
                                {itemType === 'Document' ? 'Document Scans / Photos' : itemType === 'Artifact' ? 'Artifact Photos' : 'Representative Media / Portraits'}
                                {selectedFiles.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedFiles([]); setFeaturedImageIndex(0); }}
                                        className="ml-auto text-[10px] font-black uppercase text-red-500 hover:text-red-700 tracking-widest transition-colors flex items-center gap-1"
                                    >
                                        <X size={10} /> Clear All
                                    </button>
                                )}
                            </label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-tan-light/70 bg-white rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-all hover:border-tan min-h-[14rem] group"
                            >
                                <input
                                    type="file"
                                    name="fileUpload"
                                    ref={fileInputRef}
                                    className="hidden"
                                    multiple
                                    accept="image/png, image/jpeg, image/webp, application/pdf"
                                    onChange={(e) => {
                                        const files = e.target.files;
                                        if (files) {
                                            const newFiles = Array.from(files);
                                            setSelectedFiles(prev => [...prev, ...newFiles]);
                                        }
                                        // Reset input so same file can be selected again if needed
                                        e.target.value = '';
                                    }}
                                />
                                {/* Image Grid */}
                                {selectedFiles.length > 0 ? (
                                    <div className="grid grid-cols-4 gap-2 w-full max-w-sm mt-4">
                                        {selectedFiles.map((file, idx) => {
                                            const url = fileObjectURLs.get(file) || '';
                                            const isImage = file.type.startsWith('image/');
                                            return (
                                                <div key={`pending-${idx}`} className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group/thumb ${featuredImageIndex === idx ? 'border-tan ring-2 ring-tan/20 shadow-md' : 'border-tan-light/30 hover:border-tan-light'}`}>
                                                    {isImage ? (
                                                        <img src={url} className="w-full h-full object-cover" alt="preview" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-cream/50 text-tan/40">
                                                            <FileText size={16} />
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-charcoal/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setFeaturedImageIndex(idx);
                                                            }}
                                                            className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors"
                                                            title="Set as Featured"
                                                        >
                                                            <CheckCircle size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
                                                                if (featuredImageIndex === idx) setFeaturedImageIndex(0);
                                                            }}
                                                            className="p-1 bg-white/20 hover:bg-red-500/60 rounded-full text-white backdrop-blur-sm transition-colors"
                                                            title="Remove File"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                    {featuredImageIndex === idx && (
                                                        <div className="absolute top-1 left-1 bg-tan text-white p-0.5 rounded-full shadow-sm z-20">
                                                            <CheckCircle size={8} />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {selectedFiles.length > 8 && (
                                            <div className="aspect-square bg-tan/20 flex items-center justify-center text-tan font-black text-xs rounded-lg border border-tan-light/50 uppercase tracking-tighter">
                                                +{selectedFiles.length - 8} MORE
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-16 h-16 bg-cream rounded-2xl flex items-center justify-center text-tan shadow-sm mb-4 group-hover:scale-110 transition-transform">
                                            <ImageIcon size={32} />
                                        </div>
                                        <p className="font-bold text-charcoal mb-1">Click to upload scans</p>
                                        <p className="text-xs text-charcoal/50">Multiple PNG, JPG, or PDF allowed</p>
                                    </>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={handleAutoExtract}
                                disabled={isExtracting || selectedFiles.length === 0}
                                className={`mt-6 w-full flex items-center justify-center gap-3 py-4 px-4 rounded-xl font-bold text-sm transition-all border-2 ${isExtracting
                                    ? 'bg-tan-light/10 text-tan border-tan-light/30 cursor-not-allowed'
                                    : selectedFiles.length === 0
                                        ? 'bg-cream/50 text-charcoal/20 border-tan-light/20 cursor-not-allowed'
                                        : 'bg-indigo-50/50 text-indigo-700 border-indigo-100 hover:bg-indigo-100 hover:shadow-md'
                                    }`}
                            >
                                <Sparkles size={18} className={isExtracting ? 'animate-pulse' : ''} />
                                {isExtracting ? 'Analyzing Document Content...' : 'Auto-Fill using AI Intelligence'}
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label htmlFor="title" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Display Title / Name *</label>
                                <input required type="text" name="title" id="title" placeholder={itemType === 'Historic Figure' ? "e.g. John Doe" : itemType === 'Historic Organization' ? "e.g. Senoia General Store" : itemType === 'Artifact' ? "e.g. Civil War Bayonet" : "Descriptive title for the archive"} className="w-full bg-white border border-tan-light/50 px-4 py-4 rounded-xl outline-none focus:ring-4 focus:ring-tan/10 focus:border-tan transition-all font-sans text-lg font-medium" />
                            </div>

                            {itemType === 'Historic Organization' ? (
                                <>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label htmlFor="org_name" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Full Organization Name</label>
                                            <input type="text" name="org_name" id="org_name" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label htmlFor="alternative_names" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Alternative Names / Former Names</label>
                                            <input type="text" name="alternative_names" id="alternative_names" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="founding_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Founding Date</label>
                                            <input type="text" name="founding_date" id="founding_date" placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="dissolved_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Closed / Dissolved Date</label>
                                            <input type="text" name="dissolved_date" id="dissolved_date" placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                </>
                            ) : itemType === 'Historic Figure' ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="full_name" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Full Given Name</label>
                                            <input type="text" name="full_name" id="full_name" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="also_known_as" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Also Known As / Alias</label>
                                            <input type="text" name="also_known_as" id="also_known_as" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="birth_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Birth Date</label>
                                            <input type="text" name="birth_date" id="birth_date" placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="death_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Death Date</label>
                                            <input type="text" name="death_date" id="death_date" placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="birthplace" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Birthplace</label>
                                            <input type="text" name="birthplace" id="birthplace" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="occupation" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Occupation / Title</label>
                                            <input type="text" name="occupation" id="occupation" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        {itemType === 'Artifact' ? (
                                            <div>
                                                <label htmlFor="artifact_type" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Type</label>
                                                <div className="relative">
                                                    <select name="artifact_type" id="artifact_type" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                        {["textile", "photo", "print", "award/trophy", "memorabilia", "furniture", "ceramics", "miscellaneous", "technology", "signs", "jewelry", "metal", "glass", "agriculture"].map(t => (
                                                            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <label htmlFor="collection_id" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Collection</label>
                                                <div className="relative">
                                                    <select name="collection_id" id="collection_id" value={selectedCollectionId} onChange={handleCollectionChange} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                        <option value="">No Collection</option>
                                                        {collections.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                                        <option value="NEW_COLLECTION" className="font-bold text-tan">+ Create New Collection...</option>
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                                </div>
                                            </div>
                                        )}
                                        {itemType === 'Artifact' ? (
                                            <div>
                                                <label htmlFor="artifact_id" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">ID #</label>
                                                <input type="text" name="artifact_id" id="artifact_id" placeholder="e.g. 2024.01.05" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                            </div>
                                        ) : (
                                            <div>
                                                <label htmlFor="category" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Category</label>
                                                <div className="relative">
                                                    <select name="category" id="category" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                        {["Manuscript", "Photograph", "Map", "Artifact", "Letter", "Newspaper", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="condition" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Condition</label>
                                            <div className="relative">
                                                <select name="condition" id="condition" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                    {["Excellent", "Good", "Fair", "Poor", "Fragile", "Needs To Be Rescanned"].map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor="date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Date (e.g. 1920, c. 1905)</label>
                                            <input type="text" name="date" id="date" placeholder="Approximate or Exact Date" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 mt-4">
                                        <div>
                                            <label htmlFor="historical_address" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Historical Physical Address (For Map View)</label>
                                            <input type="text" name="historical_address" id="historical_address" placeholder="e.g. 123 Main St, Senoia, GA" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="physical_location" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">File Location</label>
                                            <div className="relative">
                                                <select name="physical_location" id="physical_location" value={physicalLocationValue} onChange={(e) => setPhysicalLocationValue(e.target.value)} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                    <option value="SAHS (Physical Archive)">SAHS (Physical Archive)</option>
                                                    <option value="Digital Archive">Digital Archive</option>
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                            </div>
                                            {physicalLocationValue === 'SAHS (Physical Archive)' && (
                                                <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <label htmlFor="archive_specific_location" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Specific Location in Archive</label>
                                                    <input type="text" name="archive_specific_location" id="archive_specific_location" placeholder="e.g. Filing Cabinet 3, Drawer B, Folder 12" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div>
                                <label htmlFor="description" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">
                                    {itemType === 'Historic Figure' ? 'Biography *' : itemType === 'Historic Organization' ? 'History & Description *' : itemType === 'Artifact' ? 'Physical Description & History *' : 'History & Description *'}
                                </label>
                                <textarea required id="description" name="description" placeholder={itemType === 'Historic Figure' ? "Biographical details, family history, and significance..." : itemType === 'Historic Organization' ? "Historical details, mission, key figures, and legacy..." : itemType === 'Artifact' ? "Physical details, materials, historical use, and significance..." : "Provide background, provenance, or biographical details..."} className="w-full min-h-[140px] bg-white border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:ring-4 focus:ring-tan/10 focus:border-tan transition-all font-sans resize-none leading-relaxed"></textarea>
                            </div>
                        </div>
                    </div >
                </div >

                {/* Section 2: Extended Details & Relationships */}
                < div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-10" >
                    <div className="space-y-6">
                        <h3 className="text-lg font-serif font-bold text-charcoal flex flex-col border-b border-tan-light/50 pb-3 mb-2">
                            <div className="flex items-center gap-2 mb-1">
                                <BookOpen size={22} className="text-tan" />
                                {itemType === 'Document' ? 'Provenance & Sourcing' : 'Media Provenance & Sourcing'}
                            </div>
                            {(itemType === 'Historic Figure' || itemType === 'Historic Organization') && (
                                <span className="text-[10px] font-bold text-tan-light uppercase tracking-wider">Provenance information applies to the specific photo/file uploaded to this profile</span>
                            )}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {itemType !== 'Artifact' && (
                                <>
                                    <div>
                                        <label htmlFor="archive_reference" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Filing Code</label>
                                        <input type="text" name="archive_reference" id="archive_reference" placeholder="e.g. SAHS-2024-001" className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                                    </div>
                                    <div>
                                        <label htmlFor="identifier" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Archive Reference</label>
                                        <input type="text" name="identifier" id="identifier" placeholder="e.g. LTR_Jun. 14, 1945" className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                                    </div>
                                </>
                            )}
                            <div>
                                <label htmlFor="location" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Origin Location</label>
                                <input type="text" name="location" id="location" placeholder="e.g. Senoia, Main St." className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                            </div>
                            <div>
                                <label htmlFor="creator" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Original Creator</label>
                                <input type="text" name="creator" id="creator" className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                            </div>
                            <div>
                                <label htmlFor="donor" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Original Donor</label>
                                <input type="text" name="donor" id="donor" className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                            </div>
                            <div className="md:col-span-2">
                                <label htmlFor="museum_location" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Museum Location (Specific Shelf/Box)</label>
                                <input type="text" name="museum_location" id="museum_location" placeholder="e.g. Shelf 4, Drawer B, Box 12" className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                            </div>
                        </div>

                        {itemType !== 'Historic Figure' ? (
                            <div>
                                <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-3 underline underline-offset-4 decoration-tan/30">Connect Historic Figures</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 text-charcoal/30" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search people in the archive..."
                                        className="w-full bg-white border border-tan-light/50 pl-10 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-tan/20 transition-all text-sm"
                                        value={figureSearch}
                                        onChange={(e) => {
                                            setFigureSearch(e.target.value);
                                            setShowFigureResults(true);
                                        }}
                                        onFocus={() => setShowFigureResults(true)}
                                    />

                                    {showFigureResults && (
                                        <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-tan-light rounded-xl shadow-xl max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                            {filteredFigures.length > 0 ? (
                                                filteredFigures.map(fig => (
                                                    <button
                                                        key={fig.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedRelatedFigures([...selectedRelatedFigures, fig]);
                                                            setFigureSearch('');
                                                            setShowFigureResults(false);
                                                        }}
                                                        className="w-full text-left px-4 py-3 hover:bg-cream border-b border-tan-light/20 last:border-0 flex items-center justify-between group"
                                                    >
                                                        <span className="font-medium text-charcoal">{fig.title}</span>
                                                        <Plus size={14} className="text-tan opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="px-4 py-3 text-xs text-charcoal/40 italic">No figures found.</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {selectedRelatedFigures.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {selectedRelatedFigures.map(fig => (
                                            <div key={fig.id} className="flex items-center gap-2 bg-tan text-white px-3 py-1.5 rounded-full text-xs font-bold animate-in zoom-in duration-200">
                                                {fig.title}
                                                <button type="button" onClick={() => setSelectedRelatedFigures(selectedRelatedFigures.filter(f => f.id !== fig.id))} className="hover:text-charcoal transition-colors">
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}


                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-3 underline underline-offset-4 decoration-tan/30">Link To Documents</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 text-charcoal/30" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search documents to link..."
                                        className="w-full bg-white border border-tan-light/50 pl-10 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-tan/20 transition-all text-sm"
                                        value={docSearch}
                                        onChange={(e) => {
                                            setDocSearch(e.target.value);
                                            setShowDocResults(true);
                                        }}
                                        onFocus={() => setShowDocResults(true)}
                                    />

                                    {showDocResults && (
                                        <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-tan-light rounded-xl shadow-xl max-h-48 overflow-auto">
                                            {filteredDocs.length > 0 ? (
                                                filteredDocs.map(doc => (
                                                    <button
                                                        key={doc.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedRelatedDocs([...selectedRelatedDocs, doc]);
                                                            setDocSearch('');
                                                            setShowDocResults(false);
                                                        }}
                                                        className="w-full text-left px-4 py-3 hover:bg-cream border-b border-tan-light/20 last:border-0 flex items-center justify-between group"
                                                    >
                                                        <span className="font-medium text-charcoal">{doc.title}</span>
                                                        <Plus size={14} className="text-tan opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="px-4 py-3 text-xs text-charcoal/40 italic">No documents found.</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {selectedRelatedDocs.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {selectedRelatedDocs.map(doc => (
                                            <div key={doc.id} className="flex items-center gap-2 bg-charcoal text-cream px-3 py-1.5 rounded-full text-xs font-bold animate-in zoom-in duration-200">
                                                {doc.title}
                                                <button type="button" onClick={() => setSelectedRelatedDocs(selectedRelatedDocs.filter(d => d.id !== doc.id))} className="hover:text-tan transition-colors">
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="pt-8 border-t border-tan-light/30">
                            <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-3 underline underline-offset-4 decoration-tan/30">Connect Historic Organizations</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-charcoal/30" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search organizations in the archive..."
                                    className="w-full bg-white border border-tan-light/50 pl-10 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-tan/20 transition-all text-sm"
                                    value={orgSearch}
                                    onChange={(e) => {
                                        setOrgSearch(e.target.value);
                                        setShowOrgResults(true);
                                    }}
                                    onFocus={() => setShowOrgResults(true)}
                                />

                                {showOrgResults && (
                                    <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-tan-light rounded-xl shadow-xl max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                        {filteredOrgs.length > 0 ? (
                                            filteredOrgs.map(org => (
                                                <button
                                                    key={org.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedRelatedOrgs([...selectedRelatedOrgs, org]);
                                                        setOrgSearch('');
                                                        setShowOrgResults(false);
                                                    }}
                                                    className="w-full text-left px-4 py-3 hover:bg-cream border-b border-tan-light/20 last:border-0 flex items-center justify-between group"
                                                >
                                                    <span className="font-medium text-charcoal">{org.title}</span>
                                                    <Plus size={14} className="text-tan opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </button>
                                            ))
                                        ) : (
                                            <div className="px-4 py-3 text-xs text-charcoal/40 italic">No organizations found.</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {selectedRelatedOrgs.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-4">
                                    {selectedRelatedOrgs.map(org => (
                                        <div key={org.id} className="flex items-center gap-2 bg-charcoal text-white px-3 py-1.5 rounded-full text-xs font-bold animate-in zoom-in duration-200">
                                            {org.title}
                                            <button type="button" onClick={() => setSelectedRelatedOrgs(selectedRelatedOrgs.filter(o => o.id !== org.id))} className="hover:text-tan transition-colors">
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-lg font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 pb-3 mb-2">
                            <Tag size={22} className="text-tan" />
                            Categorization & Transcript
                        </h3>

                        <div className="relative">
                            <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2 underline underline-offset-4 decoration-tan/30">Archive Tags</label>
                            <div className="relative">
                                <Plus className="absolute left-3 top-3 text-charcoal/30" size={18} />
                                <input
                                    type="text"
                                    placeholder="Enter custom tag or pick suggested..."
                                    className="w-full bg-white border border-tan-light/50 pl-10 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-tan/20 transition-all text-sm"
                                    value={tagInput}
                                    onChange={(e) => {
                                        setTagInput(e.target.value);
                                        setShowTagSuggestions(true);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (tagInput) addTag(tagInput);
                                        }
                                    }}
                                    onFocus={() => setShowTagSuggestions(true)}
                                />
                                {showTagSuggestions && tagInput && (
                                    <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-tan-light rounded-xl shadow-xl max-h-48 overflow-auto">
                                        {filteredSuggestions.map(tag => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => addTag(tag)}
                                                className="w-full text-left px-4 py-2 hover:bg-cream text-sm text-charcoal border-b border-tan-light/20 last:border-0"
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2 mt-4 min-h-[2rem]">
                                {currentTags.map(tag => (
                                    <span key={tag} className="flex items-center gap-1.5 bg-beige text-charcoal px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border border-tan-light/30 shadow-sm animate-in fade-in duration-200">
                                        {tag}
                                        <button type="button" onClick={() => removeTag(tag)} className="text-charcoal/40 hover:text-red-600 transition-colors">
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="transcription" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2 underline underline-offset-4 decoration-tan/30">Full Text Transcription</label>
                            <textarea id="transcription" name="transcription" placeholder="Exact word-for-word record of the document contents..." className="w-full min-h-[160px] bg-white border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:ring-4 focus:ring-tan/10 focus:border-tan transition-all font-mono text-sm resize-none leading-relaxed"></textarea>
                        </div>
                    </div>
                </div >

                {/* Section 3: Extended Metadata Accordion */}
                < div className="px-8 pb-8" >
                    <div className="border border-tan-light/50 rounded-2xl overflow-hidden shadow-inner bg-cream/5">
                        <button
                            type="button"
                            onClick={() => setShowAdvancedDC(!showAdvancedDC)}
                            className="w-full px-6 py-5 flex justify-between items-center text-charcoal font-serif font-bold hover:bg-cream/50 transition-colors"
                        >
                            <span>Extended Dublin Core Metadata (Academic)</span>
                            {showAdvancedDC ? <ChevronUp size={20} className="text-charcoal/50" /> : <ChevronDown size={20} className="text-charcoal/50" />}
                        </button>

                        {showAdvancedDC && (
                            <div className="p-8 bg-white grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-tan-light/50 animate-in slide-in-from-top-4 duration-300">
                                {["subject", "publisher", "contributor", "rights", "relation", "format", "language", "dc_type", "identifier", "source"].map(field => (
                                    <div key={field}>
                                        <label htmlFor={field} className="block text-xs font-bold text-charcoal/40 uppercase tracking-widest mb-2">{field.replace('_', ' ')}</label>
                                        <input type="text" name={field} id={field} className="w-full bg-cream/10 border border-tan-light/50 px-4 py-3 rounded-xl text-sm transition-all focus:bg-white focus:ring-2 focus:ring-tan/20 outline-none" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div >

                <div className="p-8 bg-cream border-t border-tan-light/50 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex-1 w-full">
                        {uploadProgress !== null && (
                            <div className="w-full max-w-sm">
                                <div className="flex justify-between text-xs font-black text-charcoal uppercase tracking-widest mb-2">
                                    <span>Preserving to Storage...</span>
                                    <span>{uploadProgress}%</span>
                                </div>
                                <div className="w-full bg-charcoal/5 rounded-full h-4 overflow-hidden border border-tan-light shadow-inner">
                                    <div
                                        className="bg-tan h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(186,140,99,0.5)]"
                                        style={{ width: `${uploadProgress}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-charcoal text-cream px-12 py-4 rounded-xl font-black uppercase tracking-widest hover:bg-tan hover:text-white transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl min-w-[260px]"
                    >
                        {isSubmitting ? 'Finalizing Record...' : 'Add to Archive'}
                    </button>
                </div>

            </form >
        </div >
    );
}
