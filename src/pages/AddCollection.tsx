import { useState, useRef } from 'react';
import { FolderPlus, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export function AddCollection() {
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

            const file = formData.get('coverImage') as File | null;
            let coverUrl = "";

            if (file && file.size > 0) {
                const storageRef = ref(storage, `collections/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                coverUrl = await getDownloadURL(snapshot.ref);
            }

            const collectionData = {
                title: formData.get('title') as string,
                description: formData.get('description') as string || "",
                cover_image_url: coverUrl,
                created_at: new Date().toISOString()
            };

            await addDoc(collection(db, 'collections'), collectionData);
            setSuccess(true);
        } catch (err: any) {
            console.error("Error creating collection: ", err);
            setError(err.message || "Failed to create collection. Please check your Firebase configuration.");
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
                <h2 className="text-3xl font-serif font-bold text-charcoal mb-2">Collection Created</h2>
                <p className="text-charcoal/70 mb-8 text-center max-w-md">The new collection has been successfully created and can now have items assigned to it.</p>
                <button
                    onClick={() => { setSuccess(false); setSelectedFileName(null); }}
                    className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors"
                >
                    Create Another Collection
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto h-full flex flex-col pb-12">
            <div className="mb-8 border-b border-tan-light/50 pb-6">
                <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                    <FolderPlus className="text-tan" size={32} />
                    Create Collection
                </h1>
                <p className="text-charcoal/70 text-lg">Group disparate items together under a single cohesive theme or exhibit.</p>
            </div>

            {error && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p className="font-medium text-sm">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-tan-light/50 p-8 shadow-sm flex flex-col gap-8">

                <div className="space-y-6">
                    <div>
                        <label htmlFor="title" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Collection Title *</label>
                        <input required type="text" name="title" id="title" placeholder="e.g. Senoia High School Yearbooks" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans" />
                    </div>

                    <div>
                        <label htmlFor="description" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Description</label>
                        <textarea id="description" name="description" placeholder="Provide an overview of what this collection represents..." className="w-full min-h-[120px] bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans resize-none"></textarea>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Cover Image (Optional)</label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-tan-light bg-cream/50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-colors h-48"
                        >
                            <input
                                type="file"
                                name="coverImage"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/png, image/jpeg"
                                onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name || null)}
                            />
                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-tan shadow-sm mb-3">
                                <ImageIcon size={24} />
                            </div>
                            {selectedFileName ? (
                                <p className="font-medium text-sm text-charcoal mb-1"><span className="text-tan">{selectedFileName}</span></p>
                            ) : (
                                <>
                                    <p className="font-medium text-sm text-charcoal mb-1"><span className="text-tan hover:underline">Click to upload</span> or drag</p>
                                    <p className="text-xs text-charcoal/50">PNG, JPG (Max 10MB)</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-tan-light/50 flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-tan text-white px-8 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Creating...' : 'Create Collection'}
                    </button>
                </div>

            </form>
        </div>
    );
}
