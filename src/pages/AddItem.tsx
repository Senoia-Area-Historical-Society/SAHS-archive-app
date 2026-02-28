import { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, CheckCircle, AlertCircle, ChevronDown, ChevronUp, BookOpen, Sparkles } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { extractMetadataFromFile } from '../lib/gemini';
import type { ItemType, Collection } from '../types/database';

export function AddItem() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [itemType, setItemType] = useState<ItemType>('Document');
    const [showAdvancedDC, setShowAdvancedDC] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);

    // Collections
    const [collections, setCollections] = useState<Collection[]>([]);

    useEffect(() => {
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
    }, []);

    const handleAutoExtract = async () => {
        const input = fileInputRef.current;
        if (!input || !input.files || input.files.length === 0) {
            setError("Please select a file first before extracting metadata.");
            return;
        }

        const file = input.files[0];
        setIsExtracting(true);
        setError(null);

        try {
            const metadata = await extractMetadataFromFile(file);
            console.log("Extracted Metadata:", metadata);

            // Auto-fill the form fields. We cast elements to HTMLInputElement/HTMLTextAreaElement
            const form = document.getElementById('add-item-form') as HTMLFormElement;
            if (!form) return;

            const setVal = (name: string, val?: string) => {
                const el = form.elements.namedItem(name);
                if (el) (el as HTMLInputElement).value = val || '';
            }

            // If the model gave us a hint what type it is, we can set it
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

            // Automatically open advanced elements if the AI filled any out
            if (metadata.publisher || metadata.language || metadata.format || metadata.identifier || metadata.coverage) {
                setShowAdvancedDC(true);
            }

            // Focus the title to show it worked
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

            const file = formData.get('fileUpload') as File | null;
            let fileUrls: string[] = [];

            if (file && file.size > 0) {
                const storageRef = ref(storage, `archive_media/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                const downloadUrl = await getDownloadURL(snapshot.ref);
                fileUrls.push(downloadUrl);
            }

            // Parse tags
            const tagsString = formData.get('tags') as string;
            const tags = tagsString ? tagsString.split(',').map(t => t.trim()).filter(Boolean) : [];

            const itemData = {
                item_type: itemType,
                file_urls: fileUrls,
                tags: tags,
                collection_id: formData.get('collection_id') as string,
                created_at: new Date().toISOString(),

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

            await addDoc(collection(db, 'archive_items'), itemData);
            setSuccess(true);
        } catch (err: any) {
            console.error("Error adding item: ", err);
            setError(err.message || "Failed to add item. Please check your Firebase configuration.");
        } finally {
            setIsSubmitting(false);
        }
    };

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
                        setSelectedFileName(null);
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
        <div className="max-w-4xl mx-auto h-full flex flex-col pb-12">
            <div className="mb-8 border-b border-tan-light/50 pb-6">
                <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                    <Upload className="text-tan" size={32} />
                    Ingest Archive Item
                </h1>
                <p className="text-charcoal/70 text-lg">Add a new document, photograph, or historic figure profile to the database.</p>
            </div>

            {error && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p className="font-medium text-sm">{error}</p>
                </div>
            )}

            <form id="add-item-form" onSubmit={handleSubmit} className="bg-white rounded-xl border border-tan-light/50 shadow-sm flex flex-col overflow-hidden">

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
                                className="border-2 border-dashed border-tan-light bg-white rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-colors h-48"
                            >
                                <input
                                    type="file"
                                    name="fileUpload"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/png, image/jpeg, application/pdf"
                                    onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name || null)}
                                />
                                <div className="w-12 h-12 bg-cream rounded-full flex items-center justify-center text-tan shadow-sm mb-3">
                                    <ImageIcon size={24} />
                                </div>
                                {selectedFileName ? (
                                    <p className="font-medium text-sm text-charcoal mb-1"><span className="text-tan">{selectedFileName}</span></p>
                                ) : (
                                    <>
                                        <p className="font-medium text-sm text-charcoal mb-1"><span className="text-tan hover:underline">Click to upload</span> or drag</p>
                                        <p className="text-xs text-charcoal/50">PNG, JPG, PDF (Max 50MB)</p>
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
                            >
                                <Sparkles size={16} className={isExtracting ? 'animate-pulse' : ''} />
                                {isExtracting ? 'Analyzing Document with AI...' : 'Auto-Extract Metadata with AI'}
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label htmlFor="title" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Title *</label>
                                <input required type="text" name="title" id="title" placeholder={itemType === 'Document' ? "e.g. 1920 City Council Minutes" : "e.g. William Senoia"} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans" />
                            </div>

                            <div>
                                <label htmlFor="collection_id" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Collection</label>
                                <select name="collection_id" id="collection_id" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans appearance-none">
                                    <option value="">-- No Collection --</option>
                                    {collections.map(c => (
                                        <option key={c.id} value={c.id}>{c.title}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label htmlFor="description" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Description / Biography *</label>
                                <textarea required id="description" name="description" placeholder={itemType === 'Document' ? "Historical context, transcriptions..." : "Life history, achievements..."} className="w-full min-h-[160px] bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans resize-none"></textarea>
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
                            <input type="text" name="date" id="date" placeholder="e.g. c. 1905, 1850-1920" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="creator" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Creator (DC:Creator)</label>
                            <input type="text" name="creator" id="creator" placeholder="Author, photographer, or originating body" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="subject" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Subject (DC:Subject)</label>
                            <input type="text" name="subject" id="subject" placeholder="Topic keywords" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="tags" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Tags (Comma Separated)</label>
                            <input type="text" name="tags" id="tags" placeholder="e.g. Civil War, Main Street, Architecture" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
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
                                    <input type="text" name="publisher" id="publisher" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="contributor" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Contributor</label>
                                    <input type="text" name="contributor" id="contributor" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="rights" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Rights</label>
                                    <input type="text" name="rights" id="rights" placeholder="e.g. Public Domain" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="relation" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Relation</label>
                                    <input type="text" name="relation" id="relation" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="format" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Format</label>
                                    <input type="text" name="format" id="format" placeholder="e.g. 8x10 photograph, 2 pages" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="language" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Language</label>
                                    <input type="text" name="language" id="language" placeholder="e.g. English" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="dc_type" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">DC Type</label>
                                    <input type="text" name="dc_type" id="dc_type" placeholder="e.g. StillImage, Text" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="identifier" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Identifier</label>
                                    <input type="text" name="identifier" id="identifier" placeholder="e.g. Archive Ref # SAHS-192" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="source" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Source</label>
                                    <input type="text" name="source" id="source" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="coverage" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Coverage</label>
                                    <input type="text" name="coverage" id="coverage" placeholder="Spatial or temporal topic" className="w-full bg-white border border-tan-light/50 px-4 py-2 rounded-lg text-sm" />
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
                        {isSubmitting ? 'Saving to Archive...' : 'Save Archive Item'}
                    </button>
                </div>

            </form>
        </div>
    );
}
