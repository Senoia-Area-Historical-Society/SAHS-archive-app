import { useState, useRef, useEffect } from 'react';
import { Edit2, Image as ImageIcon, CheckCircle, AlertCircle, ChevronDown, ChevronUp, BookOpen, Sparkles } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useParams, useNavigate } from 'react-router-dom';
import { extractMetadataFromFile } from '../lib/gemini';
import type { ArchiveItem, ItemType, Collection } from '../types/database';

export function EditItem() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [item, setItem] = useState<ArchiveItem | null>(null);
    const [itemType, setItemType] = useState<ItemType>('Document');
    const [showAdvancedDC, setShowAdvancedDC] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);

    // Collections
    const [collections, setCollections] = useState<Collection[]>([]);

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
                const q = query(collection(db, 'collections'), orderBy('title', 'asc'));
                const querySnapshot = await getDocs(q);
                const collectionsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Collection[];
                setCollections(collectionsData);
            } catch (error) {
                console.error("Error fetching collections:", error);
            }
        };
        fetchCollections();
    }, [id]);

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

            const setVal = (name: string, val?: string) => {
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

            const file = formData.get('fileUpload') as File | null;
            let fileUrls: string[] = item.file_urls || [];

            if (file && file.size > 0) {
                const storageRef = ref(storage, `archive_media/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                const downloadUrl = await getDownloadURL(snapshot.ref);
                // For simplicity now, replacing the primary image
                fileUrls = [downloadUrl];
            }

            // Parse tags
            const tagsString = formData.get('tags') as string;
            const tags = tagsString ? tagsString.split(',').map(t => t.trim()).filter(Boolean) : [];

            const updateData = {
                item_type: itemType,
                file_urls: fileUrls,
                tags: tags,
                collection_id: formData.get('collection_id') as string,
                updated_at: new Date().toISOString(),

                // Core DC Elements
                title: formData.get('title') as string,
                description: formData.get('description') as string || "",
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
        <div className="max-w-4xl mx-auto h-full flex flex-col pb-12">
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
                            <div className="flex bg-white rounded-lg border border-tan-light/50 p-1 mb-6">
                                {(["Document", "Historic Figure"] as const).map(type => (
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

                            <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Primary Upload</label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-tan-light bg-white rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-colors h-48 relative overflow-hidden"
                            >
                                {item.file_urls?.[0] && !selectedFileName && (
                                    <img src={item.file_urls[0]} alt="Current item scan" className="absolute inset-0 w-full h-full object-cover opacity-20" />
                                )}
                                <input
                                    type="file"
                                    name="fileUpload"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/png, image/jpeg, application/pdf"
                                    onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name || null)}
                                />
                                <div className="w-12 h-12 bg-cream rounded-full flex items-center justify-center text-tan shadow-sm mb-3 relative z-10">
                                    <ImageIcon size={24} />
                                </div>
                                {selectedFileName ? (
                                    <p className="font-medium text-sm text-charcoal mb-1 relative z-10"><span className="text-tan">{selectedFileName}</span></p>
                                ) : (
                                    <>
                                        <p className="font-medium text-sm text-charcoal mb-1 relative z-10"><span className="text-tan hover:underline">Click to upload new file</span></p>
                                        <p className="text-xs text-charcoal/50 relative z-10">Leave empty to keep current file</p>
                                    </>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={handleAutoExtract}
                                disabled={isExtracting || !selectedFileName}
                                className={`mt-4 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold text-sm transition-all border ${isExtracting
                                        ? 'bg-tan-light/20 text-tan border-tan-light/50 cursor-not-allowed'
                                        : !selectedFileName
                                            ? 'bg-cream/50 text-charcoal/30 border-tan-light/30 cursor-not-allowed'
                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:shadow-sm'
                                    }`}
                                title={!selectedFileName ? "Select a new file above to extract metadata" : "Extract metadata from the selected file"}
                            >
                                <Sparkles size={16} className={isExtracting ? 'animate-pulse' : ''} />
                                {isExtracting ? 'Analyzing Document with AI...' : 'Auto-Extract Metadata with AI'}
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label htmlFor="title" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Title *</label>
                                <input required type="text" name="title" id="title" defaultValue={item.title} placeholder={itemType === 'Document' ? "e.g. 1920 City Council Minutes" : "e.g. William Senoia"} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans" />
                            </div>

                            <div>
                                <label htmlFor="collection_id" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Collection</label>
                                <select name="collection_id" id="collection_id" defaultValue={item.collection_id || ""} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans appearance-none">
                                    <option value="">-- No Collection --</option>
                                    {collections.map(c => (
                                        <option key={c.id} value={c.id}>{c.title}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label htmlFor="description" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Description / Biography *</label>
                                <textarea required id="description" name="description" defaultValue={item.description} placeholder={itemType === 'Document' ? "Historical context, transcriptions..." : "Life history, achievements..."} className="w-full min-h-[160px] bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans resize-none"></textarea>
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
                        <div>
                            <label htmlFor="date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Date (DC:Date)</label>
                            <input type="text" name="date" id="date" defaultValue={item.date} placeholder="e.g. c. 1905, 1850-1920" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="creator" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Creator (DC:Creator)</label>
                            <input type="text" name="creator" id="creator" defaultValue={item.creator} placeholder="Author, photographer, or originating body" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="subject" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Subject (DC:Subject)</label>
                            <input type="text" name="subject" id="subject" defaultValue={item.subject} placeholder="Topic keywords" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="tags" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Tags (Comma Separated)</label>
                            <input type="text" name="tags" id="tags" defaultValue={item.tags?.join(', ')} placeholder="e.g. Civil War, Main Street, Architecture" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
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
                                    <input type="text" name="publisher" id="publisher" defaultValue={item.publisher} className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="contributor" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Contributor</label>
                                    <input type="text" name="contributor" id="contributor" defaultValue={item.contributor} className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="rights" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Rights</label>
                                    <input type="text" name="rights" id="rights" defaultValue={item.rights} placeholder="e.g. Public Domain" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="relation" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Relation</label>
                                    <input type="text" name="relation" id="relation" defaultValue={item.relation} className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="format" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Format</label>
                                    <input type="text" name="format" id="format" defaultValue={item.format} placeholder="e.g. 8x10 photograph, 2 pages" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="language" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Language</label>
                                    <input type="text" name="language" id="language" defaultValue={item.language} placeholder="e.g. English" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="dc_type" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">DC Type</label>
                                    <input type="text" name="dc_type" id="dc_type" defaultValue={item.type} placeholder="e.g. StillImage, Text" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="identifier" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Identifier</label>
                                    <input type="text" name="identifier" id="identifier" defaultValue={item.identifier} placeholder="e.g. Archive Ref # SAHS-192" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="source" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Source</label>
                                    <input type="text" name="source" id="source" defaultValue={item.source} className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="coverage" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Coverage</label>
                                    <input type="text" name="coverage" id="coverage" defaultValue={item.coverage} placeholder="Spatial or temporal topic" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 bg-cream/30 border-t border-tan-light/50 flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-tan text-white px-8 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
                    </button>
                </div>

            </form>
        </div>
    );
}
