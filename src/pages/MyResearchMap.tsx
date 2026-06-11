import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, or, documentId } from 'firebase/firestore';
import { Sparkles, AlertCircle } from 'lucide-react';
import type { ArchiveItem } from '../types/database';
import { FolderMapView } from '../components/FolderMapView';

export function MyResearchMap() {
    const { user, hasResearchAccess } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<ArchiveItem[]>([]);

    useEffect(() => {
        const loadAllResearchItems = async () => {
            if (!user || !user.email || !hasResearchAccess) {
                setLoading(false);
                return;
            }
            
            const email = user.email.toLowerCase();
            setLoading(true);
            setError(null);
            
            try {
                // 1. Fetch all folders owned by or shared with the user
                const foldersCol = collection(db, 'research_folders');
                const foldersQuery = query(
                    foldersCol,
                    or(
                        where('ownerEmail', '==', email),
                        where('sharedWith', 'array-contains', email)
                    )
                );
                
                const foldersSnap = await getDocs(foldersQuery);
                
                // 2. Extract and de-duplicate all item IDs across all folders
                const allItemIds = new Set<string>();
                foldersSnap.docs.forEach(docSnap => {
                    const itemIds = docSnap.data().itemIds || [];
                    itemIds.forEach((id: string) => {
                        if (id) allItemIds.add(id);
                    });
                });
                
                const uniqueIds = Array.from(allItemIds);
                
                if (uniqueIds.length === 0) {
                    setItems([]);
                    setLoading(false);
                    return;
                }
                
                // 3. Load item documents in chunks of 30 (Firestore 'in' query limit)
                const itemsCol = collection(db, 'archive_items');
                const chunks: string[][] = [];
                for (let i = 0; i < uniqueIds.length; i += 30) {
                    chunks.push(uniqueIds.slice(i, i + 30));
                }
                
                const fetchPromises = chunks.map(chunk => {
                    const q = query(itemsCol, where(documentId(), 'in', chunk));
                    return getDocs(q);
                });
                
                const snapshots = await Promise.all(fetchPromises);
                const loadedItems: ArchiveItem[] = [];
                snapshots.forEach(snap => {
                    snap.docs.forEach(docSnap => {
                        loadedItems.push({
                            id: docSnap.id,
                            ...docSnap.data()
                        } as ArchiveItem);
                    });
                });
                
                setItems(loadedItems);
            } catch (err: any) {
                console.error("Error loading research items:", err);
                setError(err?.message || "Failed to load research item coordinates.");
            } finally {
                setLoading(false);
            }
        };

        loadAllResearchItems();
    }, [user, hasResearchAccess]);

    return (
        <div className="flex flex-col min-h-screen animate-in fade-in duration-500 pb-16">
            
            {/* Header Area */}
            <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-tan-light/30 pb-6 shrink-0">
                <div>
                    <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal flex items-center gap-3">
                        My Research Map
                        <Sparkles size={24} className="text-tan animate-pulse" />
                    </h1>
                    <p className="text-charcoal/60 font-sans mt-2 max-w-xl leading-relaxed">
                        A personalized geographic map compiling every bookmarked landmark, cemetery, figure, and historic building across all of your research projects.
                    </p>
                </div>
            </div>

            {/* Main Content Pane */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 flex-1">
                    <div className="w-10 h-10 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                    <p className="font-serif text-charcoal/60 italic">Mapping your research...</p>
                </div>
            ) : error ? (
                <div className="text-center py-20 bg-red-500/5 border border-dashed border-red-500/20 rounded-2xl p-8 max-w-2xl mx-auto flex flex-col items-center gap-4 shadow-xs">
                    <AlertCircle className="text-red-500" size={40} />
                    <h3 className="text-xl font-serif font-bold text-charcoal">Failed to Load Map Workspace</h3>
                    <p className="text-charcoal/60 font-sans leading-relaxed text-sm">
                        {error}
                    </p>
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-20 bg-white/40 border border-dashed border-tan/30 rounded-2xl p-8 max-w-2xl mx-auto flex flex-col items-center gap-4 shadow-sm flex-1">
                    <span className="text-5xl">🗺️</span>
                    <h3 className="text-2xl font-serif font-bold text-charcoal mt-2">Your Map is Empty</h3>
                    <p className="text-charcoal/60 font-sans leading-relaxed text-sm">
                        Bookmark some historical artifacts, figures, or organizations with address or location coordinates to your research folders, and they will automatically populate here!
                    </p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col">
                    <FolderMapView items={items} />
                </div>
            )}
        </div>
    );
}
