import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Upload, Image as ImageIcon, CheckCircle, AlertCircle, ChevronDown, ChevronUp, BookOpen, Sparkles, X, Plus, Search, FileText, Tag, Users, Lock, Camera, RotateCw, ChevronLeft, ChevronRight, Clock, XCircle, Calendar, Award, Play, Pause, Music } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { useSearchParams, Link } from 'react-router-dom';
import { collection, addDoc, getDocs, query, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import type { ItemType, Collection, ArchiveItem } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { ImageCropper } from '../components/ImageCropper';
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

export function AddItem() {
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [createdItemId, setCreatedItemId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [accessionFiles, setAccessionFiles] = useState<File[]>([]);
    const [isConvertingAccessionPdf, setIsConvertingAccessionPdf] = useState(false);
    const [accessionPdfProgress, setAccessionPdfProgress] = useState(0);
    const [additionalMediaFiles, setAdditionalMediaFiles] = useState<File[]>([]);
    const [featuredImageIndex, setFeaturedImageIndex] = useState(0);
    const [fileObjectURLs, setFileObjectURLs] = useState<Map<File, string>>(new Map());
    const [fileCaptions, setFileCaptions] = useState<string[]>([]);
    const [isConvertingPdf, setIsConvertingPdf] = useState(false);
    const [isConvertingHeic, setIsConvertingHeic] = useState(false);
    const [pdfConvertProgress, setPdfConvertProgress] = useState(0);

    const figureRef = useRef<HTMLDivElement>(null);
    const docRef = useRef<HTMLDivElement>(null);
    const orgRef = useRef<HTMLDivElement>(null);
    useClickOutside(figureRef, () => setShowFigureResults(false));
    useClickOutside(docRef, () => setShowDocResults(false));
    useClickOutside(orgRef, () => setShowOrgResults(false));

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
                const isSelected = selectedFiles.includes(file) || 
                                 accessionFiles.includes(file) || 
                                 additionalMediaFiles.includes(file);
                if (!isSelected) {
                    URL.revokeObjectURL(url);
                    next.delete(file);
                }
            });
            return next;
        });
    }, [selectedFiles]);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const initialTypeParam = searchParams.get('type') as ItemType | null;
    const [itemType, setItemType] = useState<ItemType>(initialTypeParam || 'Document');
    const [showAdvancedDC, setShowAdvancedDC] = useState(false);

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
    const [croppingImageIndex, setCroppingImageIndex] = useState<number | null>(null);
    const [physicalLocationValue, setPhysicalLocationValue] = useState('SAHS (Physical Archive)');

    // Document linking for Figures
    const [allDocs, setAllDocs] = useState<{ id: string, title: string }[]>([]);
    const [selectedRelatedDocs, setSelectedRelatedDocs] = useState<{ id: string, title: string }[]>([]);
    const [docSearch, setDocSearch] = useState('');
    const [showDocResults, setShowDocResults] = useState(false);

    const initialCollectionParam = searchParams.get('collection_id');
    const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(initialCollectionParam ? [initialCollectionParam] : []);
    const [artifactId, setArtifactId] = useState('');
    const [suggestedId, setSuggestedId] = useState<string | null>(null);
    const [isPrivate, setIsPrivate] = useState(false);
    const [collectionStatus, setCollectionStatus] = useState<'permanent' | 'pending' | 'deaccessioned' | 'loan'>('permanent');

    useEffect(() => {
        if (itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')) {
            setIsPrivate(true);
        }
    }, [collectionStatus, itemType]);

    const handleCollectionToggle = (collId: string) => {
        setSelectedCollectionIds(prev => prev.includes(collId) ? prev.filter(id => id !== collId) : [...prev, collId]);
    };

    const handleCreateNewCollection = async () => {
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
                setSelectedCollectionIds(prev => [...prev, docRef.id]);
            } catch (err) {
                alert("Failed to create collection.");
            }
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
                    .filter(i => i.item_type === 'Document' || i.item_type === 'Artifact')
                    .map(i => ({ id: i.id, title: i.title || "Untitled File" }));
                setAllDocs(docs.sort((a, b) => a.title.localeCompare(b.title)));

                const orgs = allItemsData
                    .filter(i => i.item_type === 'Historic Organization')
                    .map(i => ({ id: i.id, title: i.title || i.org_name || "Unnamed Organization" }));
                setAllOrgs(orgs.sort((a, b) => a.title.localeCompare(b.title)));

                // Fetch All Tags for suggestions
                const tags = new Set<string>();
                let maxId = 0;
                
                allItemsData.forEach(item => {
                    if (item.tags) item.tags.forEach((t: string) => tags.add(t));
                    
                    // Collect purely numeric artifact IDs for suggestion logic (only focusing on Artifacts to avoid hex/garbage IDs)
                    if (item.item_type === 'Artifact' && item.artifact_id) {
                        const trimmed = item.artifact_id.trim();
                        if (/^\d+$/.test(trimmed)) {
                            const num = parseInt(trimmed, 10);
                            if (!isNaN(num) && num > maxId) {
                                maxId = num;
                            }
                        }
                    }
                });
                setAllExistingTags(Array.from(tags).sort());

                // Calculate next ID (highest ID + 1)
                const next = maxId + 1;
                setSuggestedId(next.toString());

            } catch (error) {
                console.error("Error fetching initial form data:", error);
            }
        };
        fetchInitialData();
    }, []);


    const moveFile = (index: number, direction: 'left' | 'right') => {
        const newFiles = [...selectedFiles];
        const newIndex = direction === 'left' ? index - 1 : index + 1;
        
        if (newIndex < 0 || newIndex >= newFiles.length) return;
        
        // Swap files
        [newFiles[index], newFiles[newIndex]] = [newFiles[newIndex], newFiles[index]];
        
        // Swap captions
        const newCaptions = [...fileCaptions];
        [newCaptions[index], newCaptions[newIndex]] = [newCaptions[newIndex], newCaptions[index]];
        setFileCaptions(newCaptions);
        
        // Update featured index if it was one of the swapped files
        if (featuredImageIndex === index) {
            setFeaturedImageIndex(newIndex);
        } else if (featuredImageIndex === newIndex) {
            setFeaturedImageIndex(index);
        }
        
        setSelectedFiles(newFiles);
    };

    const processFiles = async (files: FileList | File[]) => {
        const fileArray = Array.from(files);
        const finalFiles: File[] = [];
        
        const hasPdf = fileArray.some(f => f.type === 'application/pdf');
        const hasHeic = fileArray.some(f => f.name.toLowerCase().endsWith('.heic') || f.name.toLowerCase().endsWith('.heif'));
        
        if (hasPdf) {
            setIsConvertingPdf(true);
            setPdfConvertProgress(0);
        }
        if (hasHeic) {
            setIsConvertingHeic(true);
        }

        try {
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
                    finalFiles.push(...pngs);
                } else {
                    finalFiles.push(file);
                }
            }
            setSelectedFiles(prev => [...prev, ...finalFiles]);
            setFileCaptions(prev => [...prev, ...Array(finalFiles.length).fill('')]);
        } catch (error) {
            console.error("Failed to process files:", error);
            alert("Failed to read or convert one or more files.");
        } finally {
            setIsConvertingPdf(false);
            setIsConvertingHeic(false);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const formData = new FormData(e.target as HTMLFormElement);
            
            const historical_address = formData.get('historical_address') as string || "";
            let coordinates = null;
            if (historical_address) {
                coordinates = await getCoordinatesFromAddress(historical_address);
            }
            
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

            const uploadToStorage = async (files: File[], folder: string) => {
                const urls: string[] = [];
                for (const file of files) {
                    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
                    const uploadTask = uploadBytesResumable(storageRef, file);

                    await new Promise<void>((resolve, reject) => {
                        uploadTask.on('state_changed',
                            (snapshot) => {
                                // Simplified progress check for nested uploads
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

            const accessionUrls = accessionFiles.length > 0 
                ? await uploadToStorage(accessionFiles, 'accession_paperwork') 
                : [];
            
            const additionalMediaUrls = additionalMediaFiles.length > 0 
                ? await uploadToStorage(additionalMediaFiles, 'additional_media') 
                : [];

            /*
             - [x] Enhance manual upload form with professional archival fields:
        - [x] Condition, Location, Category dropdowns
        - [x] Historic Figure relationship linking
        - [x] Date, Transcription, and Archive Ref fields
    - [x] Implement high-resolution zoom and scroll functionality for document images
    - [x] Update Item Detail view to display all new metadata fields and associated figures
    - [x] Verify UI/UX matches reference site aesthetics (Premium layout)
            */

            let final_historical_address = historical_address;
            let final_coordinates = coordinates;

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

            const itemData: Omit<ArchiveItem, 'id'> = {
                item_type: itemType,
                file_urls: fileUrls,
                file_captions: fileCaptions,
                featured_image_url: fileUrls[featuredImageIndex] || (fileUrls.length > 0 ? fileUrls[0] : null),
                accession_paperwork_urls: accessionUrls,
                additional_media_urls: additionalMediaUrls,
                tags: currentTags,
                collection_id: selectedCollectionIds.length > 0 ? selectedCollectionIds[0] : null,
                collection_ids: selectedCollectionIds,
                created_at: new Date().toISOString(),
                uploaded_by_email: user?.email || null,
                uploaded_by_name: user?.displayName || null,
                is_private: (itemType === 'Artifact' && (collectionStatus === 'pending' || collectionStatus === 'deaccessioned')) ? true : isPrivate,
                collection_status: itemType === 'Artifact' ? collectionStatus : null,

                title: formData.get('title') as string || "",
                description: formData.get('description') as string || "",
                transcription: formData.get('transcription') as string || "",
                archive_reference: formData.get('archive_reference') as string || "",
                date: formData.get('date') as string || "",
                creator: formData.get('creator') as string || "",
                subject: formData.get('subject') as string || "",
                coverage: formData.get('location') as string || "",

                category: itemType === 'Artifact' ? 'Artifact' : (formData.get('category') as string || ""),

                // SAHS Specific
                condition: (formData.get('condition') as any) || null,
                physical_location: (formData.get('physical_location') as any) || null,
                historical_address: final_historical_address,
                coordinates: final_coordinates,
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
                biography_sources: formData.get('biography_sources') as string || "",

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
                source: (formData.get('source') as string) || (formData.get('source_institution') as string) || "",

                artifact_id: formData.get('artifact_id') as string || "",
                artifact_type: formData.get('artifact_type') as string || "",
                museum_location: formData.get('museum_location') as string || "",
                accession_date: formData.get('accession_date') as string || "",

                // Oral History specific
                narrator_id: selectedRelatedFigures.length > 0 ? selectedRelatedFigures[0].id : null,
                interviewer: formData.get('interviewer') as string || "",
                interview_date: formData.get('interview_date') as string || "",
                audio_url: additionalMediaUrls.length > 0 ? additionalMediaUrls[0] : (formData.get('youtube_video_id') ? null : ""),
                youtube_video_id: formData.get('youtube_video_id') as string || "",
                transcript: formData.get('transcript') as string || formData.get('transcription') as string || "",
            };

            const docRef = await addDoc(collection(db, 'archive_items'), itemData);

            // --- Two-Way Linking Synchronization (Add Item) ---
            for (const org of selectedRelatedOrgs) {
                await updateDoc(doc(db, 'archive_items', org.id), {
                    related_documents: arrayUnion(docRef.id)
                }).catch(e => console.error("Two-way link failed:", e));
            }
            
            for (const fig of selectedRelatedFigures) {
                await updateDoc(doc(db, 'archive_items', fig.id), {
                    related_documents: arrayUnion(docRef.id)
                }).catch(e => console.error("Two-way link failed:", e));
            }
            
            for (const d of selectedRelatedDocs) {
                const arrayField = itemType === 'Historic Organization' ? 'related_organizations' : itemType === 'Historic Figure' ? 'related_figures' : 'related_documents';
                await updateDoc(doc(db, 'archive_items', d.id), {
                    [arrayField]: arrayUnion(docRef.id)
                }).catch(e => console.error("Two-way link failed:", e));
            }
            // ----------------------------------------

            if ((itemType === 'Historic Organization' || itemType === 'Historic Figure') && final_historical_address) {
                const new_address = final_historical_address;
                const allLinkedIds = new Set(selectedRelatedDocs.map(d => d.id));
                for (const artId of allLinkedIds) {
                    const artDoc = await getDoc(doc(db, 'archive_items', artId));
                    if (artDoc.exists()) {
                        const artData = artDoc.data();
                        const artAddr = artData.historical_address || "";
                        if (artAddr === "") {
                            await updateDoc(doc(db, 'archive_items', artId), {
                                historical_address: new_address,
                                coordinates: final_coordinates
                            });
                        }
                    }
                }
            }

            setCreatedItemId(docRef.id);
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

    const handleCropComplete = (croppedBlob: Blob) => {
        if (croppingImageIndex === null) return;
        
        const originalFile = selectedFiles[croppingImageIndex];
        const croppedFile = new File([croppedBlob], originalFile.name, { type: 'image/jpeg' });
        
        const newFiles = [...selectedFiles];
        newFiles[croppingImageIndex] = croppedFile;
        setSelectedFiles(newFiles);
        setCroppingImageIndex(null);
    };

    if (success) {
        return (
            <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-tan-light/50 text-tan rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={32} />
                </div>
                <h2 className="text-3xl font-serif font-bold text-charcoal mb-2">Item Archived</h2>
                <p className="text-charcoal/70 mb-8 text-center max-w-md">The item has been successfully preserved in the archive database.</p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    {createdItemId && (
                        <Link 
                            to={`/items/${createdItemId}`}
                            className="bg-white text-tan border-2 border-tan px-6 py-3 rounded-lg font-medium hover:bg-tan hover:text-white transition-colors text-center"
                        >
                            View Archived Item
                        </Link>
                    )}
                    <button
                        onClick={() => {
                            setSuccess(false);
                            setCreatedItemId(null);
                            setSelectedFiles([]);
                        setFileCaptions([]);
                        setAccessionFiles([]);
                        setAdditionalMediaFiles([]);
                        setCurrentTags([]);
                        setSelectedRelatedFigures([]);
                        setSelectedRelatedDocs([]);
                        setSelectedRelatedOrgs([]);
                        setUploadProgress(null);
                        setArtifactId('');
                        (document.getElementById('add-item-form') as HTMLFormElement)?.reset();
                        // Re-fetch data to update suggested ID based on what was just added
                        const fetchInitialData = async () => {
                            try {
                                const qItemsAll = query(collection(db, 'archive_items'));
                                const itemsSnapAll = await getDocs(qItemsAll);
                                const allItemsData = itemsSnapAll.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
                                
                                let maxId = 0;
                                allItemsData.forEach(item => {
                                    if (item.item_type === 'Artifact' && item.artifact_id) {
                                        const trimmed = item.artifact_id.trim();
                                        if (/^\d+$/.test(trimmed)) {
                                            const num = parseInt(trimmed, 10);
                                            if (!isNaN(num) && num > maxId) {
                                                maxId = num;
                                            }
                                        }
                                    }
                                });
                                
                                const next = maxId + 1;
                                setSuggestedId(next.toString());
                            } catch (e) {
                                console.error("Error refreshing suggestions:", e);
                            }
                        };
                        fetchInitialData();
                    }}
                    className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors"
                >
                    Archive Another Item
                    </button>
                </div>
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

            {/* Cropper Modal */}
            {croppingImageIndex !== null && (
                <ImageCropper
                    image={fileObjectURLs.get(selectedFiles[croppingImageIndex]) || ''}
                    onCropComplete={handleCropComplete}
                    onCancel={() => setCroppingImageIndex(null)}
                    aspectRatio={itemType === 'Historic Figure' ? 0.75 : undefined}
                />
            )}

            <div className="mb-8 border-b border-tan-light/50 pb-6">
                <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                    <Upload className="text-tan" size={32} />
                    Add Archive Item
                </h1>
                <p className="text-charcoal/70 text-lg">Preserve a new document, photograph, or historic figure in the digital vault.</p>
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
                <OralHistoryAddForm
                    isSubmitting={isSubmitting}
                    handleSubmit={handleSubmit}
                    uploadProgress={uploadProgress}
                    selectedFiles={selectedFiles}
                    setSelectedFiles={setSelectedFiles}
                    fileObjectURLs={fileObjectURLs}
                    setFileObjectURLs={setFileObjectURLs}
                    featuredImageIndex={featuredImageIndex}
                    setFeaturedImageIndex={setFeaturedImageIndex}
                    accessionFiles={accessionFiles}
                    setAccessionFiles={setAccessionFiles}
                    additionalMediaFiles={additionalMediaFiles}
                    setAdditionalMediaFiles={setAdditionalMediaFiles}
                    selectedRelatedFigures={selectedRelatedFigures}
                    setSelectedRelatedFigures={setSelectedRelatedFigures}
                    allFigures={allFigures}
                    figureSearch={figureSearch}
                    setFigureSearch={setFigureSearch}
                    showFigureResults={showFigureResults}
                    setShowFigureResults={setShowFigureResults}
                />
            ) : (
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

                             <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-3 underline underline-offset-4 decoration-tan/30 flex items-center gap-2">
                                {itemType === 'Document' ? 'Document Scans / Photos' : itemType === 'Artifact' ? 'Artifact Photos' : 'Representative Media / Portraits'}
                                <div className="ml-auto flex items-center gap-2">
                                    <GoogleDrivePicker onFilesSelected={handleDriveFiles} onError={setError} />
                                    {selectedFiles.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedFiles([]); setFileCaptions([]); setFeaturedImageIndex(0); }}
                                            className="text-[10px] font-black uppercase text-red-500 hover:text-red-700 tracking-widest transition-colors flex items-center gap-1"
                                        >
                                            <X size={10} /> Clear
                                        </button>
                                    )}
                                </div>
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
                                    accept="image/png, image/jpeg, image/webp, image/heic, image/heif, .heic, .heif, application/pdf"
                                    onChange={async (e) => {
                                        if (e.target.files) {
                                            await processFiles(e.target.files);
                                            e.target.value = '';
                                        }
                                    }}
                                />
                                {/* Image Grid */}
                                {isConvertingHeic ? (
                                    <div className="flex flex-col items-center gap-3 mt-4">
                                        <div className="w-8 h-8 border-4 border-tan border-t-transparent rounded-full animate-spin"></div>
                                        <p className="font-bold text-charcoal">Converting iPhone Image (HEIC)...</p>
                                        <p className="text-xs text-charcoal/60">Optimizing for web preservation</p>
                                    </div>
                                ) : isConvertingPdf ? (
                                    <div className="flex flex-col items-center gap-3 mt-4">
                                        <div className="w-8 h-8 border-4 border-tan border-t-transparent rounded-full animate-spin"></div>
                                        <p className="font-bold text-charcoal">Converting Extracted PDF Pages...</p>
                                        <div className="w-full max-w-[200px] h-2 bg-cream rounded-full overflow-hidden">
                                            <div className="h-full bg-tan transition-all duration-300" style={{ width: `${Math.max(5, pdfConvertProgress)}%` }}></div>
                                        </div>
                                    </div>
                                ) : selectedFiles.length > 0 ? (
                                    <div className="grid grid-cols-4 gap-2 w-full max-w-sm mt-4">
                                        {selectedFiles.map((file, idx) => {
                                            const url = fileObjectURLs.get(file) || '';
                                            const isImage = file.type.startsWith('image/');
                                            return (
                                                <div key={`pending-${idx}`} className="flex flex-col gap-1">
                                                    <div className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group/thumb ${featuredImageIndex === idx ? 'border-tan ring-2 ring-tan/20 shadow-md' : 'border-tan-light/30 hover:border-tan-light'}`}>
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
                                                            {isImage && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setCroppingImageIndex(idx);
                                                                    }}
                                                                    className="flex items-center gap-1.5 px-2 py-1 bg-white/20 hover:bg-tan rounded-full text-white backdrop-blur-sm transition-all text-[10px] font-bold border border-white/30"
                                                                    title="Edit & Rotate"
                                                                >
                                                                     <RotateCw size={12} />
                                                                     Edit / Rotate
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
                                                                    setFileCaptions(prev => prev.filter((_, i) => i !== idx));
                                                                    if (featuredImageIndex === idx) setFeaturedImageIndex(0);
                                                                }}
                                                                className="p-1 bg-white/20 hover:bg-red-500/60 rounded-full text-white backdrop-blur-sm transition-colors"
                                                                title="Remove File"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                            <div className="flex gap-1">
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === 0}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        moveFile(idx, 'left');
                                                                    }}
                                                                    className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                                                    title="Move Left"
                                                                >
                                                                    <ChevronLeft size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === selectedFiles.length - 1}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        moveFile(idx, 'right');
                                                                    }}
                                                                    className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                                                    title="Move Right"
                                                                >
                                                                    <ChevronRight size={12} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {featuredImageIndex === idx && (
                                                            <div className="absolute top-1 left-1 bg-tan text-white p-0.5 rounded-full shadow-sm z-20">
                                                                <CheckCircle size={8} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={fileCaptions[idx] || ''}
                                                        onChange={(e) => {
                                                            const newCaptions = [...fileCaptions];
                                                            newCaptions[idx] = e.target.value;
                                                            setFileCaptions(newCaptions);
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        placeholder="Add caption..."
                                                        className="w-full text-[10px] px-2 py-1 rounded bg-cream/50 border border-tan-light/30 focus:border-tan focus:outline-none font-sans"
                                                    />
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


                        </div>

                        <div className="space-y-6">
                            {/* NEW: Supplemental Media & Documentation */}
                            {!['Historic Figure', 'Historic Organization'].includes(itemType.trim()) && (
                                <div className="bg-white/50 border border-tan-light/30 rounded-2xl p-6 space-y-6">
                                    <div>
                                        <label className="block text-[10px] font-black text-tan uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            <FileText size={14} /> Accessioning Paperwork
                                            <span className="ml-auto text-[9px] text-charcoal/40 bg-cream/50 px-2 py-0.5 rounded-full lowercase tracking-normal font-bold flex items-center gap-1">
                                                <Lock size={10} /> Admin & Curators Only
                                            </span>
                                        </label>
                                        <div 
                                            onClick={() => document.getElementById('accession-upload')?.click()}
                                            className="border-2 border-dashed border-tan-light/40 bg-white/50 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-all min-h-[6rem] group"
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
                                                            <div className="bg-tan/10 text-tan p-2 rounded-lg border border-tan-light/30 flex items-center gap-2 pr-8">
                                                                <FileText size={14} />
                                                                <span className="text-[10px] font-bold max-w-[80px] truncate">{f.name}</span>
                                                            </div>
                                                            <button 
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setAccessionFiles(prev => prev.filter((_, idx) => idx !== i));
                                                                }}
                                                                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover/file:opacity-100 transition-opacity"
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
                                    <div 
                                        onClick={() => document.getElementById('media-upload')?.click()}
                                        className="border-2 border-dashed border-tan-light/40 bg-white/50 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-all min-h-[6rem] group"
                                    >
                                        <input 
                                            id="media-upload"
                                            type="file" 
                                            multiple 
                                            className="hidden" 
                                            accept="video/*,audio/*"
                                            onChange={(e) => {
                                                if (e.target.files) setAdditionalMediaFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                                e.target.value = '';
                                            }}
                                        />
                                        {additionalMediaFiles.length > 0 ? (
                                            <div className="flex flex-wrap gap-2 justify-center">
                                                {additionalMediaFiles.map((f, i) => (
                                                    <div key={i} className="relative group/file">
                                                        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg border border-indigo-100 flex items-center gap-2 pr-8">
                                                            <Camera size={14} />
                                                            <span className="text-[10px] font-bold max-w-[80px] truncate">{f.name}</span>
                                                        </div>
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setAdditionalMediaFiles(prev => prev.filter((_, idx) => idx !== i));
                                                            }}
                                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover/file:opacity-100 transition-opacity"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center">
                                                <Upload size={18} className="text-indigo-300/40 mb-1 group-hover:scale-110 transition-transform" />
                                                                <span className="text-[10px] font-bold text-charcoal/40 uppercase tracking-widest">Upload Media</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            <div>
                                <label htmlFor="title" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Display Title / Name *</label>
                                <input required type="text" name="title" id="title" placeholder={itemType === 'Historic Figure' ? "e.g. John Doe" : itemType === 'Historic Organization' ? "e.g. Senoia General Store" : itemType === 'Artifact' ? "e.g. Civil War Bayonet" : "Descriptive title for the archive"} className="w-full bg-white border border-tan-light/50 px-4 py-4 rounded-xl outline-none focus:ring-4 focus:ring-tan/10 focus:border-tan transition-all font-sans text-lg font-medium" />
                            </div>

                            {itemType === 'Historic Organization' && (
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
                                            <label htmlFor="founding_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Established Date</label>
                                            <input type="text" name="founding_date" id="founding_date" placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="dissolved_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Closed / Dissolved Date</label>
                                            <input type="text" name="dissolved_date" id="dissolved_date" placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                </>
                            )}

                            {(itemType as string) === 'Oral History' && (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="interviewer" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Interviewer Name</label>
                                            <input type="text" name="interviewer" id="interviewer" placeholder="e.g. Jane Smith" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="interview_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Interview Date</label>
                                            <input type="text" name="interview_date" id="interview_date" placeholder="e.g. October 12, 1995" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label htmlFor="youtube_video_id" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">YouTube Video ID / URL (Optional)</label>
                                            <input type="text" name="youtube_video_id" id="youtube_video_id" placeholder="e.g. dQw4w9WgXcQ" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* General Archive Metadata (Universal Fields) */}
                            <div className="mt-8 pt-8 border-t border-tan-light/30">
                                <h4 className="text-sm font-bold text-tan uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <BookOpen size={16} /> General Archive Metadata
                                </h4>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                    <div>
                                        <label htmlFor="historical_address" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Historical Physical Address (For Map View)</label>
                                        <input type="text" name="historical_address" id="historical_address" placeholder="e.g. 123 Main St, Senoia, GA" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                    </div>
                                    {!['Historic Figure', 'Historic Organization'].includes(itemType) && (
                                        <div>
                                            <label htmlFor="date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Date (e.g. 1920, c. 1905)</label>
                                            <input type="text" name="date" id="date" placeholder="Approximate or Exact Date" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    )}
                                    {itemType !== 'Historic Organization' && itemType !== 'Artifact' && itemType !== 'Historic Figure' && (
                                        <div>
                                            <label htmlFor="category" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Category</label>
                                            <div className="relative">
                                                <select name="category" id="category" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                    {["Manuscript", "Photograph", "Map", "Letter", "Newspaper", "Magazine", "Legal Document", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                            </div>
                                        </div>
                                    )}
                                    {!['Historic Figure', 'Historic Organization'].includes(itemType) && (
                                        <div>
                                            <label htmlFor="condition" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Condition</label>
                                            <div className="relative">
                                                <select name="condition" id="condition" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                    {["Excellent", "Good", "Fair", "Poor", "Fragile", "Needs To Be Rescanned"].map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                            </div>
                                        </div>
                                    )}
                                    {itemType !== 'Historic Organization' && itemType !== 'Historic Figure' && (
                                        <div>
                                            <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Collections</label>
                                            <div className="bg-white border border-tan-light/50 rounded-lg p-3 max-h-[200px] overflow-y-auto flex flex-col gap-2 shadow-inner">
                                                {collections.map(c => (
                                                    <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-cream/50 rounded-md cursor-pointer transition-colors border border-transparent hover:border-tan-light/30">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedCollectionIds.includes(c.id)} 
                                                            onChange={() => handleCollectionToggle(c.id)}
                                                            className="w-4 h-4 text-tan border-tan-light rounded focus:ring-tan/20"
                                                        />
                                                        <span className="text-sm text-charcoal font-medium">{c.title}</span>
                                                    </label>
                                                ))}
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
                                </div>
                            </div>

                            {itemType === 'Historic Figure' && (
                                <div className="mt-8 pt-8 border-t border-tan-light/30">
                                    <h4 className="text-sm font-bold text-tan uppercase tracking-widest mb-6 flex items-center gap-2">
                                        <Users size={16} /> Biographic Details
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                        <div>
                                            <label htmlFor="full_name" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Full Given Name</label>
                                            <input type="text" name="full_name" id="full_name" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="also_known_as" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Also Known As / Alias</label>
                                            <input type="text" name="also_known_as" id="also_known_as" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="birth_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Birth Date</label>
                                            <input type="text" name="birth_date" id="birth_date" placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="death_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Death Date</label>
                                            <input type="text" name="death_date" id="death_date" placeholder="MM/DD/YYYY" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="birthplace" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Birthplace</label>
                                            <input type="text" name="birthplace" id="birthplace" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                        <div>
                                            <label htmlFor="occupation" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Occupation / Title</label>
                                            <input type="text" name="occupation" id="occupation" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 text-sm transition-all" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!['Historic Figure', 'Historic Organization'].includes(itemType) && (
                                <div className="mt-6 pt-6 border-t border-tan-light/30">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {itemType === 'Artifact' && (
                                            <div>
                                                <label htmlFor="artifact_type" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Artifact Type</label>
                                                <div className="relative">
                                                    <select name="artifact_type" id="artifact_type" className="w-full bg-white border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-tan/20 appearance-none text-sm transition-all">
                                                        {["textile", "photo", "print", "award/trophy", "memorabilia", "furniture", "ceramics", "miscellaneous", "technology", "signs", "jewelry", "metal", "glass", "agriculture"].map(t => (
                                                            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 pointer-events-none" size={16} />
                                                </div>
                                            </div>
                                        )}
                                        {!['Historic Figure', 'Historic Organization'].includes(itemType) && (
                                            <>
                                                <div>
                                                    <label htmlFor="physical_location" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Filing Location</label>
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
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div>
                                <div>
                                    <label htmlFor="description" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">
                                        {itemType === 'Historic Figure' ? 'Biography *' : itemType === 'Historic Organization' ? 'History & Description *' : itemType === 'Artifact' ? 'Physical Description & History *' : (itemType as string) === 'Oral History' ? 'Interview Summary & Context *' : 'History & Description *'}
                                    </label>
                                    <textarea required id="description" name="description" placeholder={itemType === 'Historic Figure' ? "Biographical details, family history, and significance..." : itemType === 'Historic Organization' ? "Historical details, mission, key figures, and legacy..." : itemType === 'Artifact' ? "Physical details, materials, historical use, and significance..." : (itemType as string) === 'Oral History' ? "Summary of the interview, key stories told, and narrator background..." : "Provide background, provenance, or biographical details..."} className="w-full min-h-[140px] bg-white border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:ring-4 focus:ring-tan/10 focus:border-tan transition-all font-sans resize-none leading-relaxed"></textarea>
                                </div>

                                {(itemType as string) === 'Oral History' && (
                                    <div className="mt-6">
                                        <label htmlFor="transcript" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">
                                            Full Interview Transcript *
                                        </label>
                                        <textarea required id="transcript" name="transcript" placeholder="Paste the full, transcribed interview dialogue here. Use Speaker names like 'Jane Smith:' for dialogue..." className="w-full min-h-[250px] bg-white border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:ring-4 focus:ring-tan/10 focus:border-tan transition-all font-sans resize-none leading-relaxed"></textarea>
                                    </div>
                                )}
                            </div>
                            
                            {(itemType === 'Historic Figure' || itemType === 'Historic Organization') && (
                                <div className="mt-6">
                                    <label htmlFor="biography_sources" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">
                                        {itemType === 'Historic Figure' ? 'Biography Sources' : 'Description Sources'}
                                    </label>
                                    <textarea id="biography_sources" name="biography_sources" placeholder={itemType === 'Historic Figure' ? "List sources, books, links, or documents used for this biography..." : "List sources, books, links, or documents used for this organization's history..."} className="w-full min-h-[100px] bg-white border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:ring-4 focus:ring-tan/10 focus:border-tan transition-all font-sans resize-none leading-relaxed"></textarea>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Section 2: Extended Details & Relationships */}
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
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
                            {itemType !== 'Document' && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label htmlFor="artifact_id" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider">Artifact ID #</label>
                                        {suggestedId && (
                                            <button 
                                                type="button" 
                                                onClick={() => setArtifactId(suggestedId)}
                                                className="text-[10px] font-bold text-tan hover:text-charcoal transition-colors uppercase tracking-widest flex items-center gap-1"
                                            >
                                                <Sparkles size={10} /> Suggest: {suggestedId}
                                            </button>
                                        )}
                                    </div>
                                    <input 
                                        type="text" 
                                        name="artifact_id" 
                                        id="artifact_id" 
                                        value={artifactId}
                                        onChange={(e) => setArtifactId(e.target.value)}
                                        placeholder="e.g. 2024.01.05" 
                                        className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" 
                                    />
                                </div>
                            )}
                            {(itemType === 'Document' || itemType === 'Artifact') && (
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
                            {(itemType !== 'Historic Figure' && itemType !== 'Historic Organization') && (
                                <div>
                                    <label htmlFor="location" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Origin Location</label>
                                    <input type="text" name="location" id="location" placeholder="e.g. Senoia, Main St." className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                                </div>
                            )}
                            <div>
                                <label htmlFor="creator" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Original Creator</label>
                                <input type="text" name="creator" id="creator" className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                            </div>
                            <div>
                                <label htmlFor="donor" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Original Donor</label>
                                <input type="text" name="donor" id="donor" className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                            </div>
                            <div>
                                <label htmlFor="accession_date" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Accession Date</label>
                                <input type="text" name="accession_date" id="accession_date" placeholder="MM/DD/YYYY" className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                            </div>
                            {(itemType !== 'Historic Figure' && itemType !== 'Historic Organization') && (
                                <div className="md:col-span-2">
                                    <label htmlFor="museum_location" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Museum Location (Specific Shelf/Box)</label>
                                    <input type="text" name="museum_location" id="museum_location" placeholder="e.g. Shelf 4, Drawer B, Box 12" className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                                </div>
                            )}
                            {(itemType === 'Historic Figure' || itemType === 'Historic Organization') && (
                                <div className="md:col-span-2">
                                    <label htmlFor="source_institution" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Source Institution / Media Acknowledgement</label>
                                    <input type="text" name="source_institution" id="source_institution" placeholder="e.g. Courtesy of the National Archives" className="w-full bg-cream/30 border border-tan-light/50 px-4 py-2.5 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all text-sm" />
                                </div>
                            )}
                        </div>

                        {itemType !== 'Historic Figure' && (
                            <div ref={figureRef}>
                                <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-3 underline underline-offset-4 decoration-tan/30">
                                    {(itemType as string) === 'Oral History' ? 'Connect Narrator (Historic Figure) *' : 'Connect Historic Figures'}
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 text-charcoal/30" size={18} />
                                    <input
                                        type="text"
                                        placeholder={(itemType as string) === 'Oral History' ? "Search narrator in the archive..." : "Search people in the archive..."}
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
                        )}
                        {(itemType as string) !== 'Oral History' && (
                            <div ref={docRef} className={itemType !== 'Historic Figure' ? "pt-8 border-t border-tan-light/30" : ""}>
                                <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-3 underline underline-offset-4 decoration-tan/30">Link To Documents & Artifacts</label>
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
                        <div className="pt-8 border-t border-tan-light/30" ref={orgRef}>
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
                </div>

                {/* Section 3: Extended Metadata Accordion */}
                <div className="px-8 pb-8">
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
                </div>

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

            </form>
            )}
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

interface OralHistoryAddFormProps {
    isSubmitting: boolean;
    handleSubmit: (e: React.FormEvent) => Promise<void>;
    uploadProgress: number | null;
    selectedFiles: File[];
    setSelectedFiles: React.Dispatch<React.SetStateAction<File[]>>;
    fileObjectURLs: Map<File, string>;
    setFileObjectURLs: React.Dispatch<React.SetStateAction<Map<File, string>>>;
    featuredImageIndex: number;
    setFeaturedImageIndex: React.Dispatch<React.SetStateAction<number>>;
    accessionFiles: File[];
    setAccessionFiles: React.Dispatch<React.SetStateAction<File[]>>;
    additionalMediaFiles: File[];
    setAdditionalMediaFiles: React.Dispatch<React.SetStateAction<File[]>>;
    selectedRelatedFigures: any[];
    setSelectedRelatedFigures: React.Dispatch<React.SetStateAction<any[]>>;
    allFigures: any[];
    figureSearch: string;
    setFigureSearch: (s: string) => void;
    showFigureResults: boolean;
    setShowFigureResults: (b: boolean) => void;
}

export function OralHistoryAddForm({
    isSubmitting,
    handleSubmit,
    uploadProgress,
    selectedFiles,
    setSelectedFiles,
    fileObjectURLs,
    setFileObjectURLs,
    featuredImageIndex: _featuredImageIndex,
    setFeaturedImageIndex,
    accessionFiles,
    setAccessionFiles,
    additionalMediaFiles,
    setAdditionalMediaFiles,
    selectedRelatedFigures,
    setSelectedRelatedFigures,
    allFigures,
    figureSearch,
    setFigureSearch,
    showFigureResults,
    setShowFigureResults
}: OralHistoryAddFormProps) {
    const [transcriptLines, setTranscriptLines] = useState<{ id: string; timestamp: string; speaker: string; text: string }[]>([]);
    const [audioPlayerTime, setAudioPlayerTime] = useState(0);
    const [audioPlayerDuration, setAudioPlayerDuration] = useState(0);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
    const [showImportArea, setShowImportArea] = useState(false);
    const [importText, setImportText] = useState("");

    const handleImportTranscript = () => {
        const parsed = parseTranscriptString(importText);
        if (parsed.length > 0) {
            setTranscriptLines(prev => [...prev, ...parsed]);
            setImportText("");
            setShowImportArea(false);
        } else {
            alert("Could not parse any lines. Make sure they format like '[MM:SS] Speaker Name: Dialogue Text' or 'Speaker Name: Dialogue Text'.");
        }
    };

    const formAudioRef = useRef<HTMLAudioElement | null>(null);
    const figureRef = useRef<HTMLDivElement | null>(null);

    const filteredFigures = useMemo(() => {
        if (!figureSearch.trim()) return [];
        const searchLower = figureSearch.toLowerCase();
        return allFigures.filter(f => 
            f.title.toLowerCase().includes(searchLower) &&
            !selectedRelatedFigures.find(sf => sf.id === f.id)
        );
    }, [allFigures, figureSearch, selectedRelatedFigures]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (figureRef.current && !figureRef.current.contains(event.target as Node)) {
                setShowFigureResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setShowFigureResults]);

    const serializedTranscript = useMemo(() => {
        return transcriptLines
            .map(line => `[${line.timestamp}] ${line.speaker}: ${line.text}`)
            .join('\n');
    }, [transcriptLines]);

    useEffect(() => {
        return () => {
            if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
        };
    }, [audioBlobUrl]);

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
    }, [audioBlobUrl]);

    const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const url = URL.createObjectURL(file);
        
        setFileObjectURLs(prev => {
            const next = new Map(prev);
            next.set(file, url);
            return next;
        });
        
        setSelectedFiles([file]);
        setFeaturedImageIndex(0);
    };

    const handleRemoveCover = () => {
        if (selectedFiles.length > 0) {
            const file = selectedFiles[0];
            const url = fileObjectURLs.get(file);
            if (url) {
                URL.revokeObjectURL(url);
                setFileObjectURLs(prev => {
                    const next = new Map(prev);
                    next.delete(file);
                    return next;
                });
            }
        }
        setSelectedFiles([]);
        setFeaturedImageIndex(0);
    };

    const handlePaperworkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setAccessionFiles(prev => [...prev, ...files]);
    };

    const handleRemoveNewPaperwork = (idx: number) => {
        setAccessionFiles(prev => prev.filter((_, i) => i !== idx));
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
            prevSpeaker = selectedRelatedFigures[0].title || 'Narrator';
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

    const audioSource = audioBlobUrl || "";
    const coverImageSource = selectedFiles.length > 0 ? fileObjectURLs.get(selectedFiles[0]) : null;
    const narratorName = selectedRelatedFigures.length > 0 ? selectedRelatedFigures[0].title : 'Narrator';

    return (
        <form id="add-item-form" onSubmit={handleSubmit} className="flex flex-col gap-10">
            {/* Hidden serialization fields inside form */}
            <textarea 
                name="transcription" 
                value={serializedTranscript} 
                readOnly 
                className="hidden" 
            />
            <textarea 
                name="transcript" 
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
                
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
                                                        setSelectedRelatedFigures([{ id: fig.id, title: fig.title }]);
                                                        setFigureSearch('');
                                                        setShowFigureResults(false);
                                                    }}
                                                    className="w-full text-left px-4 py-3 hover:bg-cream border-b border-tan-light/20 last:border-0 flex items-center justify-between group text-sm font-sans"
                                                >
                                                    <span className="font-medium text-charcoal">{fig.title}</span>
                                                    <Plus size={14} className="text-tan opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </button>
                                            ))
                                        ) : (
                                            <div className="px-4 py-3 text-xs text-charcoal/40 italic font-sans">No figures found.</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {selectedRelatedFigures.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-4">
                                    {selectedRelatedFigures.map(fig => (
                                        <div key={fig.id} className="flex items-center gap-2 bg-tan text-white px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider animate-in zoom-in duration-200">
                                            <span>Narrator: {fig.title}</span>
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
                                        className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-red-700 transition-all font-sans"
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
                                <p className="text-[10px] text-charcoal/40 max-w-[180px] font-sans">Portrait image of the narrator or historical figure (.jpg, .png)</p>
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
                            <div className="bg-cream/15 border border-tan-light/30 rounded-xl p-4 space-y-4 font-sans">
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
                                    <div className="flex-1 space-y-1 font-mono">
                                        <div className="flex justify-between text-[10px] text-charcoal/50">
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
                                <p className="text-[10px] text-charcoal/40 max-w-[180px] font-sans">Select digital audio interview recording (.mp3, .wav)</p>
                            </div>
                        )}

                        {/* YouTube URL field */}
                        <div>
                            <label htmlFor="youtube_video_id" className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">YouTube Video URL / ID (Optional)</label>
                            <input 
                                type="text" 
                                name="youtube_video_id" 
                                id="youtube_video_id" 
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

                    <div className="bg-amber-50 border border-amber-200/50 p-4 rounded-xl flex gap-3 text-amber-800 font-sans">
                        <AlertCircle className="shrink-0 mt-0.5" size={18} />
                        <div className="space-y-1 text-xs">
                            <p className="font-bold">⚠️ Private Curator-Only Access</p>
                            <p className="leading-relaxed text-amber-800/80">Consent forms, legal deeds of gift, and private paperwork are hidden from public website for resident confidentiality.</p>
                        </div>
                    </div>

                    {/* Paperwork preview and uploads */}
                    <div className="space-y-4 font-sans">
                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider">Release & Consent Papers</label>
                        
                        {accessionFiles.length > 0 && (
                            <div className="space-y-2">
                                {/* Newly added ones */}
                                {accessionFiles.map((file, idx) => (
                                    <div key={'new-' + idx} className="flex items-center justify-between bg-tan-light/10 border border-tan-light/30 px-3.5 py-2.5 rounded-xl text-xs font-medium text-charcoal animate-in slide-in-from-top-2 duration-200">
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
                                defaultValue="Senoia Area Historical Society" 
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
                                defaultValue="Senoia Area Historical Society" 
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
                                defaultValue="Copyright Senoia Area Historical Society. All rights reserved." 
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
                        <p className="text-xs text-charcoal/50 font-sans">Edit dialogue lines, synchronize timestamps live with audio, and sort chronologically.</p>
                    </div>

                    <div className="flex flex-wrap gap-2.5 shrink-0 font-sans">
                        <button
                            type="button"
                            onClick={() => addDialogueRow()}
                            className="bg-tan hover:bg-charcoal text-white text-xs px-4 py-2.5 rounded-lg font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md"
                        >
                            <Plus size={14} /> Add Line
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowImportArea(!showImportArea)}
                            className="border border-tan-light/80 hover:bg-cream text-tan text-xs px-4 py-2.5 rounded-lg font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
                            title="Paste and bulk-import an existing transcript text"
                        >
                            <FileText size={14} /> Import Bulk Text
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

                {showImportArea && (
                    <div className="p-8 bg-cream/10 border-b border-tan-light/20 space-y-4 animate-in slide-in-from-top-4 duration-300 font-sans">
                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider">Paste Text Transcript</label>
                        <p className="text-[10px] text-charcoal/40 font-sans">Format lines as <strong>[MM:SS] Speaker Name: Dialogue Text</strong> or <strong>Speaker Name: Dialogue Text</strong>. Each dialogue line must be on a new line.</p>
                        <textarea
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            placeholder="e.g.&#10;[00:05] Interviewer: Hello, thanks for joining us today.&#10;[00:10] Mildred Sibley: It is my pleasure to be here."
                            className="w-full min-h-[120px] bg-white border border-tan-light/50 px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-tan/20 text-xs font-mono leading-relaxed"
                        />
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleImportTranscript}
                                className="bg-tan hover:bg-charcoal text-white text-xs px-4 py-2 rounded-lg font-black uppercase tracking-wider transition-all"
                            >
                                Parse & Append
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowImportArea(false); setImportText(""); }}
                                className="border border-tan-light text-charcoal/60 text-xs px-4 py-2 rounded-lg font-black uppercase tracking-wider transition-all hover:bg-white"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {audioSource ? (
                    <div className="p-4 bg-charcoal/5 border-b border-tan-light/10 flex flex-col sm:flex-row items-center gap-4 font-sans">
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
                    <div className="p-4 bg-amber-50/50 border-b border-amber-100 flex items-center gap-2.5 text-amber-800 text-xs font-medium font-sans">
                        <AlertCircle size={16} className="text-amber-600" />
                        <span>⚠️ Sync clock and play features will be enabled once you upload an audio interview file above.</span>
                    </div>
                )}

                <div className="max-h-[500px] overflow-y-auto">
                    {transcriptLines.length > 0 ? (
                        <div className="w-full overflow-x-auto">
                            <table className="w-full min-w-[700px] border-collapse text-left font-sans text-sm">
                                <thead>
                                    <tr className="bg-cream/15 border-b border-tan-light/25 text-[10px] font-black text-tan uppercase tracking-widest font-sans">
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
                                            <tr className="border-b border-tan-light/10 hover:bg-cream/5 transition-colors group/row font-sans">
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
                                                        className="w-full bg-cream/10 border border-tan-light/40 px-3 py-1.5 rounded text-xs text-charcoal focus:bg-white focus:ring-1 focus:ring-tan outline-none transition-all resize-none leading-relaxed h-[34px] min-h-[34px] overflow-hidden font-sans"
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
                        <div className="py-16 text-center space-y-3 font-serif">
                            <Clock size={40} className="text-tan/30 mx-auto" />
                            <p className="text-charcoal/40 italic text-lg">No transcript lines added yet.</p>
                            <button
                                type="button"
                                onClick={() => addDialogueRow()}
                                className="border border-tan hover:bg-tan hover:text-white text-tan text-xs px-4 py-2 rounded-lg font-black uppercase tracking-wider transition-all font-sans"
                            >
                                Start Dialogue Timeline
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom action progress and submit button */}
            <div className="p-8 bg-cream border-t border-tan-light/50 flex flex-col sm:flex-row items-center justify-between gap-6 bg-white rounded-2xl border shadow-xl">
                <div className="flex-1 w-full font-sans">
                    {uploadProgress !== null && (
                        <div className="w-full max-w-sm font-sans">
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
                    className="bg-charcoal text-cream px-12 py-4 rounded-xl font-black uppercase tracking-widest hover:bg-tan hover:text-white transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl min-w-[260px] font-sans"
                >
                    {isSubmitting ? (
                        <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-cream/30 border-t-cream rounded-full animate-spin" />
                            <span>Adding to Archive...</span>
                        </div>
                    ) : 'Add Oral History to Archive'}
                </button>
            </div>
        </form>
    );
}
