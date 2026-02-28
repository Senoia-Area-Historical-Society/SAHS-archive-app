import { useState, useRef, useEffect } from 'react';
import { Edit2, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useParams, useNavigate } from 'react-router-dom';
import type { DocumentRecord } from '../types/database';

export function EditDocument() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null);

    useEffect(() => {
        const fetchDocument = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'documents', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setDocumentRecord({ id: docSnap.id, ...(docSnap.data() || {}) } as DocumentRecord);
                } else {
                    setError("Document not found.");
                }
            } catch (err) {
                console.error("Error fetching document:", err);
                setError("Failed to load document data.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchDocument();
    }, [id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !documentRecord) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const formData = new FormData(e.target as HTMLFormElement);

            const documentFile = formData.get('documentFile') as File | null;
            let fileUrls: string[] = documentRecord.image_urls || [];

            if (documentFile && documentFile.size > 0) {
                const storageRef = ref(storage, `documents/${Date.now()}_${documentFile.name}`);
                const snapshot = await uploadBytes(storageRef, documentFile);
                const downloadUrl = await getDownloadURL(snapshot.ref);
                // If they upload a new file, we replace the old one for now to keep things simple
                fileUrls = [downloadUrl];
            }

            const updateData = {
                title: formData.get('title') as string,
                category: formData.get('category') as string,
                date_approx: formData.get('date') as string || "",
                description: formData.get('description') as string || "",
                image_urls: fileUrls,
                updated_at: new Date().toISOString()
            };

            await updateDoc(doc(db, 'documents', id), updateData);

            setSuccess(true);
        } catch (err: any) {
            console.error("Error updating document: ", err);
            setError(err.message || "Failed to update document. Please check your Firebase configuration.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="flex justify-center items-center h-full text-charcoal/60 font-serif text-lg">Loading document details...</div>;
    }

    if (success) {
        return (
            <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-tan-light/50 text-tan rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={32} />
                </div>
                <h2 className="text-3xl font-serif font-bold text-charcoal mb-2">Document Updated</h2>
                <p className="text-charcoal/70 mb-8 text-center max-w-md">The document has been successfully updated in the archive.</p>
                <div className="flex gap-4">
                    <button
                        onClick={() => navigate(`/documents`)}
                        className="bg-cream border border-tan-light/50 text-charcoal px-6 py-3 rounded-lg font-medium hover:bg-tan-light/20 transition-colors"
                    >
                        Return to Archive
                    </button>
                    <button
                        onClick={() => navigate(`/documents/${id}`)}
                        className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors"
                    >
                        View Document
                    </button>
                </div>
            </div>
        )
    }

    if (!documentRecord) return null;

    return (
        <div className="max-w-4xl mx-auto h-full flex flex-col pb-12">
            <div className="mb-8 border-b border-tan-light/50 pb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <Edit2 className="text-tan" size={32} />
                        Edit Document
                    </h1>
                    <p className="text-charcoal/70 text-lg">Updating details for {documentRecord.title}</p>
                </div>
                <button onClick={() => navigate(-1)} className="text-sm font-medium text-charcoal/60 hover:text-charcoal">Cancel</button>
            </div>

            {error && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p className="font-medium text-sm">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-tan-light/50 p-8 shadow-sm flex flex-col gap-8">

                {/* File Upload Area */}
                <div>
                    <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-3">High-Resolution Scans (Optional)</label>
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-tan-light bg-cream/50 rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-colors relative overflow-hidden"
                    >
                        {documentRecord.image_urls?.[0] && !selectedFileName && (
                            <img src={documentRecord.image_urls[0]} alt="Current document scan" className="absolute inset-0 w-full h-full object-cover opacity-10" />
                        )}
                        <input
                            type="file"
                            name="documentFile"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/png, image/jpeg, application/pdf"
                            onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name || null)}
                        />
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-tan shadow-sm mb-4 relative z-10">
                            <ImageIcon size={24} />
                        </div>
                        {selectedFileName ? (
                            <p className="font-medium text-charcoal mb-1 relative z-10"><span className="text-tan">{selectedFileName}</span></p>
                        ) : (
                            <>
                                <p className="font-medium text-charcoal mb-1 relative z-10"><span className="text-tan hover:underline">Click to upload new scan</span></p>
                                <p className="text-xs text-charcoal/50 relative z-10">Leave empty to keep current scan</p>
                            </>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div>
                            <label htmlFor="title" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Document Title *</label>
                            <input required type="text" name="title" id="title" defaultValue={documentRecord.title} placeholder="e.g. 1920 City Council Minutes" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans" />
                        </div>

                        <div>
                            <label htmlFor="category" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Category *</label>
                            <select required name="category" id="category" defaultValue={documentRecord.category} className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans appearance-none">
                                <option value="">Select a category</option>
                                <option value="Letter">Letter / Correspondence</option>
                                <option value="Photograph">Photograph</option>
                                <option value="Legal Document">Legal Document</option>
                                <option value="Newspaper">Newspaper Clipping</option>
                            </select>
                        </div>

                        <div>
                            <label htmlFor="date" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Approximate Date</label>
                            <input type="text" name="date" id="date" defaultValue={documentRecord.date_approx || ""} placeholder="e.g. c. 1905 or October 12, 1950" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans" />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="h-full flex flex-col">
                            <label htmlFor="description" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Historical Context / Description</label>
                            <textarea id="description" name="description" defaultValue={documentRecord.description || ""} placeholder="Provide background information, transcriptions, or notable details about this document..." className="w-full flex-1 min-h-[150px] bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans resize-none"></textarea>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-tan-light/50 flex justify-end">
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
