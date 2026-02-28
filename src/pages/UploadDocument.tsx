import { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

export function UploadDocument() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const formData = new FormData(e.target as HTMLFormElement);

            const docData = {
                title: formData.get('title') as string,
                category: formData.get('category') as string,
                date_approx: formData.get('date') as string || "",
                description: formData.get('description') as string || "",
                image_urls: [],
                created_at: new Date().toISOString()
            };

            await addDoc(collection(db, 'documents'), docData);

            setSuccess(true);
        } catch (err: any) {
            console.error("Error adding document: ", err);
            setError(err.message || "Failed to upload document. Please check your Firebase configuration.");
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
                <h2 className="text-3xl font-serif font-bold text-charcoal mb-2">Document Uploaded</h2>
                <p className="text-charcoal/70 mb-8 text-center max-w-md">The document has been successfully archived and will now appear in the public browse views.</p>
                <button
                    onClick={() => setSuccess(false)}
                    className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors"
                >
                    Upload Another Document
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto h-full flex flex-col pb-12">
            <div className="mb-8 border-b border-tan-light/50 pb-6">
                <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                    <Upload className="text-tan" size={32} />
                    Upload New Document
                </h1>
                <p className="text-charcoal/70 text-lg">Add a new historical document or photograph to the archive database.</p>
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
                    <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-3">High-Resolution Scans *</label>
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-tan-light bg-cream/50 rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-colors"
                    >
                        <input
                            type="file"
                            name="documentFile"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/png, image/jpeg, application/pdf"
                            onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name || null)}
                        />
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-tan shadow-sm mb-4">
                            <ImageIcon size={24} />
                        </div>
                        {selectedFileName ? (
                            <p className="font-medium text-charcoal mb-1"><span className="text-tan">{selectedFileName}</span></p>
                        ) : (
                            <>
                                <p className="font-medium text-charcoal mb-1"><span className="text-tan hover:underline">Click to upload</span> or drag and drop</p>
                                <p className="text-xs text-charcoal/50">PNG, JPG, or PDF up to 50MB per file</p>
                            </>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Column 1 */}
                    <div className="space-y-6">
                        <div>
                            <label htmlFor="title" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Document Title *</label>
                            <input required type="text" name="title" id="title" placeholder="e.g. 1920 City Council Minutes" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans" />
                        </div>

                        <div>
                            <label htmlFor="category" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Category *</label>
                            <select required name="category" id="category" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans appearance-none">
                                <option value="">Select a category</option>
                                <option value="Letter">Letter / Correspondence</option>
                                <option value="Photograph">Photograph</option>
                                <option value="Legal Document">Legal Document</option>
                                <option value="Newspaper">Newspaper Clipping</option>
                            </select>
                        </div>

                        <div>
                            <label htmlFor="date" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Approximate Date</label>
                            <input type="text" name="date" id="date" placeholder="e.g. c. 1905 or October 12, 1950" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans" />
                        </div>
                    </div>

                    {/* Column 2 */}
                    <div className="space-y-6">
                        <div className="h-full flex flex-col">
                            <label htmlFor="description" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Historical Context / Description</label>
                            <textarea id="description" name="description" placeholder="Provide background information, transcriptions, or notable details about this document..." className="w-full flex-1 min-h-[150px] bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans resize-none"></textarea>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-tan-light/50 flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-tan text-white px-8 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Uploading to Archive...' : 'Upload Document'}
                    </button>
                </div>

            </form>
        </div>
    );
}
