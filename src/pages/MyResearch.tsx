import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc, setDoc, query, where, documentId } from 'firebase/firestore';
import { FolderOpen, Plus, Trash2, Edit3, X, ArrowRight, Sparkles, BookOpen, Pin } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard';
import type { ArchiveItem } from '../types/database';

interface ResearchFolder {
    id: string;
    name: string;
    createdAt: string;
    itemIds: string[];
}

export function MyResearch() {
    const { user, hasResearchAccess } = useAuth();
    
    const [folders, setFolders] = useState<ResearchFolder[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFolder, setSelectedFolder] = useState<ResearchFolder | null>(null);
    const [folderItems, setFolderItems] = useState<ArchiveItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    
    // Create / Rename States
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [renamingFolder, setRenamingFolder] = useState<ResearchFolder | null>(null);
    const [renameValue, setRenameValue] = useState('');
    
    // Toast Notification
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Sticky Notes Workspace States
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [activeNoteItemId, setActiveNoteItemId] = useState<string | null>(null);
    const [activeNoteContent, setActiveNoteContent] = useState('');
    const [activeNoteTitle, setActiveNoteTitle] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);

    // Fetch notes on mount / auth change
    const fetchNotes = async () => {
        if (!user || !user.email || !hasResearchAccess) return;
        const email = user.email.toLowerCase();
        try {
            const notesCol = collection(db, 'members', email, 'research_notes');
            const snap = await getDocs(notesCol);
            const notesMap: Record<string, string> = {};
            snap.docs.forEach(doc => {
                notesMap[doc.id] = doc.data().content || '';
            });
            setNotes(notesMap);
        } catch (err) {
            console.error("Error fetching research notes:", err);
        }
    };

    useEffect(() => {
        fetchNotes();
    }, [user, hasResearchAccess]);

    const handleSaveNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !hasResearchAccess || !activeNoteItemId) return;
        const email = user.email.toLowerCase();
        setIsSavingNote(true);

        try {
            const noteRef = doc(db, 'members', email, 'research_notes', activeNoteItemId);
            await setDoc(noteRef, {
                itemId: activeNoteItemId,
                content: activeNoteContent,
                lastUpdated: new Date().toISOString()
            });

            // Update in-memory notes map
            setNotes(prev => ({ ...prev, [activeNoteItemId]: activeNoteContent }));
            showToast("Saved private research note!");
            setActiveNoteItemId(null);
        } catch (err) {
            console.error("Error saving note:", err);
            showToast("Failed to save note.");
        } finally {
            setIsSavingNote(false);
        }
    };

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // 1. Fetch member research folders
    const fetchFolders = async () => {
        if (!user || !user.email || !hasResearchAccess) {
            setLoading(false);
            return;
        }
        const email = user.email.toLowerCase();
        setLoading(true);
        try {
            const foldersCol = collection(db, 'members', email, 'research_folders');
            const snap = await getDocs(foldersCol);
            const folderList = snap.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || 'Unnamed Folder',
                createdAt: doc.data().createdAt || new Date().toISOString(),
                itemIds: doc.data().itemIds || []
            })) as ResearchFolder[];
            
            // Sort by creation date descending
            folderList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setFolders(folderList);

            // Keep selected folder sync'd if it exists
            if (selectedFolder) {
                const refreshedSelected = folderList.find(f => f.id === selectedFolder.id);
                if (refreshedSelected) {
                    setSelectedFolder(refreshedSelected);
                } else {
                    setSelectedFolder(null);
                }
            }
        } catch (err) {
            console.error("Error loading research workspace:", err);
            showToast("Failed to load research folders.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFolders();
    }, [user, hasResearchAccess]);

    // 2. Fetch specific items when folder selection changes
    useEffect(() => {
        const fetchFolderItems = async () => {
            if (!selectedFolder || selectedFolder.itemIds.length === 0) {
                setFolderItems([]);
                return;
            }
            
            setLoadingItems(true);
            try {
                // Fetch in chunks of 30 due to Firestore "in" limits
                const itemIds = selectedFolder.itemIds;
                const itemsCol = collection(db, 'archive_items');
                
                // If there are more than 30, slice it
                const slicedIds = itemIds.slice(0, 30);
                const q = query(itemsCol, where(documentId(), 'in', slicedIds));
                const snap = await getDocs(q);
                
                const itemsList = snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArchiveItem[];
                
                setFolderItems(itemsList);
            } catch (err) {
                console.error("Error loading folder contents:", err);
                showToast("Failed to load historical items.");
            } finally {
                setLoadingItems(false);
            }
        };

        fetchFolderItems();
    }, [selectedFolder]);

    // 3. Create a new folder
    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !newFolderName.trim()) return;
        const email = user.email.toLowerCase();

        try {
            const foldersCol = collection(db, 'members', email, 'research_folders');
            const newDocRef = doc(foldersCol);
            
            const newFolder = {
                name: newFolderName.trim(),
                createdAt: new Date().toISOString(),
                itemIds: []
            };

            await setDoc(newDocRef, newFolder);
            
            showToast(`Created folder "${newFolderName}"`);
            setNewFolderName('');
            setIsCreateOpen(false);
            fetchFolders();
        } catch (err) {
            console.error("Error creating folder:", err);
            showToast("Failed to create folder.");
        }
    };

    // 4. Rename an existing folder
    const handleRenameFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !renamingFolder || !renameValue.trim()) return;
        const email = user.email.toLowerCase();

        try {
            const folderRef = doc(db, 'members', email, 'research_folders', renamingFolder.id);
            await updateDoc(folderRef, { name: renameValue.trim() });
            
            showToast("Folder renamed successfully!");
            setRenamingFolder(null);
            setRenameValue('');
            fetchFolders();
        } catch (err) {
            console.error("Error renaming folder:", err);
            showToast("Failed to rename folder.");
        }
    };

    // 5. Delete a folder
    const handleDeleteFolder = async (folderId: string, folderName: string) => {
        if (!user || !user.email || !window.confirm(`Are you sure you want to delete the folder "${folderName}"? Bookmarked history items will remain in the main archive.`)) return;
        const email = user.email.toLowerCase();

        try {
            const folderRef = doc(db, 'members', email, 'research_folders', folderId);
            await deleteDoc(folderRef);
            
            showToast(`Deleted folder "${folderName}"`);
            if (selectedFolder?.id === folderId) {
                setSelectedFolder(null);
            }
            fetchFolders();
        } catch (err) {
            console.error("Error deleting folder:", err);
            showToast("Failed to delete folder.");
        }
    };

    return (
        <div className="flex flex-col min-h-screen animate-in fade-in duration-500 pb-16">
            
            {/* Header Area */}
            <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-tan-light/30 pb-6">
                <div>
                    <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal flex items-center gap-3">
                        My Research Workspace
                        <Sparkles size={24} className="text-tan animate-pulse" />
                    </h1>
                    <p className="text-charcoal/60 font-sans mt-2 max-w-xl leading-relaxed">
                        Welcome to your private research portal. Here you can curate specific historical items, documents, and figures into organized folders for your personal studies.
                    </p>
                </div>
                
                <button
                    onClick={() => setIsCreateOpen(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-tan to-tan-dark text-white rounded-xl font-bold hover:from-charcoal hover:to-charcoal transition-all shadow-md active:scale-95 whitespace-nowrap"
                >
                    <Plus size={20} /> Create Research Folder
                </button>
            </div>

            {/* Folders Overview Grid */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-10 h-10 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                    <p className="font-serif text-charcoal/60 italic">Loading your research...</p>
                </div>
            ) : folders.length === 0 ? (
                <div className="text-center py-20 bg-white/40 border border-dashed border-tan/30 rounded-2xl p-8 max-w-2xl mx-auto flex flex-col items-center gap-4 shadow-sm">
                    <span className="text-5xl">📁</span>
                    <h3 className="text-2xl font-serif font-bold text-charcoal mt-2">No Research Folders Yet</h3>
                    <p className="text-charcoal/60 font-sans leading-relaxed text-sm">
                        Start your historical collection by creating your first research folder. Once created, you can save historic items or documents directly to them while browsing the archive!
                    </p>
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="mt-2 text-sm font-bold text-tan hover:text-tan-dark flex items-center gap-1.5 uppercase tracking-wider transition-colors"
                    >
                        Create your first folder now <ArrowRight size={14} />
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
                    {folders.map(folder => {
                        const isSelected = selectedFolder?.id === folder.id;
                        return (
                            <div
                                key={folder.id}
                                onClick={() => setSelectedFolder(isSelected ? null : folder)}
                                className={`group relative p-6 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between min-h-[160px] shadow-sm ${
                                    isSelected
                                        ? 'bg-tan/10 border-tan shadow-md ring-1 ring-tan'
                                        : 'bg-white hover:bg-tan-light/10 border-tan-light/40 hover:border-tan/40 hover:-translate-y-1'
                                }`}
                            >
                                <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setRenamingFolder(folder);
                                            setRenameValue(folder.name);
                                        }}
                                        className="p-1.5 bg-white/95 hover:bg-tan/20 rounded-full border border-tan-light/50 text-charcoal/70 hover:text-tan transition-colors"
                                        title="Rename Folder"
                                    >
                                        <Edit3 size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteFolder(folder.id, folder.name);
                                        }}
                                        className="p-1.5 bg-white/95 hover:bg-red-500/20 rounded-full border border-tan-light/50 text-charcoal/70 hover:text-red-600 transition-colors"
                                        title="Delete Folder"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>

                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-3xl transition-transform group-hover:scale-110 duration-300">
                                            {isSelected ? '📂' : '📁'}
                                        </span>
                                        <div>
                                            <h3 className="font-serif font-bold text-lg text-charcoal leading-tight line-clamp-1">
                                                {folder.name}
                                            </h3>
                                            <p className="text-[10px] text-charcoal/40 font-mono tracking-wider mt-0.5">
                                                Created {new Date(folder.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between border-t border-tan-light/20 pt-4 mt-6">
                                    <span className="text-xs font-semibold text-charcoal-light font-sans">
                                        {folder.itemIds.length} Bookmarked Items
                                    </span>
                                    <span className="text-xs font-bold text-tan group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                        {isSelected ? 'Close' : 'View Folder'} <ArrowRight size={12} />
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Folder Contents Display */}
            {selectedFolder && (
                <div className="mt-8 border-t border-tan-light/40 pt-10 animate-in slide-in-from-bottom-6 duration-500">
                    <div className="flex justify-between items-center mb-8 border-b border-tan-light/20 pb-4">
                        <div className="flex items-center gap-3">
                            <FolderOpen size={28} className="text-tan" />
                            <h2 className="text-2xl md:text-3xl font-serif font-bold text-charcoal">
                                {selectedFolder.name}
                            </h2>
                            <span className="bg-tan/10 text-tan text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest font-sans">
                                {selectedFolder.itemIds.length} Items Saved
                            </span>
                        </div>
                        <button
                            onClick={() => setSelectedFolder(null)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-tan-light text-charcoal-light hover:bg-black/5 hover:text-charcoal transition-all text-xs font-bold font-sans uppercase tracking-wider"
                        >
                            <X size={14} /> Close Preview
                        </button>
                    </div>

                    {loadingItems ? (
                        <div className="py-20 text-center font-serif text-charcoal/60 italic flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                            Loading folder items...
                        </div>
                    ) : folderItems.length === 0 ? (
                        <div className="text-center py-16 bg-cream/40 rounded-2xl border border-tan-light/20 max-w-xl mx-auto flex flex-col items-center gap-4">
                            <BookOpen size={40} className="text-tan/50" />
                            <h4 className="font-serif font-bold text-lg text-charcoal">Empty Research Folder</h4>
                            <p className="text-charcoal/60 font-sans text-xs max-w-xs mx-auto leading-relaxed">
                                You haven't bookmarked any items in this folder yet. Browse the archive and click "Save to Research" on any document, figure, or organization page to save them here!
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {folderItems.map(item => {
                                const note = notes[item.id || ''];
                                return (
                                    <div key={item.id} className="flex flex-col gap-3 group relative bg-white/20 p-2.5 rounded-2xl border border-tan-light/10 hover:border-tan-light/30 transition-all hover:shadow-sm">
                                        <DocumentCard
                                            item={item}
                                            galleryIds={folderItems.map(i => i.id || '')}
                                        />
                                        
                                        {/* Tactile Mini Note Trigger */}
                                        <button
                                            onClick={() => {
                                                setActiveNoteItemId(item.id || '');
                                                setActiveNoteContent(note || '');
                                                setActiveNoteTitle(item.title || '');
                                            }}
                                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all text-xs font-semibold font-sans leading-none ${
                                                note 
                                                    ? 'bg-[#fefcbf] border-yellow-300 text-[#854d0e] hover:shadow-sm shadow-xs' 
                                                    : 'bg-white hover:bg-tan-light/10 border-tan-light/40 text-charcoal/60 hover:text-tan hover:border-tan/40'
                                            }`}
                                        >
                                            <span className="flex items-center gap-1.5 truncate">
                                                <span>📝</span>
                                                <span className="truncate max-w-[140px] md:max-w-[180px] font-sans">
                                                    {note ? `Note: "${note}"` : 'Add Research Note...'}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-[10px] font-black text-tan uppercase tracking-wider ml-1 hover:underline">
                                                {note ? 'Edit' : 'Write'}
                                            </span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Create Folder Modal */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <form
                        onSubmit={handleCreateFolder}
                        className="bg-cream border border-tan/30 w-full max-w-md rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 animate-in zoom-in duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center border-b border-tan/20 pb-4">
                            <div className="flex items-center gap-2">
                                <Plus size={20} className="text-tan" />
                                <h3 className="font-serif font-bold text-xl text-charcoal">New Research Folder</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsCreateOpen(false)}
                                className="p-2 hover:bg-black/5 rounded-full text-charcoal/60 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-tan uppercase tracking-[0.2em] font-sans">Folder Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Early Senoia Settlers, Railroad Records"
                                value={newFolderName}
                                onChange={e => setNewFolderName(e.target.value)}
                                className="w-full bg-white border border-tan-light/50 p-3 rounded-xl text-sm outline-none focus:border-tan font-sans"
                                required
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-3 justify-end border-t border-tan/20 pt-6">
                            <button
                                type="button"
                                onClick={() => setIsCreateOpen(false)}
                                className="px-4 py-2 text-sm font-bold text-charcoal/50 hover:text-charcoal transition-colors font-sans"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-charcoal hover:bg-tan text-white font-bold rounded-xl text-sm transition-all shadow-md font-sans"
                            >
                                Create Folder
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Rename Folder Modal */}
            {renamingFolder && (
                <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <form
                        onSubmit={handleRenameFolder}
                        className="bg-cream border border-tan/30 w-full max-w-md rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 animate-in zoom-in duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center border-b border-tan/20 pb-4">
                            <div className="flex items-center gap-2">
                                <Edit3 size={20} className="text-tan" />
                                <h3 className="font-serif font-bold text-xl text-charcoal">Rename Folder</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRenamingFolder(null)}
                                className="p-2 hover:bg-black/5 rounded-full text-charcoal/60 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-tan uppercase tracking-[0.2em] font-sans">New Folder Name</label>
                            <input
                                type="text"
                                placeholder="Rename folder..."
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                className="w-full bg-white border border-tan-light/50 p-3 rounded-xl text-sm outline-none focus:border-tan font-sans"
                                required
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-3 justify-end border-t border-tan/20 pt-6">
                            <button
                                type="button"
                                onClick={() => setRenamingFolder(null)}
                                className="px-4 py-2 text-sm font-bold text-charcoal/50 hover:text-charcoal transition-colors font-sans"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-charcoal hover:bg-tan text-white font-bold rounded-xl text-sm transition-all shadow-md font-sans"
                            >
                                Rename
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Private Research Note Editor Modal */}
            {activeNoteItemId && (
                <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <form
                        onSubmit={handleSaveNote}
                        className="w-full max-w-md relative animate-in zoom-in duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Tactile pushpin */}
                        <div className="absolute top-[-16px] left-1/2 -translate-x-1/2 z-20 text-red-500 drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] animate-bounce duration-1000">
                            <Pin size={32} strokeWidth={2.5} fill="currentColor" className="rotate-45" />
                        </div>

                        {/* Yellow Post-It Canvas */}
                        <div className="bg-[#fefbbf] border-t border-yellow-200/60 rounded-xl shadow-2xl p-6 pt-10 flex flex-col gap-5 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/15 before:to-black/5 before:pointer-events-none">
                            {/* Paper texture grid pattern */}
                            <div className="absolute inset-0 bg-[radial-gradient(#eab308_1px,transparent_1px)] [background-size:18px_18px] opacity-[0.09] pointer-events-none" />

                            <div className="flex justify-between items-center border-b border-yellow-300/50 pb-2.5 z-10">
                                <div className="flex flex-col gap-0.5">
                                    <h4 className="font-serif font-black text-xs text-[#854d0e] tracking-widest uppercase">
                                        Private Research Note
                                    </h4>
                                    <p className="text-[10px] text-charcoal/50 font-sans font-bold max-w-[240px] truncate">
                                        For: {activeNoteTitle}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveNoteItemId(null)}
                                    className="p-1.5 hover:bg-yellow-600/10 rounded-full text-[#854d0e]/60 transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <textarea
                                value={activeNoteContent}
                                onChange={(e) => setActiveNoteContent(e.target.value)}
                                placeholder="Write genealogical details, research leads, private queries, or transcripts about this historical document..."
                                maxLength={1000}
                                rows={6}
                                className="w-full bg-transparent resize-none border-none outline-none font-handwriting text-2xl text-[#713f12] placeholder-[#a16207]/45 leading-relaxed font-normal no-scrollbar z-10"
                                style={{ fontFamily: "'Caveat', cursive, sans-serif" }}
                                autoFocus
                            />

                            <div className="flex justify-between items-center text-[10px] font-sans font-bold text-[#a16207]/60 border-t border-yellow-300/40 pt-3 z-10">
                                <span>🔒 Private to your account</span>
                                <span>{activeNoteContent.length} / 1000 chars</span>
                            </div>

                            <div className="flex gap-2 justify-end z-10 mt-1">
                                <button
                                    type="button"
                                    onClick={() => setActiveNoteItemId(null)}
                                    className="px-4 py-2 text-xs font-bold text-[#713f12]/60 hover:text-[#713f12] transition-colors font-sans"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingNote}
                                    className="px-5 py-2.5 bg-gradient-to-r from-tan to-tan-dark text-cream hover:from-charcoal hover:to-charcoal font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 font-sans"
                                >
                                    {isSavingNote ? 'Saving...' : 'Save Private Note'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* Toast Message Notification */}
            {toastMessage && (
                <div className="fixed bottom-8 right-8 z-[2500] bg-charcoal text-cream border border-tan/30 px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300 font-serif font-semibold text-[15px]">
                    <span className="text-xl">✨</span>
                    <span>{toastMessage}</span>
                </div>
            )}
        </div>
    );
}

export default MyResearch;
