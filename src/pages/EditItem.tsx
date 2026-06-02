import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react';
import { Image as ImageIcon, CheckCircle, ChevronDown, ChevronUp, X, Maximize2, FileText, ArrowLeft, Lock, Camera, Upload, Edit2, BookOpen, Sparkles, AlertCircle, Users, RotateCw, Plus, ChevronLeft, ChevronRight, Clock, XCircle, Calendar, Award, Play, Pause, Music } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, getDocs, query, addDoc, where, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import type { ArchiveItem, ItemType, Collection } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { ImageCropper } from '../components/ImageCropper';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { convertPdfToPngs } from '../lib/pdfUtils';
import { convertHeicToPng, compressImage } from '../utils/imageUtils';
import { GoogleDrivePicker } from '../components/GoogleDrivePicker';

function useClickOutside(ref: React.RefObject<any>, handler: () => void) {
    useEffect(() => {
        const listener = (event: MouseEvent | TouchEvent) => {
            if (!ref.current || ref.current.contains(event.target as Node)) {
                return;
            }
            handler();
        };
        document.addEventListener('mousedown', listener);
        document.addEventListener('touchstart', listener);
        return () => {
            document.removeEventListener('mousedown', listener);
            document.removeEventListener('touchstart', listener);
        };
    }, [ref, handler]);
}

const PendingFilePreview = ({
    file,
    url,
    caption,
    isFeatured,
    onSetFeatured,
    onRemove,
    onCrop,
    onZoom,
    onMove,
    isFirst,
    isLast,
    onCaptionChange
}: {
    file: File,
    url: string,
    caption?: string,
    isFeatured: boolean,
    onSetFeatured: (url: string) => void,
    onRemove: () => void,
    onCrop?: () => void,
    onZoom: (url: string) => void,
    onMove: (direction: 'left' | 'right') => void,
    isFirst: boolean,
    isLast: boolean,
    onCaptionChange: (caption: string) => void
}) => {
    const isImage = file.type.startsWith('image/');

    return (
        <div className="flex flex-col gap-1">
            <div className={`relative aspect-square rounded-lg overflow-hidden border-2 border-dashed transition-all group/thumb ${isFeatured ? 'border-tan ring-2 ring-tan/20 shadow-md' : 'border-indigo-200'}`}>
            {isImage ? (
                <img src={url} className="w-full h-full object-cover cursor-zoom-in" alt="new" onClick={() => onCrop ? null : onZoom(url)} />
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
                {onCrop && isImage && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCrop();
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 bg-white/20 hover:bg-tan rounded-full text-white backdrop-blur-sm transition-all text-[10px] font-bold border border-white/30"
                        title="Crop & Center"
                    >
                        <RotateCw size={12} />
                        Edit / Rotate
                    </button>
                )}
                <div className="flex gap-1">
                    <button
                        type="button"
                        disabled={isFirst}
                        onClick={(e) => {
                            e.stopPropagation();
                            onMove('left');
                        }}
                        className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors disabled:opacity-20"
                        title="Move Left"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <button
                        type="button"
                        disabled={isLast}
                        onClick={(e) => {
                            e.stopPropagation();
                            onMove('right');
                        }}
                        className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors disabled:opacity-20"
                        title="Move Right"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
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
        <input
            type="text"
            value={caption || ''}
            onChange={(e) => onCaptionChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Add caption..."
            className="w-full text-[10px] px-2 py-1 rounded bg-cream/50 border border-tan-light/30 focus:border-tan focus:outline-none font-sans"
        />
        </div>
    );
};

export default function EditItem() {
    const { lastSearchPath, user } = useAuth();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const fromAudit = searchParams.get('from') === 'audit';
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [item, setItem] = useState<ArchiveItem | null>(null);
    const [itemType, setItemType] = useState<ItemType>('Document');
    const [showAdvancedDC, setShowAdvancedDC] = useState(false);
    const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(null);
    const [mediaItems, setMediaItems] = useState<{ id: string, type: 'existing' | 'new', value: string | File, caption?: string }[]>([]);
    
    // Derived states for backward compatibility and simpler logic in some places
    
    const selectedFiles = useMemo(() => mediaItems.filter(m => m.type === 'new').map(m => m.value as File), [mediaItems]);
    const [accessionFiles, setAccessionFiles] = useState<File[]>([]);
    const [existingAccessionUrls, setExistingAccessionUrls] = useState<string[]>([]);
    const [isConvertingAccessionPdf, setIsConvertingAccessionPdf] = useState(false);
    const [accessionPdfProgress, setAccessionPdfProgress] = useState(0);
    const [additionalMediaFiles, setAdditionalMediaFiles] = useState<File[]>([]);
    const [existingAdditionalMediaUrls, setExistingAdditionalMediaUrls] = useState<string[]>([]);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [fileObjectURLs, setFileObjectURLs] = useState<Map<File, string>>(new Map());
    const [isConvertingPdf, setIsConvertingPdf] = useState(false);
    
    const [pdfConvertProgress, setPdfConvertProgress] = useState(0);
    const [croppingImageIndex, setCroppingImageIndex] = useState<number | null>(null);
    const [croppingImageUrl, setCroppingImageUrl] = useState<string | null>(null);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);
    const [selectedRelatedFigures, setSelectedRelatedFigures] = useState<{ id: string, full_name: string }[]>([]);
    const [selectedRelatedDocs, setSelectedRelatedDocs] = useState<{ id: string, title: string }[]>([]);
    const [selectedRelatedOrgs, setSelectedRelatedOrgs] = useState<{ id: string, org_name: string }[]>([]);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [isPrivate, setIsPrivate] = useState(false);
    const [collectionStatus, setCollectionStatus] = useState<'permanent' | 'pending' | 'deaccessioned' | 'loan'>('permanent');

    useEffect(() => {
        if (itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')) {
            setIsPrivate(true);
        }
    }, [collectionStatus, itemType]);




    const removeMediaItem = (id: string) => {
        setMediaItems(prev => {
            const itemToRemove = prev.find(m => m.id === id);
            if (itemToRemove?.type === 'new') {
                const url = fileObjectURLs.get(itemToRemove.value as File);
                if (url) URL.revokeObjectURL(url);
            }
            if (itemToRemove?.type === 'existing' && featuredImageUrl === itemToRemove.value) {
                setFeaturedImageUrl(null);
            }
            return prev.filter(m => m.id !== id);
        });
    };

    const moveMediaItem = (index: number, direction: 'left' | 'right') => {
        setMediaItems(prev => {
            const next = [...prev];
            const newIndex = direction === 'left' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= next.length) return prev;
            [next[index], next[newIndex]] = [next[newIndex], next[index]];
            return next;
        });
    };

    const updateMediaCaption = (id: string, caption: string) => {
        setMediaItems(prev => prev.map(m => m.id === id ? { ...m, caption } : m));
    };

    const removeNewAccession = (index: number) => {
        setAccessionFiles(prev => {
            const newFiles = [...prev];
            newFiles.splice(index, 1);
            return newFiles;
        });
    };

    const removeExistingAccession = (url: string) => {
        setExistingAccessionUrls(prev => prev.filter((u: string) => u !== url));
    };

    const removeNewAdditional = (index: number) => {
        setAdditionalMediaFiles(prev => {
            const newFiles = [...prev];
            newFiles.splice(index, 1);
            return newFiles;
        });
    };

    const removeExistingAdditional = (url: string) => {
        setExistingAdditionalMediaUrls(prev => prev.filter((u: string) => u !== url));
    };

    // Update object URLs when files change
    useEffect(() => {
        setFileObjectURLs(prev => {
            const next = new Map(prev);
            // Add new files
            mediaItems.filter(m => m.type === 'new').forEach(m => {
                const file = m.value as File;
                if (!next.has(file)) {
                    next.set(file, URL.createObjectURL(file));
                }
            });
            accessionFiles.forEach(file => {
                if (!next.has(file)) {
                    next.set(file, URL.createObjectURL(file));
                }
            });
            additionalMediaFiles.forEach(file => {
                if (!next.has(file)) {
                    next.set(file, URL.createObjectURL(file));
                }
            });
            // Cleanup removed files
            next.forEach((url, file) => {
                const isSelected = mediaItems.some(m => m.type === 'new' && m.value === file) || 
                                 accessionFiles.includes(file) || 
                                 additionalMediaFiles.includes(file);
                if (!isSelected) {
                    URL.revokeObjectURL(url);
                    next.delete(file);
                }
            });
            return next;
        });
    }, [mediaItems, accessionFiles, additionalMediaFiles]);

    // Cleanup all blob URLs on final unmount
    useEffect(() => {
        return () => {
            fileObjectURLs.forEach((url: string) => URL.revokeObjectURL(url));
        };
    }, []); // Only runs on component destroy

    const handleCropComplete = (croppedBlob: Blob) => {
        if (croppingImageIndex === null && !croppingImageUrl) return;
        
        // Determine original filename
        let fileName = 'edited_image.jpg';
        let originalObjectURL: string | null = null;
        let originalId: string | null = null;

        if (croppingImageIndex !== null) {
            const item = mediaItems[croppingImageIndex];
            const originalFile = item.value as File;
            fileName = originalFile.name;
            originalObjectURL = fileObjectURLs.get(originalFile) || null;
            originalId = item.id;
        } else if (croppingImageUrl) {
            fileName = croppingImageUrl.split('/').pop()?.split('?')[0] || 'existing_image.jpg';
            originalObjectURL = croppingImageUrl;
            originalId = croppingImageUrl;
        }

        const croppedFile = new File([croppedBlob], fileName, { type: 'image/jpeg' });
        const croppedObjectURL = URL.createObjectURL(croppedFile);
        const newId = `new-${Date.now()}`;
        
        setMediaItems(prev => {
            const next = [...prev];
            if (croppingImageIndex !== null) {
                // Replacing a new pending file
                next[croppingImageIndex] = { id: newId, type: 'new', value: croppedFile };
            } else {
                // Replacing an existing file (remove old, add new at same position or end)
                const idx = prev.findIndex(m => m.id === originalId);
                if (idx !== -1) {
                    next[idx] = { id: newId, type: 'new', value: croppedFile };
                } else {
                    next.push({ id: newId, type: 'new', value: croppedFile });
                }
            }
            return next;
        });

        setFileObjectURLs(prev => {
            const next = new Map(prev);
            next.set(croppedFile, croppedObjectURL);
            return next;
        });

        // If the original was the featured image, make the new one featured
        if (featuredImageUrl === originalObjectURL) {
            setFeaturedImageUrl(croppedObjectURL);
        }
        
        setCroppingImageIndex(null);
        setCroppingImageUrl(null);
    };


    // Networking / Linking
    const [allFigures, setAllFigures] = useState<{ id: string, title: string }[]>([]);
    const [figureSearch, setFigureSearch] = useState('');
    const [debouncedFigureSearch, setDebouncedFigureSearch] = useState('');
    const [showFigureResults, setShowFigureResults] = useState(false);

    const [allDocs, setAllDocs] = useState<{ id: string, title: string }[]>([]);
    const [docSearch, setDocSearch] = useState('');
    const [debouncedDocSearch, setDebouncedDocSearch] = useState('');
    const [showDocResults, setShowDocResults] = useState(false);

    const [allOrgs, setAllOrgs] = useState<{ id: string, title: string }[]>([]);
    const [orgSearch, setOrgSearch] = useState('');
    const [debouncedOrgSearch, setDebouncedOrgSearch] = useState('');
    const [showOrgResults, setShowOrgResults] = useState(false);

    useEffect(() => {
        const h = setTimeout(() => setDebouncedFigureSearch(figureSearch), 200);
        return () => clearTimeout(h);
    }, [figureSearch]);

    useEffect(() => {
        const h = setTimeout(() => setDebouncedDocSearch(docSearch), 200);
        return () => clearTimeout(h);
    }, [docSearch]);

    useEffect(() => {
        const h = setTimeout(() => setDebouncedOrgSearch(orgSearch), 200);
        return () => clearTimeout(h);
    }, [orgSearch]);

    const figureRef = useRef<HTMLDivElement>(null);
    const docRef = useRef<HTMLDivElement>(null);
    const orgRef = useRef<HTMLDivElement>(null);
    useClickOutside(figureRef, () => setShowFigureResults(false));
    useClickOutside(docRef, () => setShowDocResults(false));
    useClickOutside(orgRef, () => setShowOrgResults(false));
    const cropExistingImage = (url: string) => {
        setCroppingImageUrl(url);
    };

    const handleCollectionToggle = (collId: string) => {
        setItem((prev: any) => {
            if (!prev) return prev;
            const currentIds = prev.collection_ids || (prev.collection_id ? [prev.collection_id] : []);
            const newIds = currentIds.includes(collId) ? currentIds.filter((id: string) => id !== collId) : [...currentIds, collId];
            return { ...prev, collection_ids: newIds, collection_id: newIds.length > 0 ? newIds[0] : null };
        });
    };

    const handleCreateNewCollection = async () => {
        const nextTitle = window.prompt("Enter the name of the new collection:");
        if (nextTitle && nextTitle.trim()) {
            try {
                const docRef = await addDoc(collection(db, 'collections'), {
                    title: nextTitle,
                    description: "",
                    created_at: new Date().toISOString(),
                    item_count: 0
                });
                const newCol = { id: docRef.id, title: nextTitle, description: "", created_at: new Date().toISOString() };
                setCollections(prev => [...prev, newCol].sort((a, b) => a.title.localeCompare(b.title)));
                setItem((prev: any) => {
                    if (!prev) return prev;
                    const currentIds = prev.collection_ids || (prev.collection_id ? [prev.collection_id] : []);
                    const newIds = [...currentIds, docRef.id];
                    return { ...prev, collection_ids: newIds, collection_id: newIds[0] };
                });
            } catch (err) {
                console.error("Error creating collection:", err);
            }
        }
    };

    useEffect(() => {
        if (item) {
            // Sync with current item's collection
        }
    }, [item?.collection_id]);

    useEffect(() => {
        const fetchItem = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'archive_items', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...(docSnap.data() || {}) } as ArchiveItem;
                    setItem(data);
                    const rawType = data.item_type || 'Document';
            setItemType(rawType.trim() as ItemType);
                    setFeaturedImageUrl(data.featured_image_url || null);
                    setMediaItems((data.file_urls || []).map((url, idx) => ({ 
                        id: url, 
                        type: 'existing', 
                        value: url,
                        caption: data.file_captions ? data.file_captions[idx] : ''
                    })));
                    setExistingAccessionUrls(data.accession_paperwork_urls || []);
                    setExistingAdditionalMediaUrls(data.additional_media_urls || []);
                    setIsPrivate(data.is_private || false);
                    setCollectionStatus(data.collection_status || 'permanent');
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

        const fetchCollectionsAndLinked = async () => {
            try {
                const q = query(collection(db, 'collections'));
                const querySnapshot = await getDocs(q);
                const collectionsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Collection[];
                setCollections(collectionsData.sort((a, b) => a.title.localeCompare(b.title)));

                const qItemsAll = query(collection(db, 'archive_items'));
                const itemsSnapAll = await getDocs(qItemsAll);
                const allItemsData = itemsSnapAll.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

                const figsList = allItemsData
                    .filter(i => i.item_type === 'Historic Figure')
                    .map(i => ({ id: i.id, title: i.title || i.full_name || "Unnamed Figure" }));
                setAllFigures(figsList.sort((a, b) => a.title.localeCompare(b.title)));

                const docsList = allItemsData
                    .filter(i => i.item_type === 'Document' || i.item_type === 'Artifact')
                    .map(i => ({ id: i.id, title: i.title || "Untitled File" }));
                setAllDocs(docsList.sort((a, b) => a.title.localeCompare(b.title)));

                const orgsList = allItemsData
                    .filter(i => i.item_type === 'Historic Organization')
                    .map(i => ({ id: i.id, title: i.title || i.org_name || "Unnamed Organization" }));
                setAllOrgs(orgsList.sort((a, b) => a.title.localeCompare(b.title)));

                if (item) {
                     if (item.related_figures && item.related_figures.length > 0) {
                        const linkedFigs = figsList
                            .filter(f => item.related_figures?.includes(f.id))
                            .map(f => ({ id: f.id, full_name: f.title }));
                        setSelectedRelatedFigures(linkedFigs);
                    }
                    if (item.related_documents && item.related_documents.length > 0) {
                        const linkedDocs = docsList
                            .filter(d => item.related_documents?.includes(d.id))
                            .map(d => ({ id: d.id, title: d.title }));
                        setSelectedRelatedDocs(linkedDocs);
                    }
                    if (item.related_organizations && item.related_organizations.length > 0) {
                        const linkedOrgs = orgsList
                            .filter(o => item.related_organizations?.includes(o.id))
                            .map(o => ({ id: o.id, org_name: o.title }));
                        setSelectedRelatedOrgs(linkedOrgs);
                    }
                }

            } catch (error) {
                console.error("Error fetching collections/linked data:", error);
            }
        };

        fetchItem();
        fetchCollectionsAndLinked();
    }, [id]);

    useEffect(() => {
        if (item) {
            if (allFigures.length > 0 && (!selectedRelatedFigures.length && item.related_figures?.length)) {
                const linkedFigs = allFigures
                    .filter(f => item.related_figures?.includes(f.id))
                    .map(f => ({ id: f.id, full_name: f.title }));
                setSelectedRelatedFigures(linkedFigs);
            }
            if (allDocs.length > 0 && (!selectedRelatedDocs.length && item.related_documents?.length)) {
                const linkedDocs = allDocs
                    .filter(d => item.related_documents?.includes(d.id))
                    .map(d => ({ id: d.id, title: d.title }));
                setSelectedRelatedDocs(linkedDocs);
            }
            if (allOrgs.length > 0 && (!selectedRelatedOrgs.length && item.related_organizations?.length)) {
                const linkedOrgs = allOrgs
                    .filter(o => item.related_organizations?.includes(o.id))
                    .map(o => ({ id: o.id, org_name: o.title }));
                setSelectedRelatedOrgs(linkedOrgs);
            }
        }
    }, [item, allFigures, allDocs, allOrgs]);



    const processFiles = async (files: FileList | File[]) => {
        const fileArray = Array.from(files);
        
        
        const hasPdf = fileArray.some(f => f.type === 'application/pdf');
        const hasHeic = fileArray.some(f => f.name.toLowerCase().endsWith('.heic') || f.name.toLowerCase().endsWith('.heif'));
        
        if (hasPdf) {
            setIsConvertingPdf(true);
            setPdfConvertProgress(0);
        }
        if (hasHeic) {
        }

        try {
            const newItems: { id: string, type: 'new', value: File, caption?: string }[] = [];
            for (let i = 0; i < fileArray.length; i++) {
                let file = fileArray[i];
                
                // HEIC Conversion
                if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
                    file = await convertHeicToPng(file);
                    file = await compressImage(file);
                } else if (file.type.startsWith('image/')) {
                    file = await compressImage(file);
                }

                if (file.type === 'application/pdf') {
                    const pngs = await convertPdfToPngs(file, (p) => {
                        setPdfConvertProgress(p);
                    });
                    newItems.push(...pngs.map((f, idx) => ({ id: `new-${Date.now()}-${i}-${idx}`, type: 'new' as const, value: f, caption: '' })));
                } else {
                    newItems.push({ id: `new-${Date.now()}-${i}`, type: 'new' as const, value: file, caption: '' });
                }
            }
            setMediaItems(prev => [...prev, ...newItems]);
        } catch (error) {
            console.error("Failed to process files:", error);
            alert("Failed to read or convert one or more files.");
        } finally {
            setIsConvertingPdf(false);
            setPdfConvertProgress(0);
        }
    };

    const processAccessionFiles = async (files: FileList | File[]) => {
        const fileArray = Array.from(files);
        setIsConvertingAccessionPdf(true);
        setAccessionPdfProgress(0);

        try {
            const finalFiles: File[] = [];
            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                if (file.type === 'application/pdf') {
                    const pngs = await convertPdfToPngs(file, (p) => {
                        setAccessionPdfProgress(p);
                    });
                    finalFiles.push(...pngs);
                } else {
                    finalFiles.push(file);
                }
            }
            setAccessionFiles(prev => [...prev, ...finalFiles]);
        } catch (error) {
            console.error("Failed to process accession files:", error);
            alert("Failed to read or convert one or more accession files.");
        } finally {
            setIsConvertingAccessionPdf(false);
            setAccessionPdfProgress(0);
        }
    };

    const handleDriveFiles = useCallback((files: File[]) => {
        processFiles(files);
    }, []);

    const getCoordinatesFromAddress = async (address: string) => {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`, {
                headers: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    'User-Agent': 'SAHS-Archive-App'
                }
            });
            const data = await response.json();
            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
            }
        } catch (err) {
            console.error("Geocoding failed:", err);
        }
        return null;
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!id || !item) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const formElement = e?.target as HTMLFormElement || document.getElementById('edit-item-form');
            const formData = new FormData(formElement as HTMLFormElement);
            
            const historical_address = formData.get('historical_address') as string || "";
            let coordinates = item.coordinates || null;
            
            if (historical_address !== (item.historical_address || "")) {
                if (historical_address) {
                    coordinates = await getCoordinatesFromAddress(historical_address);
                } else {
                    coordinates = null;
                }
            }

            let finalFileUrls: string[] = [];
            let finalFileCaptions: string[] = [];
            let finalFeaturedUrl = featuredImageUrl;

            if (mediaItems.length > 0) {
                const totalNewFiles = mediaItems.filter(m => m.type === 'new').length;
                let completedNewFiles = 0;
                if (totalNewFiles > 0) setUploadProgress(0);

                for (let i = 0; i < mediaItems.length; i++) {
                    const item = mediaItems[i];
                    finalFileCaptions.push(item.caption || '');
                    if (item.type === 'existing') {
                        finalFileUrls.push(item.value as string);
                    } else {
                        const file = item.value as File;
                        const blobUrl = fileObjectURLs.get(file);

                        const storageRef = ref(storage, `archive_media/${Date.now()}_${file.name}`);
                        const uploadTask = uploadBytesResumable(storageRef, file);

                        await new Promise<void>((resolve, reject) => {
                            uploadTask.on('state_changed',
                                (snapshot) => {
                                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                    const overallProgress = ((completedNewFiles * 100) + progress) / totalNewFiles;
                                    setUploadProgress(Math.round(overallProgress));
                                },
                                reject,
                                async () => {
                                    const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                                    finalFileUrls.push(downloadUrl);

                                    if (featuredImageUrl === blobUrl) {
                                        finalFeaturedUrl = downloadUrl;
                                    }

                                    completedNewFiles++;
                                    resolve();
                                }
                            );
                        });
                    }
                }
            }

            const uploadToStorage = async (files: File[], folder: string) => {
                const urls: string[] = [];
                for (const file of files) {
                    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
                    const uploadTask = uploadBytesResumable(storageRef, file);

                    await new Promise<void>((resolve, reject) => {
                        uploadTask.on('state_changed',
                            (snapshot) => {
                                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                setUploadProgress(Math.round(progress));
                            },
                            (error) => reject(error),
                            async () => {
                                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                                urls.push(downloadUrl);
                                resolve();
                            }
                        );
                    });
                }
                return urls;
            };

            const newAccessionUrls = accessionFiles.length > 0 
                ? await uploadToStorage(accessionFiles, 'accession_paperwork') : [];
            
            const newAdditionalUrls = additionalMediaFiles.length > 0 
                ? await uploadToStorage(additionalMediaFiles, 'additional_media') : [];

            const updatedData: Partial<ArchiveItem> = {
                item_type: itemType,
                file_urls: finalFileUrls,
                file_captions: finalFileCaptions,
                accession_paperwork_urls: [...existingAccessionUrls, ...newAccessionUrls],
                additional_media_urls: [...existingAdditionalMediaUrls, ...newAdditionalUrls],
                featured_image_url: finalFeaturedUrl,
        collection_id: item.collection_id || null,
                collection_ids: item.collection_ids || (item.collection_id ? [item.collection_id] : []),
                is_private: (itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')) ? true : isPrivate,
                collection_status: itemType === 'Artifact' ? collectionStatus : null,

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
                source: (formData.get('source') as string) || (formData.get('source_institution') as string) || "",
                coverage: formData.get('coverage') as string || "",

                // SAHS Archival Tracking
                condition: (formData.get('condition') as any) || null,
                physical_location: (formData.get('physical_location') as any) || null,
                historical_address: historical_address,
                coordinates: coordinates,
                category: itemType === 'Artifact' ? 'Artifact' : (formData.get('category') as string || ""),

                // Linking
                related_figures: selectedRelatedFigures.map(f => f.id),
                related_documents: selectedRelatedDocs.map(d => d.id),
                related_organizations: selectedRelatedOrgs.map(o => o.id),

                donor: formData.get('donor') as string || "",

                artifact_id: formData.get('artifact_id') as string || "",
                artifact_type: formData.get('artifact_type') as string || "",
                museum_location: formData.get('museum_location') as string || "",
                accession_date: formData.get('accession_date') as string || "",
                // Figure Specific Biographics
                full_name: formData.get('full_name') as string || "",
                also_known_as: formData.get('also_known_as') as string || "",
                birth_date: formData.get('birth_date') as string || "",
                death_date: formData.get('death_date') as string || "",
                birthplace: formData.get('birthplace') as string || "",
                occupation: formData.get('occupation') as string || "",
                biography_sources: formData.get('biography_sources') as string || "",

                // Organization Specific Biographics
                org_name: formData.get('org_name') as string || "",
                alternative_names: formData.get('alternative_names') as string || "",
                founding_date: formData.get('founding_date') as string || "",
                dissolved_date: formData.get('dissolved_date') as string || "",
                updated_at: new Date().toISOString(),
                updated_by_email: user?.email || null,
                updated_by_name: user?.displayName || null,

                // Oral History specific
                narrator_id: selectedRelatedFigures.length > 0 ? selectedRelatedFigures[0].id : null,
                interviewer: formData.get('interviewer') as string || "",
                interview_date: formData.get('interview_date') as string || "",
                audio_url: [...existingAdditionalMediaUrls, ...newAdditionalUrls].length > 0 ? [...existingAdditionalMediaUrls, ...newAdditionalUrls][0] : (formData.get('youtube_video_id') ? null : ""),
                youtube_video_id: formData.get('youtube_video_id') as string || "",
                transcript: formData.get('transcription') as string || "",
            };

            let final_historical_address = historical_address;
            let final_coordinates = coordinates;

            // Scenario B: Editing an Artifact and address is blank, but we linked an Org or Figure
            if (itemType !== 'Historic Organization' && itemType !== 'Historic Figure' && !final_historical_address) {
                if (selectedRelatedOrgs.length > 0) {
                    for (const org of selectedRelatedOrgs) {
                        const orgDoc = await getDoc(doc(db, 'archive_items', org.id));
                        if (orgDoc.exists()) {
                            const orgData = orgDoc.data();
                            if (orgData.historical_address) {
                                final_historical_address = orgData.historical_address;
                                final_coordinates = orgData.coordinates || null;
                                break;
                            }
                        }
                    }
                }
                
                if (!final_historical_address && selectedRelatedFigures.length > 0) {
                    for (const fig of selectedRelatedFigures) {
                        const figDoc = await getDoc(doc(db, 'archive_items', fig.id));
                        if (figDoc.exists()) {
                            const figData = figDoc.data();
                            if (figData.historical_address) {
                                final_historical_address = figData.historical_address;
                                final_coordinates = figData.coordinates || null;
                                break;
                            }
                        }
                    }
                }
            }

            updatedData.historical_address = final_historical_address;
            updatedData.coordinates = final_coordinates;

            await updateDoc(doc(db, 'archive_items', id), updatedData);

            // --- Two-Way Linking Synchronization ---
            const oldOrgs = item.related_organizations || [];
            const newOrgs = selectedRelatedOrgs.map(o => o.id);
            const addedOrgs = newOrgs.filter(orgId => !oldOrgs.includes(orgId));
            const removedOrgs = oldOrgs.filter(orgId => !newOrgs.includes(orgId));

            for (const orgId of addedOrgs) {
                await updateDoc(doc(db, 'archive_items', orgId), {
                    related_documents: arrayUnion(id)
                }).catch(e => console.error("Two-way link failed:", e));
            }
            for (const orgId of removedOrgs) {
                await updateDoc(doc(db, 'archive_items', orgId), {
                    related_documents: arrayRemove(id)
                }).catch(e => console.error("Two-way unlink failed:", e));
            }

            const oldFigs = item.related_figures || [];
            const newFigs = selectedRelatedFigures.map(f => f.id);
            const addedFigs = newFigs.filter(figId => !oldFigs.includes(figId));
            const removedFigs = oldFigs.filter(figId => !newFigs.includes(figId));

            for (const figId of addedFigs) {
                await updateDoc(doc(db, 'archive_items', figId), {
                    related_documents: arrayUnion(id)
                }).catch(e => console.error("Two-way link failed:", e));
            }
            for (const figId of removedFigs) {
                await updateDoc(doc(db, 'archive_items', figId), {
                    related_documents: arrayRemove(id)
                }).catch(e => console.error("Two-way unlink failed:", e));
            }

            const oldDocs = item.related_documents || [];
            const newDocs = selectedRelatedDocs.map(d => d.id);
            const addedDocs = newDocs.filter(docId => !oldDocs.includes(docId));
            const removedDocs = oldDocs.filter(docId => !newDocs.includes(docId));

            for (const docId of addedDocs) {
                const arrayField = itemType === 'Historic Organization' ? 'related_organizations' : itemType === 'Historic Figure' ? 'related_figures' : 'related_documents';
                await updateDoc(doc(db, 'archive_items', docId), {
                    [arrayField]: arrayUnion(id)
                }).catch(e => console.error("Two-way link failed:", e));
            }
            for (const docId of removedDocs) {
                const arrayField = itemType === 'Historic Organization' ? 'related_organizations' : itemType === 'Historic Figure' ? 'related_figures' : 'related_documents';
                await updateDoc(doc(db, 'archive_items', docId), {
                    [arrayField]: arrayRemove(id)
                }).catch(e => console.error("Two-way unlink failed:", e));
            }
            // ----------------------------------------

            // Scenario A: Editing an Organization or Figure, address changed, push to artifacts
            if (itemType === 'Historic Organization' || itemType === 'Historic Figure') {
                const old_address = item.historical_address || "";
                const new_address = final_historical_address || "";
                
                if (old_address !== new_address) {
                    const allLinkedIds = new Set(selectedRelatedDocs.map(d => d.id));
                    
                    const arrayField = itemType === 'Historic Organization' ? 'related_organizations' : 'related_figures';
                    const linkedDocsQuery = query(collection(db, 'archive_items'), where(arrayField, 'array-contains', id));
                    
                    const linkedDocsSnap = await getDocs(linkedDocsQuery);
                    linkedDocsSnap.docs.forEach(d => allLinkedIds.add(d.id));

                    for (const artId of allLinkedIds) {
                        const artDoc = await getDoc(doc(db, 'archive_items', artId));
                        if (artDoc.exists()) {
                            const artData = artDoc.data();
                            const artAddr = artData.historical_address || "";
                            // Only update if it's blank OR it matches the old address
                            if (artAddr === "" || artAddr === old_address) {
                                await updateDoc(doc(db, 'archive_items', artId), {
                                    historical_address: new_address,
                                    coordinates: final_coordinates
                                });
                            }
                        }
                    }
                }
            }

            setSuccess(true);
        } catch (err: any) {
            console.error("Error updating item: ", err);
            setError(err.message || "Failed to update item. Please check your Firebase configuration.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredFigures = useMemo(() => {
        const search = debouncedFigureSearch.toLowerCase();
        return allFigures.filter(f =>
            f.title.toLowerCase().includes(search) &&
            !selectedRelatedFigures.some(sf => sf.id === f.id)
        );
    }, [allFigures, debouncedFigureSearch, selectedRelatedFigures]);

    const filteredDocs = useMemo(() => {
        const search = debouncedDocSearch.toLowerCase();
        return allDocs.filter(d =>
            d.title.toLowerCase().includes(search) &&
            !selectedRelatedDocs.some(sd => sd.id === d.id)
        );
    }, [allDocs, debouncedDocSearch, selectedRelatedDocs]);

    const filteredOrgs = useMemo(() => {
        const search = debouncedOrgSearch.toLowerCase();
        return allOrgs.filter(o =>
            o.title.toLowerCase().includes(search) &&
            !selectedRelatedOrgs.some(so => so.id === o.id)
        );
    }, [allOrgs, debouncedOrgSearch, selectedRelatedOrgs]);

    if (isLoading) {
        return <div className="flex justify-center items-center h-full text-charcoal/60 font-serif text-lg">Loading archive details...</div>;
    }

    const collectionId = item ? (location.state?.collectionId || item.collection_id || (item.collection_ids && item.collection_ids[0])) : undefined;
    const associatedCollection = collections.find(c => c.id === collectionId);

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
                        onClick={() => navigate(itemType === 'Oral History' ? `/senoia-stories` : `/archive`)}
                        className="bg-cream border border-tan-light/50 text-charcoal px-6 py-3 rounded-lg font-medium hover:bg-tan-light/20 transition-colors"
                    >
                        {itemType === 'Oral History' ? 'Back to Senoia Stories' : 'Return to Archive'}
                    </button>
                    <button
                        onClick={() => navigate(`/items/${id}`)}
                        className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors"
                    >
                        View Item
                    </button>
                    {associatedCollection ? (
                        <button
                            type="button"
                            onClick={() => navigate(`/collections/${associatedCollection.id}`)}
                            className="bg-charcoal text-white px-6 py-3 rounded-lg font-bold hover:bg-charcoal/80 transition-colors flex items-center gap-2"
                        >
                            <BookOpen size={18} className="text-tan" /> Back to Collection
                        </button>
                    ) : fromAudit ? (
                        <button
                            onClick={() => navigate('/audit')}
                            className="bg-charcoal text-white px-6 py-3 rounded-lg font-bold hover:bg-charcoal/80 transition-colors flex items-center gap-2"
                        >
                            <ArrowLeft size={18} /> Return to Audit
                        </button>
                    ) : itemType === 'Oral History' ? null : lastSearchPath && (
                        <button
                            onClick={() => navigate(lastSearchPath)}
                            className="bg-charcoal text-white px-6 py-3 rounded-lg font-bold hover:bg-charcoal/80 transition-colors flex items-center gap-2"
                        >
                            <ArrowLeft size={18} /> Back to Search
                        </button>
                    )}
                </div>
            </div>
        )
    }

    if (!item) return null;

    return (
        <div className="max-w-5xl mx-auto h-full flex flex-col pb-12 relative">
            {/* Zoom Overlay */}
            {zoomedImage && (
                <div
                    className="fixed inset-0 z-[2000] bg-charcoal/90 flex items-center justify-center p-4 md:p-12 cursor-zoom-out"
                    onClick={() => setZoomedImage(null)}
                >
                    <div className="relative max-w-full max-h-full overflow-auto text-charcoal">
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

            {/* Cropper Modal */}
            {(croppingImageIndex !== null || croppingImageUrl !== null) && (
                <ImageCropper
                    image={croppingImageIndex !== null ? (fileObjectURLs.get(selectedFiles[croppingImageIndex]) || '') : (croppingImageUrl || '')}
                    onCropComplete={handleCropComplete}
                    onCancel={() => {
                        setCroppingImageIndex(null);
                        setCroppingImageUrl(null);
                    }}
                    aspectRatio={itemType === 'Historic Figure' ? 0.75 : undefined}
                />
            )}
            <div className="mb-8 border-b border-tan-light/50 pb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <Edit2 className="text-tan" size={32} />
                        Edit Archive Item
                    </h1>
                    <p className="text-charcoal/70 text-lg">Updating details for {item.title}</p>
                </div>
                <div className="flex items-center gap-6">
                    <button onClick={() => navigate(-1)} className="text-sm font-medium text-charcoal/60 hover:text-charcoal">Cancel</button>
                    {associatedCollection ? (
                        <button 
                            type="button"
                            onClick={() => navigate(`/collections/${associatedCollection.id}`)}
                            className="flex items-center gap-2 px-6 py-2.5 bg-charcoal text-white rounded-lg text-sm font-bold hover:bg-charcoal/80 transition-all shadow-md active:scale-95"
                        >
                            <BookOpen size={16} className="text-tan" /> Back to Collection
                        </button>
                    ) : fromAudit ? (
                        <button 
                            type="button"
                            onClick={() => navigate('/audit')}
                            className="flex items-center gap-2 px-6 py-2.5 bg-tan text-white rounded-lg text-sm font-bold hover:bg-charcoal transition-all shadow-md active:scale-95"
                        >
                            <ArrowLeft size={16} /> Back to Audit
                        </button>
                    ) : itemType === 'Oral History' ? (
                        <button 
                            type="button"
                            onClick={() => navigate('/senoia-stories')}
                            className="flex items-center gap-2 px-6 py-2.5 bg-charcoal text-white rounded-lg text-sm font-bold hover:bg-charcoal/80 transition-all shadow-md active:scale-95"
                        >
                            <ArrowLeft size={16} /> Back to Senoia Stories
                        </button>
                    ) : lastSearchPath && (
                        <button 
                            type="button"
                            onClick={() => navigate(lastSearchPath)}
                            className="flex items-center gap-2 px-6 py-2.5 bg-charcoal text-white rounded-lg text-sm font-bold hover:bg-charcoal/80 transition-all shadow-md active:scale-95"
                        >
                            <ArrowLeft size={16} /> Back to Search
                        </button>
                    )}
                    <button 
                        type="button" 
                        onClick={() => handleSubmit()}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 px-6 py-2.5 bg-tan text-white rounded-lg text-sm font-bold hover:bg-charcoal transition-all shadow-md active:scale-95 disabled:opacity-50"
                    >
                        {isSubmitting ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <CheckCircle size={18} />
                        )}
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Preservation / Collection Status Segmented Selector - Only for Artifacts */}
            {itemType === 'Artifact' && (
                <div className="mb-6 bg-white p-6 rounded-2xl border border-tan-light/50 shadow-sm space-y-4 text-charcoal">
                    <div>
                        <h3 className="font-bold text-sm uppercase tracking-wider text-charcoal/80 mb-1">Preservation Status</h3>
                        <p className="text-xs text-charcoal/60 leading-relaxed font-sans">
                            Specify how this item is categorized in the museum's collection database. This dynamically controls its public visibility.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { status: 'permanent', label: 'Permanent Collection', icon: Award, desc: 'Remains in the collection indefinitely.', activeClass: 'bg-tan text-white border-tan shadow-sm hover:bg-tan/90', inactiveClass: 'border-tan-light/30 hover:border-tan/50 hover:bg-tan/5 text-charcoal/70' },
                            { status: 'pending', label: 'Pending Accessioning', icon: Clock, desc: 'Awaiting formal accessioning. Forced Private.', activeClass: 'bg-amber-600 text-white border-amber-600 shadow-sm hover:bg-amber-600/90', inactiveClass: 'border-amber-600/20 hover:border-amber-600/50 hover:bg-amber-600/5 text-charcoal/70' },
                            { status: 'deaccessioned', label: 'Deaccessioned', icon: XCircle, desc: 'Removed from the collection. Forced Private.', activeClass: 'bg-red-700 text-white border-red-700 shadow-sm hover:bg-red-700/90', inactiveClass: 'border-red-700/20 hover:border-red-700/50 hover:bg-red-700/5 text-charcoal/70' },
                            { status: 'loan', label: 'On Loan', icon: Calendar, desc: 'Temporary loan; will not remain indefinitely.', activeClass: 'bg-blue-600 text-white border-blue-600 shadow-sm hover:bg-blue-600/90', inactiveClass: 'border-blue-600/20 hover:border-blue-600/50 hover:bg-blue-600/5 text-charcoal/70' }
                        ].map(({ status, label, icon: Icon, desc, activeClass, inactiveClass }) => {
                            const isActive = collectionStatus === status;
                            return (
                                <button
                                    key={status}
                                    type="button"
                                    onClick={() => setCollectionStatus(status as any)}
                                    className={`p-4 rounded-xl border-2 text-left flex flex-col justify-between transition-all duration-200 group/btn h-full ${isActive ? activeClass : inactiveClass}`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon size={18} className={isActive ? 'text-white' : 'text-tan group-hover/btn:scale-110 transition-transform duration-200'} />
                                        <span className="font-bold text-xs uppercase tracking-wider">{label}</span>
                                    </div>
                                    <p className={`text-[11px] leading-snug font-sans ${isActive ? 'text-white/80' : 'text-charcoal/50'}`}>
                                        {desc}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="mb-8 flex items-center justify-between bg-white p-5 rounded-2xl border border-tan-light/50 shadow-sm">
                <div className="flex items-center gap-4 text-charcoal">
                    <div className={`p-2.5 rounded-xl transition-colors ${(itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')) || isPrivate ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                        {(itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')) || isPrivate ? <Lock size={20} /> : <Users size={20} />}
                    </div>
                    <div>
                        <h3 className="font-bold text-sm uppercase tracking-wider">
                            {(itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')) ? 'Forced Private Resource' : isPrivate ? 'Private Resource' : 'Public Resource'}
                        </h3>
                        <p className="text-xs text-charcoal/60 leading-relaxed font-sans">
                            {(itemType === 'Artifact' && collectionStatus === 'pending')
                                ? 'Forced Private: Pending artifacts are automatically hidden from the public archive until they are formally accessioned.'
                                : (itemType === 'Artifact' && collectionStatus === 'deaccessioned')
                                ? 'Forced Private: Deaccessioned artifacts are kept private for administrative history and cannot be made public.'
                                : isPrivate 
                                ? 'Hidden from public visitors. Only Admins and Curators can view this item.' 
                                : 'Visible to all visitors in the public archive and search results.'}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    disabled={itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')}
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${(itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')) || isPrivate ? 'bg-amber-500' : 'bg-tan/30'} ${(itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${(itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')) || isPrivate ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                </button>
            </div>

            {error && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p className="font-medium text-sm">{error}</p>
                </div>
            )}

            {itemType === 'Oral History' ? (
                <OralHistoryEditForm 
                    item={item} 
                    isSubmitting={isSubmitting} 
                    handleSubmit={handleSubmit} 
                    mediaItems={mediaItems}
                    setMediaItems={setMediaItems}
                    fileObjectURLs={fileObjectURLs}
                    setFileObjectURLs={setFileObjectURLs}
                    featuredImageUrl={featuredImageUrl}
                    setFeaturedImageUrl={setFeaturedImageUrl}
                    accessionFiles={accessionFiles}
                    setAccessionFiles={setAccessionFiles}
                    existingAccessionUrls={existingAccessionUrls}
                    setExistingAccessionUrls={setExistingAccessionUrls}
                    additionalMediaFiles={additionalMediaFiles}
                    setAdditionalMediaFiles={setAdditionalMediaFiles}
                    existingAdditionalMediaUrls={existingAdditionalMediaUrls}
                    setExistingAdditionalMediaUrls={setExistingAdditionalMediaUrls}
                    selectedRelatedFigures={selectedRelatedFigures}
                    setSelectedRelatedFigures={setSelectedRelatedFigures}
                    allFigures={allFigures}
                    figureSearch={figureSearch}
                    setFigureSearch={setFigureSearch}
                    showFigureResults={showFigureResults}
                    setShowFigureResults={setShowFigureResults}
                />
            ) : (
                <form id="edit-item-form" onSubmit={handleSubmit} className="bg-white rounded-xl border border-tan-light/50 shadow-sm flex flex-col overflow-hidden">

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
                                <div className="flex items-center gap-2">
                                    <GoogleDrivePicker onFilesSelected={handleDriveFiles} onError={setError} />
                                    {mediaItems.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMediaItems([]);
                                                setFeaturedImageUrl(null);
                                            }}
                                            className="text-[10px] font-black uppercase text-red-500 hover:text-red-700 tracking-widest transition-colors flex items-center gap-1"
                                        >
                                            <X size={10} /> Wipe Gallery
                                        </button>
                                    )}
                                </div>
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
                                    accept="image/png, image/jpeg, image/webp, image/heic, image/heif, .heic, .heif, application/pdf"
                                    onChange={async (e) => {
                                        if (e.target.files) {
                                            await processFiles(e.target.files);
                                            e.target.value = '';
                                        }
                                    }}
                                />
                                <div className="w-10 h-10 bg-cream rounded-full flex items-center justify-center text-tan shadow-sm mb-2 group-hover:scale-110 transition-transform">
                                    <ImageIcon size={20} />
                                </div>
                                <p className="font-bold text-sm text-charcoal mb-0.5">Click to append scans</p>
                                <p className="text-[10px] text-charcoal/50">Multiple PNG, JPG, or PDF allowed</p>
                            </div>

                            {isConvertingPdf && (
                                <div className="flex flex-col items-center gap-3 mb-6">
                                    <div className="w-8 h-8 border-4 border-tan border-t-transparent rounded-full animate-spin"></div>
                                    <p className="font-bold text-charcoal">Converting Extracted PDF Pages...</p>
                                    <div className="w-full max-w-[200px] h-2 bg-cream rounded-full overflow-hidden">
                                        <div className="h-full bg-tan transition-all duration-300" style={{ width: `${Math.max(5, pdfConvertProgress)}%` }}></div>
                                    </div>
                                </div>
                            )}

                            {/* Image Grid: Unified Ordered Media */}
                            {mediaItems.length > 0 && (
                                <div className="space-y-4 mb-6">
                                    <div className="grid grid-cols-4 gap-2">
                                        {mediaItems.map((item, idx) => {
                                            if (item.type === 'existing') {
                                                const url = item.value as string;
                                                return (
                                                    <div key={item.id} className="flex flex-col gap-1">
                                                        <div className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group/thumb ${featuredImageUrl === url ? 'border-tan ring-2 ring-tan/20 shadow-md' : 'border-tan-light/30'}`}>
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
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            cropExistingImage(url);
                                                                        }}
                                                                        className="flex items-center gap-1.5 px-2 py-1 bg-white/20 hover:bg-tan rounded-full text-white backdrop-blur-sm transition-all text-[10px] font-bold border border-white/30"
                                                                        title="Edit & Rotate"
                                                                    >
                                                                        <RotateCw size={12} />
                                                                        Edit / Rotate
                                                                    </button>
                                                                    <div className="flex gap-1">
                                                                        <button
                                                                            type="button"
                                                                            disabled={idx === 0}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                moveMediaItem(idx, 'left');
                                                                            }}
                                                                            className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors disabled:opacity-20"
                                                                            title="Move Left"
                                                                        >
                                                                            <ChevronLeft size={14} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={idx === mediaItems.length - 1}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                moveMediaItem(idx, 'right');
                                                                            }}
                                                                            className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors disabled:opacity-20"
                                                                            title="Move Right"
                                                                        >
                                                                            <ChevronRight size={14} />
                                                                        </button>
                                                                    </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeMediaItem(item.id)}
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
                                                        <input
                                                            type="text"
                                                            value={item.caption || ''}
                                                            onChange={(e) => updateMediaCaption(item.id, e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            placeholder="Add caption..."
                                                            className="w-full text-[10px] px-2 py-1 rounded bg-cream/50 border border-tan-light/30 focus:border-tan focus:outline-none font-sans"
                                                        />
                                                    </div>
                                                );
                                            } else {
                                                const file = item.value as File;
                                                const url = fileObjectURLs.get(file) || '';
                                                return (
                                                    <PendingFilePreview
                                                        key={item.id}
                                                        file={file}
                                                        url={url}
                                                        caption={item.caption}
                                                        isFeatured={featuredImageUrl === url}
                                                        onSetFeatured={(url) => setFeaturedImageUrl(url)}
                                                        onRemove={() => removeMediaItem(item.id)}
                                                        onCrop={() => setCroppingImageIndex(idx)}
                                                        onZoom={(url) => setZoomedImage(url)}
                                                        onMove={(dir) => moveMediaItem(idx, dir)}
                                                        isFirst={idx === 0}
                                                        isLast={idx === mediaItems.length - 1}
                                                        onCaptionChange={(cap) => updateMediaCaption(item.id, cap)}
                                                    />
                                                );
                                            }
                                        })}
                                    </div>
                                    <p className="text-[10px] text-charcoal/40 italic flex items-center gap-1">
                                        <Sparkles size={10} /> Dash-border items are pending upload and will be saved when you click "Save Changes"
                                    </p>
                                </div>
                            )}


                        </div>

                        <div className="space-y-6">
                            {/* NEW: Supplemental Media & Documentation */}
                            <div className="bg-white/50 border border-tan-light/30 rounded-2xl p-6 space-y-8">
                                    {!['Historic Figure', 'Historic Organization'].includes(itemType.trim()) && (
                                        <div>
                                            <label className="block text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                                <FileText size={14} /> Accessioning Paperwork
                                                <span className="ml-auto text-[9px] text-charcoal/40 bg-cream/50 px-2 py-0.5 rounded-full lowercase tracking-normal font-bold flex items-center gap-1">
                                                    <Lock size={10} /> Admin & Curators Only
                                                </span>
                                            </label>
                                            
                                            <div className="space-y-4">
                                                {/* Existing Paperwork */}
                                                {existingAccessionUrls.length > 0 && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {existingAccessionUrls.map((url, i) => (
                                                            <div key={i} className="relative group/file">
                                                                <div className="bg-tan/10 text-tan p-2 rounded-lg border border-tan-light/30 flex items-center gap-2 pr-8">
                                                                    <FileText size={14} />
                                                                    <span className="text-[10px] font-bold max-w-[120px] truncate">Paperwork {i + 1}</span>
                                                                    <a href={url} target="_blank" rel="noopener noreferrer" className="ml-1 text-tan hover:text-charcoal transition-colors">
                                                                        <Maximize2 size={10} />
                                                                    </a>
                                                                </div>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => removeExistingAccession(url)}
                                                                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover/file:opacity-100 transition-opacity"
                                                                >
                                                                    <X size={10} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* New Paperwork */}
                                                <div 
                                                    onClick={() => document.getElementById('accession-upload')?.click()}
                                                    className="border-2 border-dashed border-tan-light/40 bg-white/50 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-all min-h-[5rem] group"
                                                >
                                                    <input 
                                                        id="accession-upload"
                                                        type="file" 
                                                        multiple 
                                                        className="hidden" 
                                                        accept="image/*,application/pdf"
                                                        onChange={(e) => {
                                                            if (e.target.files) processAccessionFiles(e.target.files);
                                                            e.target.value = '';
                                                        }}
                                                    />
                                                    {isConvertingAccessionPdf && (
                                                        <div className="flex flex-col items-center justify-center p-4">
                                                            <div className="w-full bg-tan/10 h-1 rounded-full overflow-hidden mb-2">
                                                                <div 
                                                                    className="bg-tan h-full transition-all duration-300" 
                                                                    style={{ width: `${accessionPdfProgress}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[9px] font-bold text-tan uppercase tracking-widest animate-pulse">Converting Paperwork... {accessionPdfProgress}%</span>
                                                        </div>
                                                    )}
                                                    {!isConvertingAccessionPdf && accessionFiles.length > 0 ? (
                                                        <div className="flex flex-wrap gap-2 justify-center">
                                                            {accessionFiles.map((f, i) => (
                                                                <div key={i} className="relative group/file">
                                                                    <div className="bg-tan/5 text-tan/70 p-2 rounded-lg border border-tan-light/20 flex items-center gap-2 pr-8">
                                                                        <FileText size={14} />
                                                                        <span className="text-[10px] font-bold max-w-[80px] truncate">{f.name}</span>
                                                                    </div>
                                                                    <button 
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            removeNewAccession(i);
                                                                        }}
                                                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm"
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center">
                                                            <Upload size={18} className="text-tan/40 mb-1 group-hover:scale-110 transition-transform" />
                                                            <span className="text-[10px] font-bold text-charcoal/40 uppercase tracking-widest">Add Paperwork</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                <div>
                                    <label className="block text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                        <Camera size={14} /> {(itemType as string) === 'Oral History' ? 'Audio Interview Recording (.mp3 / .wav) *' : 'Additional Media (Video/Audio)'}
                                        <span className="ml-auto text-[9px] text-charcoal/40 bg-cream/50 px-2 py-0.5 rounded-full lowercase tracking-normal font-bold">Visible to Visitors</span>
                                    </label>
                                    
                                    <div className="space-y-4">
                                        {/* Existing Media */}
                                        {existingAdditionalMediaUrls.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {existingAdditionalMediaUrls.map((url, i) => (
                                                    <div key={i} className="relative group/file">
                                                        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg border border-indigo-100 flex items-center gap-2 pr-8">
                                                            <Camera size={14} />
                                                            <span className="text-[10px] font-bold max-w-[120px] truncate">Media {i + 1}</span>
                                                            <a href={url} target="_blank" rel="noopener noreferrer" className="ml-1 text-indigo-400 hover:text-indigo-700 transition-colors">
                                                                <Maximize2 size={10} />
                                                            </a>
                                                        </div>
                                                        <button 
                                                            type="button"
                                                            onClick={() => removeExistingAdditional(url)}
                                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover/file:opacity-100 transition-opacity"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* New Media */}
                                        <div 
                                            onClick={() => document.getElementById('media-upload')?.click()}
                                            className="border-2 border-dashed border-tan-light/40 bg-white/50 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-all min-h-[5rem] group"
                                        >
                                            <input 
                                                id="media-upload"
                                                type="file" 
                                                multiple 
                                                className="hidden" 
                                                accept="video/*,audio/*"
                                                onChange={(e) => {
                                                    if (e.target.files) setAdditionalMediaFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                                }}
                                            />
                                            {additionalMediaFiles.length > 0 ? (
                                                <div className="flex flex-wrap gap-2 justify-center">
                                                    {additionalMediaFiles.map((f, i) => (
                                                        <div key={i} className="relative group/file">
                                                            <div className="bg-indigo-50/50 text-indigo-400 p-2 rounded-lg border border-indigo-100 flex items-center gap-2 pr-8">
                                                                <Camera size={14} />
                                                                <span className="text-[10px] font-bold max-w-[80px] truncate">{f.name}</span>
                                                            </div>
                                                            <button 
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    removeNewAdditional(i);
                                                                }}
                                                                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm"
                                                            >
                                                                <X size={10} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    <Upload size={18} className="text-indigo-300/40 mb-1 group-hover:scale-110 transition-transform" />
                                                    <span className="text-[10px] font-bold text-charcoal/40 uppercase tracking-widest">Add Media</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="title" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Display Title / Name *</label>
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
                                            <label htmlFor="founding_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Established Date</label>
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
                                ) : (itemType as string) === 'Oral History' ? (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label htmlFor="interviewer" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Interviewer Name</label>
                                                <input type="text" name="interviewer" id="interviewer" defaultValue={item.interviewer ?? undefined} placeholder="e.g. Jane Smith" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                            </div>
                                            <div>
                                                <label htmlFor="interview_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Interview Date</label>
                                                <input type="text" name="interview_date" id="interview_date" defaultValue={item.interview_date ?? undefined} placeholder="e.g. October 12, 1995" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div>
                                                <label htmlFor="youtube_video_id" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">YouTube Video ID / URL (Optional)</label>
                                                <input type="text" name="youtube_video_id" id="youtube_video_id" defaultValue={item.youtube_video_id ?? undefined} placeholder="e.g. dQw4w9WgXcQ" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                            </div>
                                        </div>
                                    </>
                                ) : null}

                                    {!['Historic Figure', 'Historic Organization'].includes(itemType.trim()) && (
                                        <div className="mb-6">
                                            <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Collections</label>
                                            <div className="bg-white border border-tan-light/50 rounded-lg p-3 max-h-[200px] overflow-y-auto flex flex-col gap-2 shadow-inner">
                                                {collections.map(c => {
                                                    const currentIds = item.collection_ids || (item.collection_id ? [item.collection_id] : []);
                                                    return (
                                                        <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-cream/50 rounded-md cursor-pointer transition-colors border border-transparent hover:border-tan-light/30">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={currentIds.includes(c.id)} 
                                                                onChange={() => handleCollectionToggle(c.id)}
                                                                className="w-4 h-4 text-tan border-tan-light rounded focus:ring-tan/20"
                                                            />
                                                            <span className="text-sm text-charcoal font-medium">{c.title}</span>
                                                        </label>
                                                    );
                                                })}
                                                {collections.length === 0 && <p className="text-sm text-charcoal/40 italic p-2">No collections available.</p>}
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={handleCreateNewCollection}
                                                className="mt-2 text-xs font-bold text-tan hover:text-tan-light flex items-center gap-1 transition-colors"
                                            >
                                                <Plus size={14} /> Create New Collection
                                            </button>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        {!['Historic Figure', 'Historic Organization'].includes(itemType) && (
                                            <>
                                                {itemType === 'Artifact' ? (
                                                    <div>
                                                        <label htmlFor="artifact_type" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Artifact Type</label>
                                                        <div className="relative">
                                                            <select name="artifact_type" id="artifact_type" defaultValue={item.artifact_type ?? undefined} className="w-full bg-white border border-moderate-tan/30 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
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
                                                            <select name="category" id="category" defaultValue={item.category ?? undefined} className="w-full bg-white border border-moderate-tan/30 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                                {["Manuscript", "Photograph", "Map", "Letter", "Newspaper", "Magazine", "Legal Document", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
                                                            </select>
                                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {!['Historic Figure', 'Historic Organization'].includes(itemType) && (
                                            <div>
                                                <label htmlFor="condition" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Condition</label>
                                                <div className="relative">
                                                    <select name="condition" id="condition" defaultValue={item.condition ?? undefined} className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                        {["Excellent", "Good", "Fair", "Poor", "Fragile", "Needs To Be Rescanned"].map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                                </div>
                                            </div>
                                        )}
                                        {!['Historic Figure', 'Historic Organization'].includes(itemType) && (
                                            <div>
                                                <label htmlFor="date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Date (e.g. 1920, c. 1905)</label>
                                                <input type="text" name="date" id="date" defaultValue={item.date ?? undefined} placeholder="Approximate or Exact Date" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 mt-4">
                                        <div>
                                            <label htmlFor="historical_address" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Historical Physical Address (For Map View)</label>
                                            <input type="text" name="historical_address" id="historical_address" defaultValue={item.historical_address ?? undefined} placeholder="e.g. 123 Main St, Senoia, GA" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        {!['Historic Figure', 'Historic Organization'].includes(itemType) && (
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
                                        )}
                                    </div>


                            <div>
                                <label htmlFor="description" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">{(itemType as string) === 'Oral History' ? 'Interview Summary & Context *' : itemType === 'Historic Figure' ? 'Biography *' : itemType === 'Historic Organization' ? 'History & Description *' : itemType === 'Artifact' ? 'Physical Description & History *' : 'Description / History *'}</label>
                                <textarea required id="description" name="description" defaultValue={item.description ?? undefined} placeholder={itemType === 'Document' ? "Historical context, transcriptions..." : itemType === 'Historic Organization' ? "Historical details, mission, key figures, and legacy..." : itemType === 'Artifact' ? "Physical details, materials, historical use, and significance..." : (itemType as string) === 'Oral History' ? "Summary of the interview, key stories told, and narrator background..." : "Life history, achievements..."} className="w-full min-h-[160px] bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans resize-none"></textarea>
                            </div>

                            {(itemType === 'Historic Figure' || itemType === 'Historic Organization') && (
                                <div>
                                    <label htmlFor="biography_sources" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">
                                        {itemType === 'Historic Figure' ? 'Biography Sources' : 'Description Sources'}
                                    </label>
                                    <textarea id="biography_sources" name="biography_sources" defaultValue={item.biography_sources ?? undefined} placeholder={itemType === 'Historic Figure' ? "List sources, books, links, or documents used for this biography..." : "List sources, books, links, or documents used for this organization's history..."} className="w-full min-h-[100px] bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans resize-none"></textarea>
                                </div>
                            )}

                            <div>
                                <label htmlFor="transcription" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">{(itemType as string) === 'Oral History' ? 'Full Interview Transcript *' : 'Transcription'}</label>
                                <textarea id="transcription" name="transcription" defaultValue={item.transcript ?? item.transcription ?? undefined} placeholder={(itemType as string) === 'Oral History' ? "Paste the full, transcribed interview dialogue here. Use Speaker names like 'Jane Smith:' for dialogue..." : "Exact word-for-word OCR transcription (if applicable)..."} className="w-full min-h-[160px] bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans resize-none"></textarea>
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
                        {itemType !== 'Document' && (
                            <div>
                                <label htmlFor="artifact_id" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Artifact ID #</label>
                                <input type="text" name="artifact_id" id="artifact_id" defaultValue={item.artifact_id ?? undefined} placeholder="e.g. 2024.01.05" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                            </div>
                        )}
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
                        {itemType === 'Artifact' && (
                            <div>
                                {/* Moved to general section below */}
                            </div>
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
                            <label htmlFor="accession_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Accession Date</label>
                            <input type="text" name="accession_date" id="accession_date" defaultValue={item.accession_date ?? undefined} placeholder="MM/DD/YYYY" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            <label htmlFor="tags" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Archive Tags (Comma Separated)</label>
                            <input type="text" name="tags" id="tags" defaultValue={item.tags?.join(', ')} placeholder="e.g. Civil War, Main Street, Architecture" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                        </div>
                        <div>
                            {/* Handled by the conditional rendering logic */}
                        </div>
                        {/* Duplicate historical_address input removed */}
                        {!['Historic Figure', 'Historic Organization'].includes(itemType) && (
                            <div className="md:col-span-2">
                                <label htmlFor="museum_location" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Museum Location (Specific Shelf/Box)</label>
                                <input type="text" name="museum_location" id="museum_location" defaultValue={item.museum_location ?? undefined} placeholder="e.g. Shelf 4, Drawer B, Box 12" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                            </div>
                        )}
                        {['Historic Figure', 'Historic Organization'].includes(itemType) && (
                            <div className="md:col-span-2">
                                <label htmlFor="source_institution" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Source Institution / Media Acknowledgement</label>
                                <input type="text" name="source_institution" id="source_institution" defaultValue={item.source ?? undefined} placeholder="e.g. Courtesy of the National Archives" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm" />
                            </div>
                        )}
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
                    {itemType !== 'Historic Figure' && (
                        <div ref={figureRef}>
                            <label className="block text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-3">
                                {(itemType as string) === 'Oral History' ? 'Connect Narrator (Historic Figure) *' : 'Connect Historic Figures'}
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder={(itemType as string) === 'Oral History' ? 'Search narrator...' : 'Search people...'}
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
                                                        setSelectedRelatedFigures([...selectedRelatedFigures, { id: fig.id, full_name: fig.title }]);
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
                                            {fig.full_name}
                                            <button type="button" onClick={() => setSelectedRelatedFigures(selectedRelatedFigures.filter(f => f.id !== fig.id))} className="hover:text-charcoal transition-colors">
                                                <ChevronUp size={12} className="rotate-45" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}


                        </div>
                    )}
                    {(itemType === 'Historic Figure' || itemType === 'Historic Organization') && (
                        <div ref={docRef}>
                            <label className="block text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-3">Link To Documents & Artifacts</label>
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
                    <div className="pt-6 border-t border-tan-light/30" ref={orgRef}>
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
                                                    setSelectedRelatedOrgs([...selectedRelatedOrgs, { id: org.id, org_name: org.title }]);
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
                                        {org.org_name}
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
            )}
            
            {/* Museum Tracking (QR) - Only visible in Edit Mode and ONLY for Artifacts */}
            {itemType === 'Artifact' && (
                <div className="mt-8 pt-4 p-6 bg-tan/5 rounded-2xl border border-tan/20">
                    <p className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-4 font-sans flex items-center gap-2">
                        <Camera size={14} /> Museum Tracking (QR)
                    </p>
                    <QRCodeDisplay 
                        value={`${window.location.hostname === 'localhost' ? 'https://sahs-archives.web.app' : window.location.origin}/items/${item.id}`} 
                        label={item.title} 
                        subLabel={item.artifact_id || item.id}
                        size={140}
                    />
                    
                    <div className="mt-6 space-y-4">
                        {item.last_tagged_at && (
                            <div>
                                <p className="text-[10px] font-black text-charcoal/40 uppercase tracking-widest mb-1">Last Updated</p>
                                <p className="text-[11px] font-sans text-charcoal/60 italic">
                                    {new Date(item.last_tagged_at).toLocaleDateString()} by {item.last_tagged_by}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Administrative Audit Log - Only visible in Edit Mode */}
            <div className="mt-8 bg-charcoal/5 border border-charcoal/10 rounded-xl p-6 md:p-8">
                <h3 className="text-xl font-serif font-bold text-charcoal mb-6 flex items-center gap-2 border-b border-charcoal/10 pb-3">
                    <Lock size={20} className="text-tan" />
                    Administrative Audit Log
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <div>
                        <p className="text-[10px] font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Uploaded By</p>
                        <p className="text-sm font-sans font-bold text-charcoal">{item.uploaded_by_name || 'System'}</p>
                        <p className="text-xs font-sans text-charcoal/60">{item.uploaded_by_email || 'legacy-import'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Upload Date</p>
                        <p className="text-sm font-sans text-charcoal font-medium">
                            {item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}
                        </p>
                    </div>
                    {item.updated_at && (
                        <>
                            <div>
                                <p className="text-[10px] font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Last Updated By</p>
                                <p className="text-sm font-sans font-bold text-charcoal">{item.updated_by_name || 'System'}</p>
                                <p className="text-xs font-sans text-charcoal/60">{item.updated_by_email || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-charcoal/40 uppercase tracking-[0.2em] mb-1 font-sans">Last Update Date</p>
                                <p className="text-sm font-sans text-charcoal font-medium">
                                    {new Date(item.updated_at).toLocaleString()}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// Synced Transcript Helper & Curation Suite for Oral Histories
function parseTranscriptString(text: string) {
    if (!text) return [];
    return text.split('\n').filter(line => line.trim().length > 0).map((line, idx) => {
        const match = line.match(/^\[?(\d{2}:\d{2}(?:\.\d{1,3})?)\]?\s*([^:]+):\s*(.*)$/);
        if (match) {
            return {
                id: `line-${idx}-${Date.now()}-${Math.random()}`,
                timestamp: match[1],
                speaker: match[2].trim(),
                text: match[3].trim()
            };
        }
        const speakerMatch = line.match(/^([^:]+):\s*(.*)$/);
        if (speakerMatch) {
            return {
                id: `line-${idx}-${Date.now()}-${Math.random()}`,
                timestamp: '00:00',
                speaker: speakerMatch[1].trim(),
                text: speakerMatch[2].trim()
            };
        }
        return {
            id: `line-${idx}-${Date.now()}-${Math.random()}`,
            timestamp: '00:00',
            speaker: '',
            text: line.trim()
        };
    });
}

function parseTimeToSeconds(timeStr: string): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
}

function formatTime(seconds: number): string {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface OralHistoryEditFormProps {
    item: ArchiveItem;
    isSubmitting: boolean;
    handleSubmit: (e?: React.FormEvent) => Promise<void>;
    mediaItems: any[];
    setMediaItems: React.Dispatch<React.SetStateAction<any[]>>;
    fileObjectURLs: Map<File, string>;
    setFileObjectURLs: React.Dispatch<React.SetStateAction<Map<File, string>>>;
    featuredImageUrl: string | null;
    setFeaturedImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
    accessionFiles: File[];
    setAccessionFiles: React.Dispatch<React.SetStateAction<File[]>>;
    existingAccessionUrls: string[];
    setExistingAccessionUrls: React.Dispatch<React.SetStateAction<string[]>>;
    additionalMediaFiles: File[];
    setAdditionalMediaFiles: React.Dispatch<React.SetStateAction<File[]>>;
    existingAdditionalMediaUrls: string[];
    setExistingAdditionalMediaUrls: React.Dispatch<React.SetStateAction<string[]>>;
    selectedRelatedFigures: any[];
    setSelectedRelatedFigures: React.Dispatch<React.SetStateAction<any[]>>;
    allFigures: any[];
    figureSearch: string;
    setFigureSearch: (s: string) => void;
    showFigureResults: boolean;
    setShowFigureResults: (b: boolean) => void;
}

export function OralHistoryEditForm({
    item,
    isSubmitting,
    handleSubmit,
    mediaItems: _mediaItems,
    setMediaItems,
    fileObjectURLs: _fileObjectURLs,
    setFileObjectURLs,
    featuredImageUrl,
    setFeaturedImageUrl,
    accessionFiles,
    setAccessionFiles,
    existingAccessionUrls,
    setExistingAccessionUrls,
    additionalMediaFiles,
    setAdditionalMediaFiles,
    existingAdditionalMediaUrls,
    setExistingAdditionalMediaUrls,
    selectedRelatedFigures,
    setSelectedRelatedFigures,
    allFigures,
    figureSearch,
    setFigureSearch,
    showFigureResults,
    setShowFigureResults
}: OralHistoryEditFormProps) {
    const [transcriptLines, setTranscriptLines] = useState<{ id: string; timestamp: string; speaker: string; text: string }[]>([]);
    const [audioPlayerTime, setAudioPlayerTime] = useState(0);
    const [audioPlayerDuration, setAudioPlayerDuration] = useState(0);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
    const [tempCoverUrl, setTempCoverUrl] = useState<string | null>(null);

    const formAudioRef = useRef<HTMLAudioElement | null>(null);
    const figureRef = useRef<HTMLDivElement | null>(null);

    // Filter figure autocomplete list
    const filteredFigures = useMemo(() => {
        if (!figureSearch.trim()) return [];
        const searchLower = figureSearch.toLowerCase();
        return allFigures.filter(f => f.title.toLowerCase().includes(searchLower));
    }, [allFigures, figureSearch]);

    // Handle outside clicks for autocomplete
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (figureRef.current && !figureRef.current.contains(event.target as Node)) {
                setShowFigureResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setShowFigureResults]);

    // Parse transcript initially
    useEffect(() => {
        if (item) {
            const initialText = item.transcript || item.transcription || "";
            setTranscriptLines(parseTranscriptString(initialText));
        }
    }, [item]);

    // Serialize transcript lines for form field
    const serializedTranscript = useMemo(() => {
        return transcriptLines
            .map(line => `[${line.timestamp}] ${line.speaker}: ${line.text}`)
            .join('\n');
    }, [transcriptLines]);

    // Clean up local blob URLs
    useEffect(() => {
        return () => {
            if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
            if (tempCoverUrl) URL.revokeObjectURL(tempCoverUrl);
        };
    }, [audioBlobUrl, tempCoverUrl]);

    // Hook up audio player events
    useEffect(() => {
        const audio = formAudioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => setAudioPlayerTime(audio.currentTime);
        const onLoadedMetadata = () => setAudioPlayerDuration(audio.duration);
        const onPlay = () => setIsAudioPlaying(true);
        const onPause = () => setIsAudioPlaying(false);
        const onEnded = () => setIsAudioPlaying(false);

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
        };
    }, [audioBlobUrl, existingAdditionalMediaUrls]);

    const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (tempCoverUrl) URL.revokeObjectURL(tempCoverUrl);
        const url = URL.createObjectURL(file);
        setTempCoverUrl(url);
        
        setFileObjectURLs(prev => {
            const next = new Map(prev);
            next.set(file, url);
            return next;
        });
        
        setMediaItems([{ id: 'cover-' + Date.now(), type: 'new', value: file, caption: 'Cover Photo' }]);
        setFeaturedImageUrl(url);
    };

    const handleRemoveCover = () => {
        setMediaItems([]);
        setFeaturedImageUrl(null);
        if (tempCoverUrl) {
            URL.revokeObjectURL(tempCoverUrl);
            setTempCoverUrl(null);
        }
    };

    const handlePaperworkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setAccessionFiles(prev => [...prev, ...files]);
    };

    const handleRemoveNewPaperwork = (idx: number) => {
        setAccessionFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleRemoveExistingPaperwork = (url: string) => {
        setExistingAccessionUrls(prev => prev.filter(u => u !== url));
    };

    const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
        const url = URL.createObjectURL(file);
        setAudioBlobUrl(url);
        
        setAdditionalMediaFiles([file]);
    };

    const handleRemoveAudio = () => {
        setAdditionalMediaFiles([]);
        setExistingAdditionalMediaUrls([]);
        if (audioBlobUrl) {
            URL.revokeObjectURL(audioBlobUrl);
            setAudioBlobUrl(null);
        }
    };

    const togglePlay = () => {
        const audio = formAudioRef.current;
        if (!audio) return;
        if (isAudioPlaying) {
            audio.pause();
        } else {
            audio.play().catch(err => console.error("Error playing audio", err));
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = formAudioRef.current;
        if (!audio) return;
        const time = parseFloat(e.target.value);
        audio.currentTime = time;
        setAudioPlayerTime(time);
    };

    const playRowTime = (timestamp: string) => {
        const seconds = parseTimeToSeconds(timestamp);
        const audio = formAudioRef.current;
        if (!audio) return;
        audio.currentTime = seconds;
        setAudioPlayerTime(seconds);
        if (!isAudioPlaying) {
            audio.play().catch(err => console.error("Error playing audio", err));
        }
    };

    const syncRowTime = (rowId: string) => {
        const formatted = formatTime(audioPlayerTime);
        setTranscriptLines(prev => prev.map(line => 
            line.id === rowId ? { ...line, timestamp: formatted } : line
        ));
    };

    const addDialogueRow = (insertIdx?: number) => {
        const defaultTime = formatTime(audioPlayerTime);
        let prevSpeaker = 'Narrator';
        if (insertIdx !== undefined && insertIdx > 0 && transcriptLines[insertIdx - 1]) {
            prevSpeaker = transcriptLines[insertIdx - 1].speaker;
        } else if (transcriptLines.length > 0) {
            prevSpeaker = transcriptLines[transcriptLines.length - 1].speaker;
        } else if (selectedRelatedFigures.length > 0) {
            prevSpeaker = selectedRelatedFigures[0].full_name || selectedRelatedFigures[0].title || 'Narrator';
        }
        
        const newRow = {
            id: `line-new-${Date.now()}-${Math.random()}`,
            timestamp: defaultTime,
            speaker: prevSpeaker,
            text: ''
        };
        
        if (insertIdx !== undefined) {
            setTranscriptLines(prev => {
                const next = [...prev];
                next.splice(insertIdx, 0, newRow);
                return next;
            });
        } else {
            setTranscriptLines(prev => [...prev, newRow]);
        }
    };

    const deleteDialogueRow = (rowId: string) => {
        setTranscriptLines(prev => prev.filter(line => line.id !== rowId));
    };

    const sortTranscriptLines = () => {
        setTranscriptLines(prev => {
            return [...prev].sort((a, b) => {
                const secA = parseTimeToSeconds(a.timestamp);
                const secB = parseTimeToSeconds(b.timestamp);
                return secA - secB;
            });
        });
    };

    const updateRowField = (rowId: string, field: 'timestamp' | 'speaker' | 'text', val: string) => {
        setTranscriptLines(prev => prev.map(line => 
            line.id === rowId ? { ...line, [field]: val } : line
        ));
    };

    const clearTranscript = () => {
        if (window.confirm("Are you sure you want to clear the entire transcript? This cannot be undone.")) {
            setTranscriptLines([]);
        }
    };

    const audioSource = audioBlobUrl || (existingAdditionalMediaUrls.length > 0 ? existingAdditionalMediaUrls[0] : "");
    const coverImageSource = tempCoverUrl || featuredImageUrl;
    const narratorName = selectedRelatedFigures.length > 0 ? selectedRelatedFigures[0].full_name : 'Narrator';

    return (
        <form id="edit-item-form" onSubmit={handleSubmit} className="flex flex-col gap-10">
            {/* Hidden serialization field inside form */}
            <textarea 
                name="transcription" 
                value={serializedTranscript} 
                readOnly 
                className="hidden" 
            />

            {/* Audio tag for syncing & preview */}
            {audioSource && (
                <audio ref={formAudioRef} src={audioSource} preload="metadata" />
            )}

            {/* Suggestions datalist for speaker fields */}
            <datalist id="speaker-suggestions">
                <option value={narratorName} />
                <option value="Interviewer" />
            </datalist>

            {/* Form Top Section: Three-column Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Column 1 & 2: Story Details */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl border border-tan-light/40 shadow-xl p-8 space-y-6">
                        <div className="flex items-center gap-2 border-b border-tan-light/20 pb-3">
                            <Sparkles className="text-tan" size={20} />
                            <h3 className="text-xl font-serif font-bold text-charcoal">Story Details</h3>
                        </div>

                        {/* Title input */}
                        <div>
                            <label htmlFor="title" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Interview Title *</label>
                            <input 
                                required 
                                type="text" 
                                name="title" 
                                id="title" 
                                defaultValue={item.title || ""} 
                                placeholder="e.g. Oral History Interview with Mildred Sibley" 
                                className="w-full bg-cream/10 border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal" 
                            />
                        </div>

                        {/* Summary / Description */}
                        <div>
                            <label htmlFor="description" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Interview Summary & Context *</label>
                            <textarea 
                                required 
                                id="description" 
                                name="description" 
                                defaultValue={item.description || ""} 
                                placeholder="Provide a rich summary of the stories told, topics discussed, and historical context of this oral history..." 
                                className="w-full min-h-[160px] bg-cream/10 border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal leading-relaxed resize-none"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Interviewer */}
                            <div>
                                <label htmlFor="interviewer" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Interviewer Name</label>
                                <input 
                                    type="text" 
                                    name="interviewer" 
                                    id="interviewer" 
                                    defaultValue={item.interviewer || ""} 
                                    placeholder="e.g. Jane Smith" 
                                    className="w-full bg-cream/10 border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal" 
                                />
                            </div>

                            {/* Interview Date */}
                            <div>
                                <label htmlFor="interview_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Interview Date</label>
                                <input 
                                    type="text" 
                                    name="interview_date" 
                                    id="interview_date" 
                                    defaultValue={item.interview_date || ""} 
                                    placeholder="e.g. October 12, 1995" 
                                    className="w-full bg-cream/10 border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal" 
                                />
                            </div>
                        </div>

                        {/* Narrator Link Autocomplete */}
                        <div ref={figureRef} className="relative">
                            <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Connect Narrator (Historic Figure) *</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Type resident / figure name to search..."
                                    className="w-full bg-cream/10 border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal"
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
                                                        setSelectedRelatedFigures([{ id: fig.id, full_name: fig.title }]);
                                                        setFigureSearch('');
                                                        setShowFigureResults(false);
                                                    }}
                                                    className="w-full text-left px-4 py-3 hover:bg-cream border-b border-tan-light/20 last:border-0 flex items-center justify-between group text-sm"
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
                                        <div key={fig.id} className="flex items-center gap-2 bg-tan text-white px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider animate-in zoom-in duration-200">
                                            <span>Narrator: {fig.full_name || fig.title}</span>
                                            <button 
                                                type="button" 
                                                onClick={() => setSelectedRelatedFigures([])} 
                                                className="hover:text-charcoal transition-colors ml-1"
                                                title="Remove Narrator Link"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Column 3: Cover Photo & Media uploads */}
                <div className="space-y-6">
                    {/* Cover Photo Slot */}
                    <div className="bg-white rounded-2xl border border-tan-light/40 shadow-xl p-8 space-y-6">
                        <div className="flex items-center gap-2 border-b border-tan-light/20 pb-3">
                            <ImageIcon className="text-tan" size={20} />
                            <h3 className="text-xl font-serif font-bold text-charcoal">Cover Photo</h3>
                        </div>

                        {coverImageSource ? (
                            <div className="relative group rounded-xl overflow-hidden border-2 border-tan/30 shadow-inner aspect-[4/3] bg-cream/5 flex items-center justify-center">
                                <img src={coverImageSource} className="w-full h-full object-cover" alt="Cover preview" />
                                <div className="absolute inset-0 bg-charcoal/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button 
                                        type="button" 
                                        onClick={handleRemoveCover} 
                                        className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-red-700 transition-all"
                                    >
                                        Remove Photo
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="relative group border-2 border-dashed border-tan-light/80 hover:border-tan bg-cream/10 rounded-xl transition-all aspect-[4/3] flex flex-col items-center justify-center text-center p-6 cursor-pointer">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={handleCoverUpload} 
                                    className="absolute inset-0 opacity-0 cursor-pointer" 
                                />
                                <Upload className="text-tan-light group-hover:scale-110 transition-transform mb-3" size={28} />
                                <p className="text-xs font-black text-charcoal/80 uppercase tracking-widest mb-1">Upload Cover Photo</p>
                                <p className="text-[10px] text-charcoal/40 max-w-[180px]">Portrait image of the narrator or historical figure (.jpg, .png)</p>
                            </div>
                        )}
                    </div>

                    {/* Audio Interview Slot */}
                    <div className="bg-white rounded-2xl border border-tan-light/40 shadow-xl p-8 space-y-6">
                        <div className="flex items-center gap-2 border-b border-tan-light/20 pb-3">
                            <Music className="text-tan" size={20} />
                            <h3 className="text-xl font-serif font-bold text-charcoal">Interview Audio</h3>
                        </div>

                        {audioSource ? (
                            <div className="bg-cream/15 border border-tan-light/30 rounded-xl p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5 text-tan">
                                        <Music size={18} />
                                        <span className="text-xs font-black uppercase tracking-wider text-charcoal max-w-[150px] truncate">
                                            {additionalMediaFiles.length > 0 ? additionalMediaFiles[0].name : "Audio Recording"}
                                        </span>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={handleRemoveAudio} 
                                        className="text-red-500 hover:text-red-700 transition-colors p-1"
                                        title="Remove Audio File"
                                    >
                                        <XCircle size={16} />
                                    </button>
                                </div>
                                
                                {/* Audio wave preview inside form */}
                                <div className="flex items-center gap-3 bg-white border border-tan-light/20 p-3 rounded-lg shadow-sm">
                                    <button
                                        type="button"
                                        onClick={togglePlay}
                                        className="w-10 h-10 rounded-full bg-tan text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md shrink-0"
                                    >
                                        {isAudioPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                                    </button>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex justify-between text-[10px] font-mono text-charcoal/50">
                                            <span>{formatTime(audioPlayerTime)}</span>
                                            <span>{formatTime(audioPlayerDuration)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max={audioPlayerDuration || 100}
                                            value={audioPlayerTime}
                                            onChange={handleSeek}
                                            className="w-full accent-tan bg-tan-light/20 h-1 rounded appearance-none cursor-pointer focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="relative group border-2 border-dashed border-tan-light/80 hover:border-tan bg-cream/10 rounded-xl transition-all flex flex-col items-center justify-center text-center p-6 cursor-pointer">
                                <input 
                                    type="file" 
                                    accept="audio/*" 
                                    onChange={handleAudioUpload} 
                                    className="absolute inset-0 opacity-0 cursor-pointer" 
                                />
                                <Music className="text-tan-light group-hover:scale-110 transition-transform mb-3" size={28} />
                                <p className="text-xs font-black text-charcoal/80 uppercase tracking-widest mb-1">Upload Audio file</p>
                                <p className="text-[10px] text-charcoal/40 max-w-[180px]">Select digital audio interview recording (.mp3, .wav)</p>
                            </div>
                        )}

                        {/* YouTube URL field */}
                        <div>
                            <label htmlFor="youtube_video_id" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">YouTube Video URL / ID (Optional)</label>
                            <input 
                                type="text" 
                                name="youtube_video_id" 
                                id="youtube_video_id" 
                                defaultValue={item.youtube_video_id || ""} 
                                placeholder="e.g. dQw4w9WgXcQ" 
                                className="w-full bg-cream/10 border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal" 
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Dublin Core & Private Consent Documents section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Column 1: Private paperwork upload */}
                <div className="bg-white rounded-2xl border border-tan-light/40 shadow-xl p-8 space-y-6 lg:col-span-1">
                    <div className="flex items-center gap-2 border-b border-tan-light/20 pb-3">
                        <Lock className="text-amber-600" size={20} />
                        <h3 className="text-xl font-serif font-bold text-charcoal">Private Archives</h3>
                    </div>

                    <div className="bg-amber-50 border border-amber-200/50 p-4 rounded-xl flex gap-3 text-amber-800">
                        <AlertCircle className="shrink-0 mt-0.5" size={18} />
                        <div className="space-y-1 text-xs">
                            <p className="font-bold">⚠️ Private Curator-Only Access</p>
                            <p className="leading-relaxed text-amber-800/80">Consent forms, legal deeds of gift, and private paperwork are hidden from public website for resident confidentiality.</p>
                        </div>
                    </div>

                    {/* Paperwork preview and uploads */}
                    <div className="space-y-4">
                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider">Release & Consent Papers</label>
                        
                        {(existingAccessionUrls.length > 0 || accessionFiles.length > 0) && (
                            <div className="space-y-2">
                                {/* Existing ones */}
                                {existingAccessionUrls.map((url, i) => (
                                    <div key={'ext-' + i} className="flex items-center justify-between bg-charcoal/5 border border-charcoal/10 px-3.5 py-2.5 rounded-xl text-xs font-medium text-charcoal">
                                        <div className="flex items-center gap-2 font-bold max-w-[180px] truncate">
                                            <FileText size={14} className="text-tan" />
                                            <span>Consent Document #{i + 1}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-tan hover:text-charcoal transition-colors">
                                                View
                                            </a>
                                            <button 
                                                type="button" 
                                                onClick={() => handleRemoveExistingPaperwork(url)} 
                                                className="text-red-500 hover:text-red-700 transition-colors p-1"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Newly added ones */}
                                {accessionFiles.map((file, idx) => (
                                    <div key={'new-' + idx} className="flex items-center justify-between bg-tan-light/10 border border-tan-light/30 px-3.5 py-2.5 rounded-xl text-xs font-medium text-charcoal">
                                        <div className="flex items-center gap-2 font-bold max-w-[180px] truncate">
                                            <FileText size={14} className="text-tan" />
                                            <span>{file.name}</span>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => handleRemoveNewPaperwork(idx)} 
                                            className="text-red-500 hover:text-red-700 transition-colors p-1"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="relative group border-2 border-dashed border-amber-600/30 bg-amber-50/5 hover:border-amber-600 bg-cream/10 rounded-xl transition-all flex flex-col items-center justify-center text-center p-6 cursor-pointer">
                            <input 
                                type="file" 
                                multiple 
                                accept=".pdf,.png,.jpg,.jpeg" 
                                onChange={handlePaperworkUpload} 
                                className="absolute inset-0 opacity-0 cursor-pointer" 
                            />
                            <Upload className="text-amber-600/50 group-hover:scale-110 transition-transform mb-3" size={28} />
                            <p className="text-xs font-black text-charcoal/80 uppercase tracking-widest mb-1">Add Private Document</p>
                            <p className="text-[10px] text-charcoal/40 max-w-[180px]">Deed of gift or paperwork (.pdf, .jpg, .png)</p>
                        </div>
                    </div>
                </div>

                {/* Column 2 & 3: Archival Metadata */}
                <div className="bg-white rounded-2xl border border-tan-light/40 shadow-xl p-8 space-y-6 lg:col-span-2">
                    <div className="flex items-center gap-2 border-b border-tan-light/20 pb-3">
                        <BookOpen className="text-tan" size={20} />
                        <h3 className="text-xl font-serif font-bold text-charcoal">Dublin Core Archival Metadata</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Filing Code */}
                        <div>
                            <label htmlFor="archive_reference" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Filing Code</label>
                            <input 
                                type="text" 
                                name="archive_reference" 
                                id="archive_reference" 
                                defaultValue={item.archive_reference || ""} 
                                placeholder="e.g. SAHS-OH-1995-001" 
                                className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal" 
                            />
                        </div>

                        {/* Subject */}
                        <div>
                            <label htmlFor="subject" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Subject Topics</label>
                            <input 
                                type="text" 
                                name="subject" 
                                id="subject" 
                                defaultValue={item.subject || ""} 
                                placeholder="e.g. WWII, Senoia High School, Farming" 
                                className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal" 
                            />
                        </div>

                        {/* Creator */}
                        <div>
                            <label htmlFor="creator" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Creator</label>
                            <input 
                                type="text" 
                                name="creator" 
                                id="creator" 
                                defaultValue={item.creator || "Senoia Area Historical Society"} 
                                className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal" 
                            />
                        </div>

                        {/* Publisher */}
                        <div>
                            <label htmlFor="publisher" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Publisher</label>
                            <input 
                                type="text" 
                                name="publisher" 
                                id="publisher" 
                                defaultValue={item.publisher || "Senoia Area Historical Society"} 
                                className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal" 
                            />
                        </div>

                        {/* Rights */}
                        <div>
                            <label htmlFor="rights" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Rights Statement</label>
                            <input 
                                type="text" 
                                name="rights" 
                                id="rights" 
                                defaultValue={item.rights || "Copyright Senoia Area Historical Society. All rights reserved."} 
                                className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal" 
                            />
                        </div>

                        {/* Donor */}
                        <div>
                            <label htmlFor="donor" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Gift / Donor Name</label>
                            <input 
                                type="text" 
                                name="donor" 
                                id="donor" 
                                defaultValue={item.donor || ""} 
                                placeholder="e.g. Sibley Family Collection" 
                                className="w-full bg-cream/10 border border-tan-light/50 px-4 py-2.5 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans text-sm text-charcoal" 
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Immersive synced transcript editor spanning full width at bottom */}
            <div className="bg-white rounded-2xl border border-tan-light/40 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom duration-300">
                <div className="bg-cream/10 p-8 border-b border-tan-light/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-tan">
                            <Clock size={22} />
                            <h3 className="text-2xl font-serif font-bold text-charcoal">Timeline Transcript Editor</h3>
                        </div>
                        <p className="text-xs text-charcoal/50">Edit dialogue lines, synchronize timestamps live with audio, and sort chronologically.</p>
                    </div>

                    <div className="flex flex-wrap gap-2.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => addDialogueRow()}
                            className="bg-tan hover:bg-charcoal text-white text-xs px-4 py-2.5 rounded-lg font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md"
                        >
                            <Plus size={14} /> Add Line
                        </button>
                        <button
                            type="button"
                            onClick={sortTranscriptLines}
                            className="border border-tan-light/80 hover:bg-cream text-tan text-xs px-4 py-2.5 rounded-lg font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
                            title="Sort dialog rows in order of timestamps"
                        >
                            <RotateCw size={14} /> Sort Timeline
                        </button>
                        <button
                            type="button"
                            onClick={clearTranscript}
                            className="border border-red-200 text-red-500 hover:bg-red-50 text-xs px-4 py-2.5 rounded-lg font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
                            title="Clear transcript lines"
                        >
                            <XCircle size={14} /> Clear All
                        </button>
                    </div>
                </div>

                {audioSource ? (
                    <div className="p-4 bg-charcoal/5 border-b border-tan-light/10 flex flex-col sm:flex-row items-center gap-4">
                        <span className="text-[10px] font-black uppercase text-tan tracking-widest text-center sm:text-left">Active Player</span>
                        <div className="flex-1 w-full flex items-center gap-3 bg-white border border-tan-light/15 px-4 py-2 rounded-lg shadow-sm">
                            <button
                                type="button"
                                onClick={togglePlay}
                                className="w-8 h-8 rounded-full bg-tan text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md shrink-0"
                            >
                                {isAudioPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                            </button>
                            <span className="text-xs font-mono text-charcoal/60 w-10 shrink-0">{formatTime(audioPlayerTime)}</span>
                            <input
                                type="range"
                                min="0"
                                max={audioPlayerDuration || 100}
                                value={audioPlayerTime}
                                onChange={handleSeek}
                                className="flex-1 accent-tan bg-tan-light/20 h-1.5 rounded appearance-none cursor-pointer focus:outline-none"
                            />
                            <span className="text-xs font-mono text-charcoal/60 w-10 shrink-0 text-right">{formatTime(audioPlayerDuration)}</span>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 bg-amber-50/50 border-b border-amber-100 flex items-center gap-2.5 text-amber-800 text-xs font-medium">
                        <AlertCircle size={16} className="text-amber-600" />
                        <span>⚠️ Sync clock and play features will be enabled once you upload an audio interview file above.</span>
                    </div>
                )}

                <div className="max-h-[500px] overflow-y-auto">
                    {transcriptLines.length > 0 ? (
                        <div className="w-full overflow-x-auto">
                            <table className="w-full min-w-[700px] border-collapse text-left font-sans text-sm">
                                <thead>
                                    <tr className="bg-cream/15 border-b border-tan-light/25 text-[10px] font-black text-tan uppercase tracking-widest">
                                        <th className="px-6 py-4 w-28">Time</th>
                                        <th className="px-6 py-4 w-48">Speaker</th>
                                        <th className="px-6 py-4">Dialogue Line</th>
                                        <th className="px-6 py-4 w-28 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Topmost hover insert row */}
                                    <tr className="group/insert border-none">
                                        <td colSpan={4} className="p-0 relative">
                                            <div className="absolute inset-x-0 top-0 -translate-y-1/2 h-5 flex items-center justify-center opacity-0 hover:opacity-100 group-hover/insert:opacity-100 transition-all z-20">
                                                <div className="w-full h-0.5 bg-tan/40" />
                                                <button
                                                    type="button"
                                                    onClick={() => addDialogueRow(0)}
                                                    className="absolute bg-tan hover:bg-charcoal text-white w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md transform hover:scale-110 active:scale-95"
                                                    title="Insert line at the top"
                                                >
                                                    <Plus size={12} className="stroke-[3]" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>

                                    {transcriptLines.map((line, idx) => (
                                        <Fragment key={line.id}>
                                            <tr className="border-b border-tan-light/10 hover:bg-cream/5 transition-colors group/row">
                                                {/* Timestamp input */}
                                                <td className="px-6 py-3.5 align-top">
                                                    <input 
                                                        type="text"
                                                        value={line.timestamp}
                                                        onChange={(e) => updateRowField(line.id, 'timestamp', e.target.value)}
                                                        placeholder="MM:SS"
                                                        className="w-full bg-cream/10 border border-tan-light/40 px-2 py-1.5 rounded font-mono text-xs text-charcoal focus:bg-white focus:ring-1 focus:ring-tan outline-none text-center transition-all"
                                                    />
                                                </td>
                                                
                                                {/* Speaker input */}
                                                <td className="px-6 py-3.5 align-top">
                                                    <input 
                                                        type="text"
                                                        list="speaker-suggestions"
                                                        value={line.speaker}
                                                        onChange={(e) => updateRowField(line.id, 'speaker', e.target.value)}
                                                        placeholder="e.g. Narrator"
                                                        className="w-full bg-cream/10 border border-tan-light/40 px-3 py-1.5 rounded text-xs text-charcoal focus:bg-white focus:ring-1 focus:ring-tan outline-none transition-all font-medium"
                                                    />
                                                </td>
                                                
                                                {/* Dialogue Textarea */}
                                                <td className="px-6 py-3.5 align-top">
                                                    <textarea 
                                                        value={line.text}
                                                        onChange={(e) => updateRowField(line.id, 'text', e.target.value)}
                                                        placeholder="Type dialogue here..."
                                                        rows={1}
                                                        className="w-full bg-cream/10 border border-tan-light/40 px-3 py-1.5 rounded text-xs text-charcoal focus:bg-white focus:ring-1 focus:ring-tan outline-none transition-all resize-none leading-relaxed h-[34px] min-h-[34px] overflow-hidden"
                                                        onInput={(e) => {
                                                            const target = e.target as HTMLTextAreaElement;
                                                            target.style.height = 'auto';
                                                            target.style.height = `${target.scrollHeight}px`;
                                                        }}
                                                    />
                                                </td>

                                                {/* Actions */}
                                                <td className="px-6 py-3.5 align-top">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {audioSource && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => syncRowTime(line.id)}
                                                                    className="p-1.5 rounded hover:bg-tan/10 text-tan transition-colors"
                                                                    title="Sync with current playback time"
                                                                >
                                                                    <Clock size={15} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => playRowTime(line.timestamp)}
                                                                    className="p-1.5 rounded hover:bg-tan/10 text-tan transition-colors"
                                                                    title="Seek and play this line"
                                                                >
                                                                    <Play size={15} />
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteDialogueRow(line.id)}
                                                            className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors opacity-40 group-hover/row:opacity-100"
                                                            title="Delete dialogue row"
                                                        >
                                                            <X size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Hover-to-insert row between lines & bottom */}
                                            <tr className="group/insert border-none">
                                                <td colSpan={4} className="p-0 relative">
                                                    <div className="absolute inset-x-0 top-0 -translate-y-1/2 h-5 flex items-center justify-center opacity-0 hover:opacity-100 group-hover/insert:opacity-100 transition-all z-20">
                                                        <div className="w-full h-0.5 bg-tan/40" />
                                                        <button
                                                            type="button"
                                                            onClick={() => addDialogueRow(idx + 1)}
                                                            className="absolute bg-tan hover:bg-charcoal text-white w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md transform hover:scale-110 active:scale-95"
                                                            title={`Insert line after row ${idx + 1}`}
                                                        >
                                                            <Plus size={12} className="stroke-[3]" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="py-16 text-center space-y-3">
                            <Clock size={40} className="text-tan/30 mx-auto" />
                            <p className="text-charcoal/40 italic font-serif text-lg">No transcript lines added yet.</p>
                            <button
                                type="button"
                                onClick={() => addDialogueRow()}
                                className="border border-tan hover:bg-tan hover:text-white text-tan text-xs px-4 py-2 rounded-lg font-black uppercase tracking-wider transition-all"
                            >
                                Start Dialogue Timeline
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom action bar */}
            <div className="bg-cream/10 rounded-2xl border border-tan-light/40 p-6 flex justify-end gap-4 shadow-md">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-tan hover:bg-charcoal text-white text-sm px-8 py-3.5 rounded-xl font-bold transition-colors shadow-lg flex items-center gap-2 disabled:opacity-75"
                >
                    {isSubmitting ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Saving Oral History...
                        </>
                    ) : "Save Oral History Changes"}
                </button>
            </div>
        </form>
    );
}
