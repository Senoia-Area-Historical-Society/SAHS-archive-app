import { useState, useRef } from 'react';
import { FolderPlus, Image as ImageIcon, CheckCircle, AlertCircle, X } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

export function AddCollection() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [featuredImageIndex, setFeaturedImageIndex] = useState<number>(0);
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

    const removeFile = (index: number) => {
        setSelectedFiles(prev => {
            const newFiles = prev.filter((_, i) => i !== index);
            if (featuredImageIndex === index) setFeaturedImageIndex(0);
            else if (featuredImageIndex > index) setFeaturedImageIndex(featuredImageIndex - 1);
            return newFiles;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const formData = new FormData(e.target as HTMLFormElement);

            const newFiles = selectedFiles;
            let fileUrls: string[] = [];

            if (newFiles.length > 0) {
                const totalFiles = newFiles.length;
                let completedFiles = 0;
                setUploadProgress(0);

                for (let i = 0; i < newFiles.length; i++) {
                    const file = newFiles[i];
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
                                completedFiles++;
                                resolve();
                            }
                        );
                    });
                }
            }

            const collectionData = {
                title: formData.get('title') as string,
                description: formData.get('description') as string || "",
                file_urls: fileUrls,
                featured_image_url: fileUrls[featuredImageIndex] || (fileUrls.length > 0 ? fileUrls[0] : ""),
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
                    onClick={() => { setSuccess(false); setSelectedFiles([]); setFeaturedImageIndex(0); }}
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
                        <div className="flex items-center justify-between mb-3 underline underline-offset-4 decoration-tan/30">
                            <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider">Collection Media / Gallery</label>
                            {selectedFiles.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedFiles([])}
                                    className="text-[10px] font-black uppercase text-red-500 hover:text-red-700 tracking-widest transition-colors flex items-center gap-1"
                                >
                                    <X size={10} /> Clear
                                </button>
                            )}
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
                            <p className="font-bold text-sm text-charcoal mb-0.5">Click to upload scans</p>
                            <p className="text-[10px] text-charcoal/50">Multiple PNG, JPG, or WEBP allowed</p>
                        </div>
                        {/* Media Grid */}
                        {selectedFiles.length > 0 && (
                            <div className="space-y-4 mb-8">
                                <div className="grid grid-cols-4 gap-2">
                                    {selectedFiles.map((file, idx) => {
                                        const url = fileObjectURLs.get(file) || '';
                                        const isImage = file.type.startsWith('image/');
                                        return (
                                            <div key={`pending-${idx}`} className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group/thumb ${featuredImageIndex === idx ? 'border-tan ring-2 ring-tan/20 shadow-md scale-[1.02]' : 'border-tan-light/30 hover:border-tan-light'}`}>
                                                {isImage ? (
                                                    <img src={url} className="w-full h-full object-cover" alt="preview" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-cream/50 text-tan/40">
                                                        <ImageIcon size={20} />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-charcoal/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setFeaturedImageIndex(idx)}
                                                        className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors"
                                                        title="Set as Featured"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeFile(idx);
                                                        }}
                                                        className="p-1 bg-white/20 hover:bg-red-500/60 rounded-full text-white backdrop-blur-sm transition-colors"
                                                        title="Remove File"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                {featuredImageIndex === idx && (
                                                    <div className="absolute top-1 left-1 bg-tan text-white p-0.5 rounded-full shadow-sm z-20">
                                                        <CheckCircle size={10} />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-charcoal/40 italic">
                                    <span className="flex items-center gap-1"><CheckCircle size={10} className="text-tan" /> Click checkmark to set primary collection thumbnail</span>
                                    <button type="button" onClick={() => setSelectedFiles([])} className="text-red-500 hover:text-red-700 font-black uppercase tracking-widest transition-colors">Clear Gallery</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 bg-cream/30 border-t border-tan-light/50 flex justify-end items-center">
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
                                Creating Collection...
                            </>
                        ) : (
                            <>
                                <FolderPlus size={20} />
                                Create Collection
                            </>
                        )}
                    </button>
                </div>

            </form>
        </div>
    );
}
