import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, limit, getDocs, or } from 'firebase/firestore';
import { FolderOpen } from 'lucide-react';
import type { ArchiveItem } from '../types/database';

interface Props {
    collectionId: string;
    fallbackImage?: string | null;
    items?: ArchiveItem[];
    className?: string;
}

export function CollectionGridImage({ collectionId, fallbackImage, items: prefetchedItems, className = '' }: Props) {
    const [images, setImages] = useState<string[]>([]);
    const [loading, setLoading] = useState(!prefetchedItems);

    useEffect(() => {
        if (prefetchedItems) {
            const urls = prefetchedItems
                .map(item => item.featured_image_url || item.file_urls?.[0])
                .filter(Boolean) as string[];
            setImages(urls.slice(0, 4));
            return;
        }

        const fetchImages = async () => {
            try {
                let q;
                if (collectionId === 'pending-acquisitions') {
                    q = query(
                        collection(db, 'archive_items'),
                        where('item_type', '==', 'Artifact'),
                        where('collection_status', '==', 'pending'),
                        limit(20)
                    );
                } else if (collectionId === 'deaccessioned-artifacts') {
                    q = query(
                        collection(db, 'archive_items'),
                        where('item_type', '==', 'Artifact'),
                        where('collection_status', '==', 'deaccessioned'),
                        limit(20)
                    );
                } else if (collectionId === 'on-loan') {
                    q = query(
                        collection(db, 'archive_items'),
                        where('item_type', '==', 'Artifact'),
                        where('collection_status', '==', 'loan'),
                        limit(20)
                    );
                } else {
                    q = query(
                        collection(db, 'archive_items'),
                        or(where('collection_id', '==', collectionId), where('collection_ids', 'array-contains', collectionId)),
                        limit(20)
                    );
                }
                const snapshot = await getDocs(q);
                const urls = snapshot.docs
                    .map(doc => {
                        const data = doc.data();
                        return data.featured_image_url || data.file_urls?.[0];
                    })
                    .filter(Boolean) as string[];
                
                setImages(urls.slice(0, 4));
            } catch (error) {
                console.error("Error fetching preview images:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchImages();
    }, [collectionId, prefetchedItems]);

    const containerStyle = `absolute inset-0 w-full h-full overflow-hidden bg-tan-light/10 ${className}`;

    if (loading) {
        return (
            <div className={`${containerStyle} flex items-center justify-center text-tan-light`}>
                <div className="w-8 h-8 rounded-full border-2 border-tan/30 border-t-tan animate-spin" />
            </div>
        );
    }

    if (images.length === 0) {
        if (fallbackImage) {
            return (
                <img src={fallbackImage} alt="Collection Cover" className={`${containerStyle} object-cover`} />
            );
        }
        return (
            <div className={`${containerStyle} flex items-center justify-center text-tan-light opacity-50`}>
                <FolderOpen size={48} className="opacity-40" />
            </div>
        );
    }

    if (images.length === 1) {
        return <img src={images[0]} alt="Preview" className={`${containerStyle} object-cover`} />
    }
    
    if (images.length === 2) {
        return (
            <div className={`${containerStyle} grid grid-cols-2 gap-1 bg-white/20 p-0.5`}>
                <img src={images[0]} alt="Preview 1" className="w-full h-full object-cover rounded-[2px]" />
                <img src={images[1]} alt="Preview 2" className="w-full h-full object-cover rounded-[2px]" />
            </div>
        );
    }

    if (images.length === 3) {
        return (
            <div className={`${containerStyle} grid grid-cols-2 grid-rows-2 gap-1 bg-white/20 p-0.5`}>
                <img src={images[0]} alt="Preview 1" className="w-full h-full object-cover col-span-2 row-span-1 rounded-[2px]" />
                <img src={images[1]} alt="Preview 2" className="w-full h-full object-cover rounded-[2px]" />
                <img src={images[2]} alt="Preview 3" className="w-full h-full object-cover rounded-[2px]" />
            </div>
        );
    }

    return (
        <div className={`${containerStyle} grid grid-cols-2 grid-rows-2 gap-1 bg-white/20 p-0.5`}>
            <img src={images[0]} alt="Preview 1" className="w-full h-full object-cover rounded-[2px]" />
            <img src={images[1]} alt="Preview 2" className="w-full h-full object-cover rounded-[2px]" />
            <img src={images[2]} alt="Preview 3" className="w-full h-full object-cover rounded-[2px]" />
            <img src={images[3]} alt="Preview 4" className="w-full h-full object-cover rounded-[2px]" />
        </div>
    );
}
