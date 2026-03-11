import { useState, useRef, useEffect } from 'react';
import { Edit2, Image as ImageIcon, CheckCircle, AlertCircle, ChevronDown, ChevronUp, BookOpen, Sparkles, X } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, getDocs, query, addDoc } from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { useParams, useNavigate } from 'react-router-dom';
import { extractMetadataFromFile } from '../lib/gemini';
import type { ArchiveItem, ItemType, Collection } from '../types/database';

export function EditItem() {
    // Simplified PendingFilePreview
    const PendingFilePreview = ({
        file,
        url,
        isFeatured,
        onSetFeatured,
        onRemove
    }: {
        file: File,
        url: string,
        isFeatured: boolean,
        onSetFeatured: (url: string) => void,
        onRemove: () => void
    }) => {
        const isImage = file.type.startsWith('image/');

        return (
            <div className={`relative aspect-square rounded-lg overflow-hidden border-2 border-dashed transition-all group/thumb ${isFeatured ? 'border-tan ring-2 ring-tan/20 shadow-md' : 'border-indigo-200'}`}>
                {isImage ? (
                    <img src={url} className="w-full h-full object-cover" alt="new" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-indigo-50 text-indigo-300">
                        <ImageIcon size={20} />
                    </div>
                )}
                <div className="absolute inset-0 bg-charcoal/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    <button
                        type="button"
                        onClick={() => onSetFeatured(url)}
                        className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors"
                        title="Set as Featured"
                    >
                        <CheckCircle size={14} />
                    </button>
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    className="absolute top-1 right-1 bg-red-600/80 text-white p-0.5 rounded-full shadow-sm z-20 opacity-0 group-hover/thumb:opacity-100 hover:bg-red-700 transition-all scale-75 group-hover/thumb:scale-100"
                    title="Remove"
                >
                    <X size={10} />
                </button>
                {isFeatured && (
                    <div className="absolute top-1 left-1 bg-tan text-white p-0.5 rounded-full shadow-sm z-20">
                        <CheckCircle size={10} />
                    </div>
                )}
            </div>
        );
    };

    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [item, setItem] = useState<ArchiveItem | null>(null);
    const [itemType, setItemType] = useState<ItemType>('Document');
    const [showAdvancedDC, setShowAdvancedDC] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [existingFileUrls, setExistingFileUrls] = useState<string[]>([]);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
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

    const removeExistingFile = (url: string) => {
        setExistingFileUrls(prev => {
            const newUrls = prev.filter(u => u !== url);
            if (featuredImageUrl === url) {
                setFeaturedImageUrl(newUrls.length > 0 ? newUrls[0] : null);
            }
            return newUrls;
        });
    };

    const removeNewFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };


    // Networking / Linking
    const [allFigures, setAllFigures] = useState<{ id: string, title: string }[]>([]);
    const [selectedRelatedFigures, setSelectedRelatedFigures] = useState<{ id: string, title: string }[]>([]);
    const [figureSearch, setFigureSearch] = useState('');
    const [showFigureResults, setShowFigureResults] = useState(false);

    const [allDocs, setAllDocs] = useState<{ id: string, title: string }[]>([]);
    const [selectedRelatedDocs, setSelectedRelatedDocs] = useState<{ id: string, title: string }[]>([]);
    const [docSearch, setDocSearch] = useState('');
    const [showDocResults, setShowDocResults] = useState(false);

    const [allOrgs, setAllOrgs] = useState<{ id: string, title: string }[]>([]);
    const [selectedRelatedOrgs, setSelectedRelatedOrgs] = useState<{ id: string, title: string }[]>([]);
    const [orgSearch, setOrgSearch] = useState('');
    const [showOrgResults, setShowOrgResults] = useState(false);

    // Collections
    const [collections, setCollections] = useState<Collection[]>([]);
    const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");

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
                    setSelectedCollectionId(item?.collection_id || "");
                }
            } else {
                setSelectedCollectionId(item?.collection_id || "");
            }
        } else {
            setSelectedCollectionId(val);
        }
    };

    useEffect(() => {
        const fetchItem = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'archive_items', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...(docSnap.data() || {}) } as ArchiveItem;
                    setItem(data);
                    setItemType(data.item_type || 'Document');
                    setSelectedCollectionId(data.collection_id || "");
                    setFeaturedImageUrl(data.featured_image_url || null);
                    setExistingFileUrls(data.file_urls || []);
                } else {
                    setError("Item not found.");
                }
            } catch (err) {
                console.error("Error fetching item:", err);
                setError("Failed to load item data.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchItem();

        const fetchCollections = async () => {
            try {
                const q = query(collection(db, 'collections'));
                const querySnapshot = await getDocs(q);
                const collectionsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Collection[];
                setCollections(collectionsData.sort((a, b) => a.title.localeCompare(b.title)));

                // Fetch all archive items once and filter in memory to avoid index requirements
                const qItemsAll = query(collection(db, 'archive_items'));
                const itemsSnapAll = await getDocs(qItemsAll);
                const allItemsData = itemsSnapAll.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

                const figsList = allItemsData
                    .filter(i => i.item_type === 'Historic Figure')
                    .map(i => ({ id: i.id, title: i.title || i.full_name || "Unnamed Figure" }));
                setAllFigures(figsList.sort((a, b) => a.title.localeCompare(b.title)));

                const docsList = allItemsData
                    .filter(i => i.item_type === 'Document')
                    .map(i => ({ id: i.id, title: i.title || "Untitled Document" }));
                setAllDocs(docsList.sort((a, b) => a.title.localeCompare(b.title)));

                const orgsList = allItemsData
                    .filter(i => i.item_type === 'Historic Organization')
                    .map(i => ({ id: i.id, title: i.title || i.org_name || "Unnamed Organization" }));
                setAllOrgs(orgsList.sort((a, b) => a.title.localeCompare(b.title)));

            } catch (error) {
                console.error("Error fetching collections/linked data:", error);
            }
        };
        fetchCollections();
    }, [id]);

    // Update selected linked items when item is loaded
    useEffect(() => {
        if (item && allFigures.length > 0) {
            const linkedFigs = allFigures.filter(f => item.related_figures?.includes(f.id));
            setSelectedRelatedFigures(linkedFigs);
        }
        if (item && allDocs.length > 0) {
            const linkedDocs = allDocs.filter(d => item.related_documents?.includes(d.id));
            setSelectedRelatedDocs(linkedDocs);
        }
        if (item && allOrgs.length > 0) {
            const linkedOrgs = allOrgs.filter(o => item.related_organizations?.includes(o.id));
            setSelectedRelatedOrgs(linkedOrgs);
        }
    }, [item, allFigures, allDocs]);

    const handleAutoExtract = async () => {
        const input = fileInputRef.current;
        if (!input || !input.files || input.files.length === 0) {
            setError("Please select a new file first to extract metadata from it.");
            return;
        }

        const file = input.files[0];
        setIsExtracting(true);
        setError(null);

        try {
            const metadata = await extractMetadataFromFile(file);
            console.log("Extracted Metadata:", metadata);

            const form = document.querySelector('form') as HTMLFormElement;
            if (!form) return;

            const setVal = (name: string, val?: string | null) => {
                const el = form.elements.namedItem(name);
                if (el) (el as HTMLInputElement).value = val || '';
            }

            if (metadata.dc_type?.toLowerCase().includes('text') || metadata.dc_type?.toLowerCase().includes('document')) {
                setItemType('Document');
            } else if (metadata.dc_type?.toLowerCase().includes('person') || metadata.dc_type?.toLowerCase().includes('figure')) {
                setItemType('Historic Figure');
            }

            setVal('title', metadata.title);
            setVal('description', metadata.description);
            setVal('transcription', metadata.transcription);
            setVal('date', metadata.date);
            setVal('creator', metadata.creator);
            setVal('subject', metadata.subject);
            setVal('tags', metadata.tags?.join(', '));
            setVal('publisher', metadata.publisher);
            setVal('contributor', metadata.contributor);
            setVal('rights', metadata.rights);
            setVal('relation', metadata.relation);
            setVal('format', metadata.format);
            setVal('language', metadata.language);
            setVal('dc_type', metadata.dc_type);
            setVal('archive_reference', metadata.archive_reference);
            setVal('identifier', metadata.identifier);
            setVal('source', metadata.source);
            setVal('coverage', metadata.coverage);

            if (metadata.publisher || metadata.language || metadata.format || metadata.identifier || metadata.coverage) {
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
        if (!id || !item) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const formData = new FormData(e.target as HTMLFormElement);

            const newFiles = selectedFiles;
            let fileUrls: string[] = [...existingFileUrls];
            let finalFeaturedUrl = featuredImageUrl;

            if (newFiles.length > 0) {
                const totalFiles = newFiles.length;
                let completedFiles = 0;
                setUploadProgress(0);

                for (let i = 0; i < newFiles.length; i++) {
                    const file = newFiles[i];
                    const blobUrl = fileObjectURLs.get(file);

                    const storageRef = ref(storage, `archive_media/${Date.now()}_${file.name}`);
                    const uploadTask = uploadBytesResumable(storageRef, file);

                    await new Promise<void>((resolve, reject) => {
                        uploadTask.on('state_changed',
                            (snapshot) => {
                                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                const overallProgress = ((completedFiles * 100) + progress) / totalFiles;
                                setUploadProgress(Math.round(overallProgress));
                            },
                            reject,
                            async () => {
                                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                                fileUrls.push(downloadUrl);

                                if (featuredImageUrl === blobUrl) {
                                    finalFeaturedUrl = downloadUrl;
                                }

                                completedFiles++;
                                resolve();
                            }
                        );
                    });
                }
            }

            // Parse tags
            const tagsString = formData.get('tags') as string;
            const tags = tagsString ? tagsString.split(',').map(t => t.trim()).filter(Boolean) : [];

            const updateData: Partial<ArchiveItem> = {
                item_type: itemType,
                file_urls: fileUrls,
                featured_image_url: finalFeaturedUrl || (fileUrls.length > 0 ? fileUrls[0] : null),
                tags: tags,
                collection_id: (formData.get('collection_id') as string) || "",
                updated_at: new Date().toISOString(),

                // Core DC Elements
                title: formData.get('title') as string || "",
                description: formData.get('description') as string || "",
                transcription: formData.get('transcription') as string || "",
                archive_reference: formData.get('archive_reference') as string || "",
                date: formData.get('date') as string || "",
                creator: formData.get('creator') as string || "",
                subject: formData.get('subject') as string || "",

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
                coverage: formData.get('coverage') as string || "",

                // SAHS Archival Tracking
                condition: (formData.get('condition') as any) || null,
                physical_location: (formData.get('physical_location') as any) || null,
                historical_address: formData.get('historical_address') as string || "",
                category: formData.get('category') as string || "",

                // Linking
                related_figures: selectedRelatedFigures.map(f => f.id),
                related_documents: selectedRelatedDocs.map(d => d.id),
                related_organizations: selectedRelatedOrgs.map(o => o.id),

                donor: formData.get('donor') as string || "",

                artifact_id: formData.get('artifact_id') as string || "",
                artifact_type: formData.get('artifact_type') as string || "",
                museum_location: formData.get('museum_location') as string || "",
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
            };

            await updateDoc(doc(db, 'archive_items', id), updateData);
            setSuccess(true);
        } catch (err: any) {
            console.error("Error updating item: ", err);
            setError(err.message || "Failed to update item. Please check your Firebase configuration.");
        } finally {
            setIsSubmitting(false);
        }
    };

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

    if (isLoading) {
        return <div className="flex justify-center items-center h-full text-charcoal/60 font-serif text-lg">Loading archive details...</div>;
    }

    if (success) {
        return (
            <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-tan-light/50 text-tan rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={32} />
                </div>
                <h2 className="text-3xl font-serif font-bold text-charcoal mb-2">Item Updated</h2>
                <p className="text-charcoal/70 mb-8 text-center max-w-md">The archive item metadata has been successfully updated.</p>
                <div className="flex gap-4">
                    <button
                        onClick={() => navigate(`/archive`)}
                        className="bg-cream border border-tan-light/50 text-charcoal px-6 py-3 rounded-lg font-medium hover:bg-tan-light/20 transition-colors"
                    >
                        Return to Archive
                    </button>
                    <button
                        onClick={() => navigate(`/items/${id}`)}
                        className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors"
                    >
                        View Item
                    </button>
                </div>
            </div>
        )
    }

    if (!item) return null;

    return (
        <div className="max-w-5xl mx-auto h-full flex flex-col pb-12">
            <div className="mb-8 border-b border-tan-light/50 pb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <Edit2 className="text-tan" size={32} />
                        Edit Archive Item
                    </h1>
                    <p className="text-charcoal/70 text-lg">Updating details for {item.title}</p>
                </div>
                <button onClick={() => navigate(-1)} className="text-sm font-medium text-charcoal/60 hover:text-charcoal">Cancel</button>
            </div>

            {error && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p className="font-medium text-sm">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-tan-light/50 shadow-sm flex flex-col overflow-hidden">

                {/* Top Section: Item Type & Primary File */}
                <div className="p-8 border-b border-tan-light/50 bg-cream/30">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Item Type *</label>
                            <div className="flex bg-white rounded-lg border border-tan-light/50 p-1 mb-6 flex-wrap gap-1">
                                {(["Document", "Historic Figure", "Historic Organization", "Artifact"] as const).map(type => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setItemType(type)}
                                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${itemType === type ? 'bg-tan text-white shadow-sm' : 'text-charcoal/60 hover:text-charcoal hover:bg-cream'}`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center justify-between mb-3 underline underline-offset-4 decoration-tan/30">
                                <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider">Archive Gallery / Media</label>
                                {(existingFileUrls.length > 0 || selectedFiles.length > 0) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setExistingFileUrls([]);
                                            setSelectedFiles([]);
                                            setFeaturedImageUrl(null);
                                        }}
                                        className="text-[10px] font-black uppercase text-red-500 hover:text-red-700 tracking-widest transition-colors flex items-center gap-1"
                                    >
                                        <X size={10} /> Wipe Gallery
                                    </button>
                                )}
                            </div>

                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-tan-light bg-white rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-colors h-40 relative overflow-hidden group mb-6"
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
                                            setSelectedFiles(prev => [...prev, ...Array.from(files)]);
                                        }
                                        e.target.value = '';
                                    }}
                                />
                                <div className="w-10 h-10 bg-cream rounded-full flex items-center justify-center text-tan shadow-sm mb-2 group-hover:scale-110 transition-transform">
                                    <ImageIcon size={20} />
                                </div>
                                <p className="font-bold text-sm text-charcoal mb-0.5">Click to append scans</p>
                                <p className="text-[10px] text-charcoal/50">Multiple PNG, JPG, or PDF allowed</p>
                            </div>

                            {/* Image Grid: Existing and New */}
                            {(existingFileUrls.length > 0 || selectedFiles.length > 0) && (
                                <div className="space-y-4 mb-6">
                                    <div className="grid grid-cols-4 gap-2">
                                        {/* Existing Files */}
                                        {existingFileUrls.map((url, idx) => (
                                            <div key={`existing-${idx}`} className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group/thumb ${featuredImageUrl === url ? 'border-tan ring-2 ring-tan/20 shadow-md' : 'border-tan-light/30'}`}>
                                                <img src={url} className="w-full h-full object-cover" alt="existing" />
                                                <div className="absolute inset-0 bg-charcoal/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setFeaturedImageUrl(url)}
                                                        className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors"
                                                        title="Set as Featured"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeExistingFile(url)}
                                                    className="absolute top-1 right-1 bg-red-600/80 text-white p-0.5 rounded-full shadow-sm z-20 opacity-0 group-hover/thumb:opacity-100 hover:bg-red-700 transition-all scale-75 group-hover/thumb:scale-100"
                                                    title="Remove from Record"
                                                >
                                                    <X size={10} />
                                                </button>
                                                {featuredImageUrl === url && (
                                                    <div className="absolute top-1 left-1 bg-tan text-white p-0.5 rounded-full shadow-sm z-20">
                                                        <CheckCircle size={10} />
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        {/* New Pending Files */}
                                        {selectedFiles.map((file, idx) => {
                                            const url = fileObjectURLs.get(file) || '';
                                            return (
                                                <PendingFilePreview
                                                    key={`new-${idx}-${file.name}`}
                                                    file={file}
                                                    url={url}
                                                    isFeatured={featuredImageUrl === url}
                                                    onSetFeatured={(url) => setFeaturedImageUrl(url)}
                                                    onRemove={() => removeNewFile(idx)}
                                                />
                                            );
                                        })}
                                    </div>
                                    <p className="text-[10px] text-charcoal/40 italic flex items-center gap-1">
                                        <Sparkles size={10} /> Dash-border items are pending upload and will be saved when you click "Save Changes"
                                    </p>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={handleAutoExtract}
                                disabled={isExtracting || selectedFiles.length === 0}
                                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold text-sm transition-all border ${isExtracting
                                    ? 'bg-tan-light/20 text-tan border-tan-light/50 cursor-not-allowed'
                                    : selectedFiles.length === 0
                                        ? 'bg-cream/50 text-charcoal/30 border-tan-light/30 cursor-not-allowed'
                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:shadow-sm'
                                    }`}
                            >
                                <Sparkles size={16} className={isExtracting ? 'animate-pulse' : ''} />
                                {isExtracting ? 'Analyzing Document with AI...' : 'Auto-Extract from Newest Scan'}
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label htmlFor="title" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Title / Name *</label>
                                <input required type="text" name="title" id="title" defaultValue={item.title ?? undefined} placeholder={itemType === 'Document' ? "e.g. 1920 City Council Minutes" : itemType === 'Historic Organization' ? "e.g. Senoia General Store" : itemType === 'Artifact' ? "e.g. Civil War Bayonet" : "e.g. William Senoia"} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans" />
                            </div>

                            {itemType === 'Historic Organization' ? (
                                <>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label htmlFor="org_name" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Full Organization Name</label>
                                            <input type="text" name="org_name" id="org_name" defaultValue={item.org_name ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label htmlFor="alternative_names" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Alternative Names / Former Names</label>
                                            <input type="text" name="alternative_names" id="alternative_names" defaultValue={item.alternative_names ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="founding_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Founding Date</label>
                                            <input type="text" name="founding_date" id="founding_date" defaultValue={item.founding_date ?? undefined} placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="dissolved_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Closed / Dissolved Date</label>
                                            <input type="text" name="dissolved_date" id="dissolved_date" defaultValue={item.dissolved_date ?? undefined} placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                </>
                            ) : itemType === 'Historic Figure' ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="full_name" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Full Given Name</label>
                                            <input type="text" name="full_name" id="full_name" defaultValue={item.full_name ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="also_known_as" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Also Known As / Alias</label>
                                            <input type="text" name="also_known_as" id="also_known_as" defaultValue={item.also_known_as ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="birth_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Birth Date</label>
                                            <input type="text" name="birth_date" id="birth_date" defaultValue={item.birth_date ?? undefined} placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="death_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Death Date</label>
                                            <input type="text" name="death_date" id="death_date" defaultValue={item.death_date ?? undefined} placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="birthplace" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Birthplace</label>
                                            <input type="text" name="birthplace" id="birthplace" defaultValue={item.birthplace ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="occupation" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Occupation / Title</label>
                                            <input type="text" name="occupation" id="occupation" defaultValue={item.occupation ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
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
                                                    <select name="artifact_type" id="artifact_type" defaultValue={item.artifact_type ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                        {["textile", "photo", "print", "award/trophy", "memorabilia", "furniture", "ceramics", "miscellaneous", "technology", "signs", "jewelry", "metal", "glass", "agriculture"].map(t => (
                                                            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <label htmlFor="category" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Category</label>
                                                <div className="relative">
                                                    <select name="category" id="category" defaultValue={item.category ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                        {["Manuscript", "Photograph", "Map", "Artifact", "Letter", "Newspaper", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                                </div>
                                            </div>
                                        )}
                                        {itemType === 'Artifact' ? (
                                            <div>
                                                <label htmlFor="artifact_id" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">ID #</label>
                                                <input type="text" name="artifact_id" id="artifact_id" defaultValue={item.artifact_id ?? undefined} placeholder="e.g. 2024.01.05" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                            </div>
                                        ) : (
                                            <div>
                                                <label htmlFor="collection_id" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Collection</label>
                                                <select name="collection_id" id="collection_id" value={selectedCollectionId} onChange={handleCollectionChange} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans appearance-none text-sm">
                                                    <option value="">-- No Collection --</option>
                                                    {collections.map(c => (
                                                        <option key={c.id} value={c.id}>{c.title}</option>
                                                    ))}
                                                    <option value="NEW_COLLECTION" className="font-bold text-tan">+ Create New Collection...</option>
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="condition" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Condition</label>
                                            <div className="relative">
                                                <select name="condition" id="condition" defaultValue={item.condition ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                    {["Excellent", "Good", "Fair", "Poor", "Fragile", "Needs To Be Rescanned"].map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor="date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Date (e.g. 1920, c. 1905)</label>
                                            <input type="text" name="date" id="date" defaultValue={item.date ?? undefined} placeholder="Approximate or Exact Date" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 mt-4">
                                        <div>
                                            <label htmlFor="historical_address" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Historical Physical Address (For Map View)</label>
                                            <input type="text" name="historical_address" id="historical_address" defaultValue={item.historical_address ?? undefined} placeholder="e.g. 123 Main St, Senoia, GA" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="physical_location" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">File Location</label>
                                            <div className="relative">
                                                <select name="physical_location" id="physical_location" defaultValue={item.physical_location ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                    <option value="SAHS (Physical Archive)">SAHS (Physical Archive)</option>
                                                    <option value="Digital Archive">Digital Archive</option>
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div>
                                <label htmlFor="description" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">{itemType === 'Historic Figure' ? 'Biography *' : itemType === 'Historic Organization' ? 'History & Description *' : itemType === 'Artifact' ? 'Physical Description & History *' : 'Description / History *'}</label>
                                <textarea required id="description" name="description" defaultValue={item.description ?? undefined} placeholder={itemType === 'Document' ? "Historical context, transcriptions..." : itemType === 'Historic Organization' ? "Historical details, mission, key figures, and legacy..." : itemType === 'Artifact' ? "Physical details, materials, historical use, and significance..." : "Life history, achievements..."} className="w-full min-h-[160px] bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans resize-none"></textarea>
                            </div>

                            <div>
                                <label htmlFor="transcription" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Transcription</label>
                                <textarea id="transcription" name="transcription" defaultValue={item.transcription ?? undefined} placeholder="Exact word-for-word OCR transcription (if applicable)..." className="w-full min-h-[160px] bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans resize-none"></textarea>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Core Dublin Core Section */}
                <div className="p-8">
                    <h3 className="text-lg font-serif font-bold text-charcoal mb-6 flex items-center gap-2">
                        <BookOpen size={20} className="text-tan" />
                        Core Archival Metadata
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {itemType !== 'Artifact' && (
                            <>
                                <div>
                                    <label htmlFor="archive_reference" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Filing Code</label>
                                    <input type="text" name="archive_reference" id="archive_reference" defaultValue={item.archive_reference ?? undefined} placeholder="e.g. SAHS-2024-001" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="identifier" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Archive Reference</label>
                                    <input type="text" name="identifier" id="identifier" defaultValue={item.identifier ?? undefined} placeholder="e.g. LTR_Jun. 14, 1945" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                                </div>
                            </>
                        )}
                        <div>
                            <label htmlFor="subject" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Subject (DC:Subject)</label>
                            <input type="text" name="subject" id="subject" defaultValue={item.subject ?? undefined} placeholder="Topic keywords" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="creator" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Creator (DC:Creator)</label>
                            <input type="text" name="creator" id="creator" defaultValue={item.creator ?? undefined} placeholder="Author, photographer, or originating body" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="donor" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Original Donor / Contributor</label>
                            <input type="text" name="donor" id="donor" defaultValue={item.donor ?? undefined} placeholder="Donated by" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="subject" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Subject (DC:Subject)</label>
                            <input type="text" name="subject" id="subject" defaultValue={item.subject ?? undefined} placeholder="Topic keywords" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="tags" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Archive Tags (Comma Separated)</label>
                            <input type="text" name="tags" id="tags" defaultValue={item.tags?.join(', ')} placeholder="e.g. Civil War, Main Street, Architecture" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div className="md:col-span-2">
                            <label htmlFor="museum_location" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Museum Location (Specific Shelf/Box)</label>
                            <input type="text" name="museum_location" id="museum_location" defaultValue={item.museum_location ?? undefined} placeholder="e.g. Shelf 4, Drawer B, Box 12" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                    </div>

                    {/* Advanced Dublin Core Accordion */}
                    <div className="border border-tan-light/50 rounded-lg overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowAdvancedDC(!showAdvancedDC)}
                            className="w-full px-6 py-4 bg-cream/50 flex justify-between items-center text-charcoal font-medium hover:bg-cream transition-colors"
                        >
                            <span className="font-serif">Extended Dublin Core Elements</span>
                            {showAdvancedDC ? <ChevronUp size={20} className="text-charcoal/50" /> : <ChevronDown size={20} className="text-charcoal/50" />}
                        </button>

                        {showAdvancedDC && (
                            <div className="p-6 bg-white grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-tan-light/50">
                                <div>
                                    <label htmlFor="publisher" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Publisher</label>
                                    <input type="text" name="publisher" id="publisher" defaultValue={item.publisher ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="contributor" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Contributor</label>
                                    <input type="text" name="contributor" id="contributor" defaultValue={item.contributor ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="rights" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Rights</label>
                                    <input type="text" name="rights" id="rights" defaultValue={item.rights ?? undefined} placeholder="e.g. Public Domain" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="relation" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Relation</label>
                                    <input type="text" name="relation" id="relation" defaultValue={item.relation ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="format" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Format</label>
                                    <input type="text" name="format" id="format" defaultValue={item.format ?? undefined} placeholder="e.g. 8x10 photograph, 2 pages" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="language" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Language</label>
                                    <input type="text" name="language" id="language" defaultValue={item.language ?? undefined} placeholder="e.g. English" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="dc_type" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">DC Type</label>
                                    <input type="text" name="dc_type" id="dc_type" defaultValue={item.type ?? undefined} placeholder="e.g. StillImage, Text" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="source" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Source</label>
                                    <input type="text" name="source" id="source" defaultValue={item.source ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="coverage" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Coverage</label>
                                    <input type="text" name="coverage" id="coverage" defaultValue={item.coverage ?? undefined} placeholder="Spatial or temporal topic" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="mb-8 p-6 bg-cream/10 border border-tan-light/50 rounded-xl space-y-6">
                    {itemType !== 'Historic Figure' ? (
                        <div>
                            <label className="block text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-3">Connect Historic Figures</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search people..."
                                    className="w-full bg-white border border-tan-light/50 px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-tan/20 transition-all text-sm"
                                    value={figureSearch}
                                    onChange={(e) => {
                                        setFigureSearch(e.target.value);
                                        setShowFigureResults(true);
                                    }}
                                    onFocus={() => setShowFigureResults(true)}
                                />

                                {showFigureResults && (
                                    <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-tan-light rounded-xl shadow-xl max-h-48 overflow-auto">
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
                                                    className="w-full text-left px-4 py-3 hover:bg-cream border-b border-tan-light/20 last:border-0 flex items-center justify-between group text-sm"
                                                >
                                                    <span className="font-medium text-charcoal">{fig.title}</span>
                                                    <Edit2 size={12} className="text-tan opacity-0 group-hover:opacity-100 transition-opacity" />
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
                                        <div key={fig.id} className="flex items-center gap-2 bg-tan text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider animate-in zoom-in duration-200">
                                            {fig.title}
                                            <button type="button" onClick={() => setSelectedRelatedFigures(selectedRelatedFigures.filter(f => f.id !== fig.id))} className="hover:text-charcoal transition-colors">
                                                <ChevronUp size={12} className="rotate-45" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}


                        </div>
                    ) : (
                        <div>
                            <label className="block text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-3">Link To Documents</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search documents..."
                                    className="w-full bg-white border border-tan-light/50 px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-tan/20 transition-all text-sm"
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
                                                    className="w-full text-left px-4 py-3 hover:bg-cream border-b border-tan-light/20 last:border-0 flex items-center justify-between group text-sm"
                                                >
                                                    <span className="font-medium text-charcoal">{doc.title}</span>
                                                    <Edit2 size={12} className="text-tan opacity-0 group-hover:opacity-100 transition-opacity" />
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
                                        <div key={doc.id} className="flex items-center gap-2 bg-charcoal text-cream px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider animate-in zoom-in duration-200">
                                            {doc.title}
                                            <button type="button" onClick={() => setSelectedRelatedDocs(selectedRelatedDocs.filter(d => d.id !== doc.id))} className="hover:text-tan transition-colors">
                                                <ChevronUp size={12} className="rotate-45" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="pt-6 border-t border-tan-light/30">
                        <label className="block text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-3">Connect Historic Organizations</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search organizations..."
                                className="w-full bg-white border border-tan-light/50 px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-tan/20 transition-all text-sm"
                                value={orgSearch}
                                onChange={(e) => {
                                    setOrgSearch(e.target.value);
                                    setShowOrgResults(true);
                                }}
                                onFocus={() => setShowOrgResults(true)}
                            />

                            {showOrgResults && (
                                <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-tan-light rounded-xl shadow-xl max-h-48 overflow-auto">
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
                                                className="w-full text-left px-4 py-3 hover:bg-cream border-b border-tan-light/20 last:border-0 flex items-center justify-between group text-sm"
                                            >
                                                <span className="font-medium text-charcoal">{org.title}</span>
                                                <Edit2 size={12} className="text-tan opacity-0 group-hover:opacity-100 transition-opacity" />
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
                                    <div key={org.id} className="flex items-center gap-2 bg-charcoal text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider animate-in zoom-in duration-200">
                                        {org.title}
                                        <button type="button" onClick={() => setSelectedRelatedOrgs(selectedRelatedOrgs.filter(o => o.id !== org.id))} className="hover:text-tan transition-colors">
                                            <ChevronUp size={12} className="rotate-45" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 bg-cream/30 border-t border-tan-light/50 flex justify-end">
                    {uploadProgress !== null && (
                        <div className="flex-1 mr-8">
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[10px] font-black uppercase text-tan tracking-widest">Uploading Media Gallery...</span>
                                <span className="text-[10px] font-black text-tan">{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-tan-light/20 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-tan h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                            </div>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-tan text-white px-8 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Saving Changes...
                            </>
                        ) : 'Save Changes'}
                    </button>
                </div>

            </form>
        </div>
    );
}
