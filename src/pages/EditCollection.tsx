import { useState, useRef, useEffect } from 'react';
import { FolderEdit, Image as ImageIcon, CheckCircle, AlertCircle, X, Lock, Users, ArrowLeft } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useParams, useNavigate } from 'react-router-dom';
import type { Collection } from '../types/database';

export function EditCollection() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [collection, setCollection] = useState<Collection | null>(null);
    
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [existingFileUrls, setExistingFileUrls] = useState<string[]>([]);
    const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(null);
    
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [fileObjectURLs, setFileObjectURLs] = useState<Map<File, string>>(new Map());
    const [isPrivate, setIsPrivate] = useState(false);

    useEffect(() => {
        const fetchCollection = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'collections', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...docSnap.data() } as Collection;
                    setCollection(data);
                    setExistingFileUrls(data.file_urls || []);
                    setFeaturedImageUrl(data.featured_image_url || null);
                    setIsPrivate(data.is_private || false);
                } else {
                    setError("Collection not found.");
                }
            } catch (err) {
                console.error("Error fetching collection:", err);
                setError("Failed to load collection data.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchCollection();
    }, [id]);

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

    const removeNewFile = (index: number) => {
        setSelectedFiles(prev => {
            const newFiles = [...prev];
            const fileToRemove = newFiles[index];
            const url = fileObjectURLs.get(fileToRemove);
            
            if (featuredImageUrl === url) setFeaturedImageUrl(null);
            
            newFiles.splice(index, 1);
            return newFiles;
        });
    };

    const removeExistingFile = (url: string) => {
        setExistingFileUrls(prev => prev.filter(u => u !== url));
        if (featuredImageUrl === url) setFeaturedImageUrl(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;
        
        setIsSubmitting(true);
        setError(null);

        try {
            const formData = new FormData(e.target as HTMLFormElement);
            let fileUrls = [...existingFileUrls];

            if (selectedFiles.length > 0) {
                const totalFiles = selectedFiles.length;
                let completedFiles = 0;
                setUploadProgress(0);

                for (let i = 0; i < selectedFiles.length; i++) {
                    const file = selectedFiles[i];
                    const blobUrl = fileObjectURLs.get(file);
                    
                    const storageRef = ref(storage, `collections/${Date.now()}_${file.name}`);
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
                                const url = await getDownloadURL(uploadTask.snapshot.ref);
                                fileUrls.push(url);
                                
                                if (featuredImageUrl === blobUrl) {
                                    setFeaturedImageUrl(url);
                                }
                                
                                completedFiles++;
                                resolve();
                            }
                        );
                    });
                }
            }

            const updatedData = {
                title: formData.get('title') as string,
                description: formData.get('description') as string || "",
                file_urls: fileUrls,
                featured_image_url: featuredImageUrl || (fileUrls.length > 0 ? fileUrls[0] : ""),
                is_private: isPrivate
            };

            await updateDoc(doc(db, 'collections', id), updatedData);
            setSuccess(true);
        } catch (err: any) {
            console.error("Error updating collection: ", err);
            setError(err.message || "Failed to update collection.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="flex justify-center items-center h-full text-charcoal/60 font-serif text-lg">Loading collection details...</div>;
    }

    if (success) {
        return (
            <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-tan-light/50 text-tan rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={32} />
                </div>
                <h2 className="text-3xl font-serif font-bold text-charcoal mb-2">Collection Updated</h2>
                <p className="text-charcoal/70 mb-8 text-center max-w-md">Your changes have been saved successfully.</p>
                <div className="flex gap-4">
                    <button
                        onClick={() => navigate('/collections')}
                        className="bg-cream border border-tan-light/50 text-charcoal px-6 py-3 rounded-lg font-medium hover:bg-tan-light/20 transition-colors"
                    >
                        Back to Collections
                    </button>
                    <button
                        onClick={() => navigate(`/collections/${id}`)}
                        className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors"
                    >
                        View Collection
                    </button>
                </div>
            </div>
        )
    }

    if (!collection) return null;

    return (
        <div className="max-w-3xl mx-auto h-full flex flex-col pb-12">
            <div className="mb-8 border-b border-tan-light/50 pb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <FolderEdit className="text-tan" size={32} />
                        Edit Collection
                    </h1>
                    <p className="text-charcoal/70 text-lg">Update the theme and visibility of this group.</p>
                </div>
                <button onClick={() => navigate(-1)} className="text-sm font-medium text-charcoal/60 hover:text-charcoal flex items-center gap-2 mb-1">
                    <ArrowLeft size={16} /> Cancel
                </button>
            </div>

            <div className="mb-8 flex items-center justify-between bg-white p-5 rounded-2xl border border-tan-light/50 shadow-sm">
                <div className="flex items-center gap-4 text-charcoal">
                    <div className={`p-2.5 rounded-xl transition-colors ${isPrivate ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                        {isPrivate ? <Lock size={20} /> : <Users size={20} />}
                    </div>
                    <div>
                        <h3 className="font-bold text-sm uppercase tracking-wider">{isPrivate ? 'Private Collection' : 'Public Collection'}</h3>
                        <p className="text-xs text-charcoal/60 leading-relaxed">
                            {isPrivate 
                                ? 'This collection and all items within it will be hidden from the public archive.' 
                                : 'This collection and its items will be visible to all visitors.'}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${isPrivate ? 'bg-amber-500' : 'bg-tan/30'}`}
                >
                    <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                </button>
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
                        <input required type="text" name="title" id="title" defaultValue={collection.title} className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans" />
                    </div>

                    <div>
                        <label htmlFor="description" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Description</label>
                        <textarea id="description" name="description" defaultValue={collection.description} className="w-full min-h-[120px] bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans resize-none"></textarea>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-3 underline underline-offset-4 decoration-tan/30">
                            <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider">Collection Media / Gallery</label>
                        </div>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-tan-light bg-cream/50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-colors h-40 group mb-6"
                        >
                            <input
                                type="file"
                                name="coverImage"
                                ref={fileInputRef}
                                className="hidden"
                                multiple
                                accept="image/png, image/jpeg, image/webp"
                                onChange={(e) => {
                                    const files = e.target.files;
                                    if (files) setSelectedFiles(prev => [...prev, ...Array.from(files)]);
                                    e.target.value = '';
                                }}
                            />
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-tan shadow-sm mb-2 group-hover:scale-110 transition-transform">
                                <ImageIcon size={20} />
                            </div>
                            <p className="font-bold text-sm text-charcoal mb-0.5">Click to upload more scans</p>
                        </div>
                        
                        {/* Media Grid */}
                        {(existingFileUrls.length > 0 || selectedFiles.length > 0) && (
                            <div className="space-y-4 mb-8">
                                <div className="grid grid-cols-4 gap-2">
                                    {/* Existing */}
                                    {existingFileUrls.map((url, idx) => (
                                        <div key={`existing-${idx}`} className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group/thumb ${featuredImageUrl === url ? 'border-tan ring-2 ring-tan/20 shadow-md scale-[1.02]' : 'border-tan-light/30'}`}>
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
                                                <button
                                                    type="button"
                                                    onClick={() => removeExistingFile(url)}
                                                    className="p-1 bg-white/20 hover:bg-red-500/60 rounded-full text-white backdrop-blur-sm transition-colors"
                                                    title="Remove"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                            {featuredImageUrl === url && (
                                                <div className="absolute top-1 left-1 bg-tan text-white p-0.5 rounded-full shadow-sm z-20">
                                                    <CheckCircle size={10} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {/* New */}
                                    {selectedFiles.map((file, idx) => {
                                        const url = fileObjectURLs.get(file) || '';
                                        return (
                                            <div key={`pending-${idx}`} className={`relative aspect-square rounded-lg overflow-hidden border-2 border-dashed transition-all group/thumb ${featuredImageUrl === url ? 'border-tan ring-2 ring-tan/20 shadow-md scale-[1.02]' : 'border-tan-light/30'}`}>
                                                <img src={url} className="w-full h-full object-cover opacity-50" alt="preview" />
                                                <div className="absolute inset-0 bg-charcoal/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setFeaturedImageUrl(url)}
                                                        className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors"
                                                        title="Set as Featured"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeNewFile(idx)}
                                                        className="p-1 bg-white/20 hover:bg-red-500/60 rounded-full text-white backdrop-blur-sm transition-colors"
                                                        title="Remove"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 bg-cream/30 border-t border-tan-light/50 flex justify-end items-center rounded-b-xl">
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
                        className="bg-tan text-white px-8 py-4 rounded-xl font-bold hover:bg-charcoal transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg shadow-tan/20 min-w-[200px]"
                    >
                        {isSubmitting ? (
                            <>
                                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                                Saving Changes...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={20} />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
