import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, defaultDb } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc, setDoc, query, where, documentId, or, addDoc, getDoc } from 'firebase/firestore';
import { FolderOpen, Plus, Trash2, Edit3, X, ArrowRight, Sparkles, BookOpen, Pin, Users, LayoutGrid, Map } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard';
import type { ArchiveItem } from '../types/database';
import { FolderMapView } from '../components/FolderMapView';

interface ResearchFolder {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    itemIds: string[];
    ownerEmail: string;
    sharedWith: string[];
}

export function MyResearch() {
    const { user, hasResearchAccess, isSAHSUser } = useAuth();
    
    const [folders, setFolders] = useState<ResearchFolder[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFolder, setSelectedFolder] = useState<ResearchFolder | null>(null);
    const [folderItems, setFolderItems] = useState<ArchiveItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
    
    // Reset viewMode when selected folder changes
    useEffect(() => {
        if (!selectedFolder) {
            setViewMode('grid');
        }
    }, [selectedFolder]);
    
    // Create / Rename States
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderDescription, setNewFolderDescription] = useState('');
    const [renamingFolder, setRenamingFolder] = useState<ResearchFolder | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameDescriptionValue, setRenameDescriptionValue] = useState('');
    
    // Sharing States
    const [sharingFolder, setSharingFolder] = useState<ResearchFolder | null>(null);
    const [shareEmail, setShareEmail] = useState('');
    const [isSharing, setIsSharing] = useState(false);
    
    // Toast Notification
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Add Items Search Modal States
    const [isAddItemsOpen, setIsAddItemsOpen] = useState(false);
    const [allItems, setAllItems] = useState<ArchiveItem[]>([]);
    const [loadingAllItems, setLoadingAllItems] = useState(false);
    const [addItemKeyword, setAddItemKeyword] = useState('');

    // Notes Workspace States
    interface ResearchNote {
        id: string;
        itemId: string;
        folderId: string;
        ownerEmail: string;
        content: string;
        isPrivate: boolean;
        lastUpdated: string;
    }
    const [notes, setNotes] = useState<Record<string, ResearchNote[]>>({});
    const [activeNoteItemId, setActiveNoteItemId] = useState<string | null>(null);
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [activeNoteContent, setActiveNoteContent] = useState('');
    const [activeNoteTitle, setActiveNoteTitle] = useState('');
    const [activeNoteIsPrivate, setActiveNoteIsPrivate] = useState(true);
    const [isSavingNote, setIsSavingNote] = useState(false);

    // Fetch folder-specific notes and collaborators' shared notes
    const fetchFolderNotes = async (folderId: string) => {
        if (!user || !user.email || !hasResearchAccess) return;
        const email = user.email.toLowerCase();
        try {
            const notesCol = collection(db, 'research_notes');
            const q = query(notesCol, where('folderId', '==', folderId));
            const snap = await getDocs(q);
            
            const notesMap: Record<string, ResearchNote[]> = {};
            snap.docs.forEach(docSnap => {
                const data = docSnap.data();
                const noteOwner = (data.ownerEmail || '').toLowerCase();
                const itemId = data.itemId;
                const isNotePrivate = data.isPrivate !== false;
                
                if (noteOwner === email || !isNotePrivate) {
                    if (!notesMap[itemId]) {
                        notesMap[itemId] = [];
                    }
                    notesMap[itemId].push({
                        id: docSnap.id,
                        itemId,
                        folderId,
                        ownerEmail: data.ownerEmail || '',
                        content: data.content || '',
                        isPrivate: isNotePrivate,
                        lastUpdated: data.lastUpdated || new Date().toISOString()
                    });
                }
            });
            
            // Sort notes by lastUpdated ascending (timeline view)
            Object.keys(notesMap).forEach(itemId => {
                notesMap[itemId].sort((a, b) => new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime());
            });
            
            setNotes(notesMap);
        } catch (err) {
            console.error("Error fetching folder notes:", err);
        }
    };

    const handleSaveNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !hasResearchAccess || !activeNoteItemId || !selectedFolder) return;
        const email = user.email.toLowerCase();
        setIsSavingNote(true);

        try {
            if (activeNoteId) {
                // Update existing note
                const noteRef = doc(db, 'research_notes', activeNoteId);
                await updateDoc(noteRef, {
                    content: activeNoteContent,
                    isPrivate: activeNoteIsPrivate,
                    lastUpdated: new Date().toISOString()
                });
                showToast(activeNoteIsPrivate ? "Updated private note!" : "Updated shared note!");
            } else {
                // Create new note
                const notesCol = collection(db, 'research_notes');
                await addDoc(notesCol, {
                    itemId: activeNoteItemId,
                    folderId: selectedFolder.id,
                    ownerEmail: email,
                    content: activeNoteContent,
                    isPrivate: activeNoteIsPrivate,
                    lastUpdated: new Date().toISOString()
                });
                showToast(activeNoteIsPrivate ? "Added private research note!" : "Added note (shared with collaborators)!");
            }
            
            setActiveNoteItemId(null);
            setActiveNoteId(null);
            fetchFolderNotes(selectedFolder.id);
        } catch (err) {
            console.error("Error saving note:", err);
            showToast("Failed to save note.");
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        if (!window.confirm("Are you sure you want to delete this research note?")) return;
        try {
            const noteRef = doc(db, 'research_notes', noteId);
            await deleteDoc(noteRef);
            showToast("Deleted research note.");
            if (selectedFolder) {
                fetchFolderNotes(selectedFolder.id);
            }
        } catch (err) {
            console.error("Error deleting note:", err);
            showToast("Failed to delete note.");
        }
    };

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // 1. Fetch member research folders from root collection
    const fetchFolders = async () => {
        if (!user || !user.email || !hasResearchAccess) {
            setLoading(false);
            return;
        }
        const email = user.email.toLowerCase();
        setLoading(true);
        try {
            const foldersCol = collection(db, 'research_folders');
            const q = query(
                foldersCol,
                or(
                    where('ownerEmail', '==', email),
                    where('sharedWith', 'array-contains', email)
                )
            );
            const snap = await getDocs(q);
            const folderList = snap.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || 'Unnamed Folder',
                createdAt: doc.data().createdAt || new Date().toISOString(),
                itemIds: doc.data().itemIds || [],
                ownerEmail: doc.data().ownerEmail || '',
                sharedWith: doc.data().sharedWith || []
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
        } catch (err: any) {
            console.error("Error loading research workspace:", err);
            showToast(`Failed to load research folders: ${err?.message || err}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFolders();
    }, [user, hasResearchAccess]);

    // Fetch notes when folder selection changes
    useEffect(() => {
        if (selectedFolder) {
            fetchFolderNotes(selectedFolder.id);
        } else {
            setNotes({});
        }
    }, [selectedFolder, user]);

    // 2. Fetch specific items when folder selection changes
    useEffect(() => {
        const fetchFolderItems = async () => {
            if (!selectedFolder || selectedFolder.itemIds.length === 0) {
                setFolderItems([]);
                return;
            }
            
            setLoadingItems(true);
            try {
                const itemIds = selectedFolder.itemIds;
                const itemsCol = collection(db, 'archive_items');
                
                const slicedIds = itemIds.slice(0, 30);
                const q = query(itemsCol, where(documentId(), 'in', slicedIds));
                const snap = await getDocs(q);
                
                const itemsList = snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArchiveItem[];
                
                setFolderItems(itemsList);
            } catch (err: any) {
                console.error("Error loading folder contents:", err);
                showToast(`Failed to load historical items: ${err?.message || err}`);
            } finally {
                setLoadingItems(false);
            }
        };

        fetchFolderItems();
    }, [selectedFolder]);

    // Fetch all items from archive directory for in-context search
    const fetchAllItems = async () => {
        if (allItems.length > 0 || !hasResearchAccess) return;
        setLoadingAllItems(true);
        try {
            const q = query(collection(db, 'archive_items'));
            const snap = await getDocs(q);
            const itemsList = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ArchiveItem[];
            
            const filtered = isSAHSUser ? itemsList : itemsList.filter(i => !i.is_private);
            setAllItems(filtered);
        } catch (err) {
            console.error("Error fetching all archive items:", err);
            showToast("Failed to load archive items.");
        } finally {
            setLoadingAllItems(false);
        }
    };

    useEffect(() => {
        if (isAddItemsOpen) {
            fetchAllItems();
        }
    }, [isAddItemsOpen]);

    const searchedAddItems = useMemo(() => {
        if (!addItemKeyword.trim()) return allItems.slice(0, 10);
        const kw = addItemKeyword.toLowerCase();
        return allItems.filter(item => 
            item.title?.toLowerCase().includes(kw) ||
            item.description?.toLowerCase().includes(kw) ||
            item.artifact_id?.toString().toLowerCase().includes(kw)
        );
    }, [allItems, addItemKeyword]);

    const handleToggleFolderItem = async (itemId: string) => {
        if (!selectedFolder) return;
        
        const isCurrentlyInFolder = selectedFolder.itemIds.includes(itemId);
        const updatedItemIds = isCurrentlyInFolder 
            ? selectedFolder.itemIds.filter(id => id !== itemId)
            : [...selectedFolder.itemIds, itemId];
            
        try {
            const folderRef = doc(db, 'research_folders', selectedFolder.id);
            await updateDoc(folderRef, { itemIds: updatedItemIds });
            
            // Sync local folder state
            setSelectedFolder(prev => prev ? { ...prev, itemIds: updatedItemIds } : null);
            showToast(isCurrentlyInFolder ? "Removed item from folder" : "Added item to folder!");
            fetchFolders();
        } catch (err) {
            console.error("Error updating folder items:", err);
            showToast("Failed to update folder items.");
        }
    };

    // 3. Create a new folder in root collection
    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !newFolderName.trim()) return;
        const email = user.email.toLowerCase();

        try {
            const foldersCol = collection(db, 'research_folders');
            const newDocRef = doc(foldersCol);
            
            const newFolder = {
                name: newFolderName.trim(),
                description: newFolderDescription.trim(),
                createdAt: new Date().toISOString(),
                itemIds: [],
                ownerEmail: email,
                sharedWith: []
            };

            await setDoc(newDocRef, newFolder);
            
            showToast(`Created folder "${newFolderName}"`);
            setNewFolderName('');
            setNewFolderDescription('');
            setIsCreateOpen(false);
            fetchFolders();
        } catch (err) {
            console.error("Error creating folder:", err);
            showToast("Failed to create folder.");
        }
    };

    // 4. Rename/Update an existing folder in root collection
    const handleRenameFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !renamingFolder || !renameValue.trim()) return;

        try {
            const folderRef = doc(db, 'research_folders', renamingFolder.id);
            await updateDoc(folderRef, { 
                name: renameValue.trim(),
                description: renameDescriptionValue.trim()
            });
            
            showToast("Folder updated successfully!");
            setRenamingFolder(null);
            setRenameValue('');
            setRenameDescriptionValue('');
            fetchFolders();
        } catch (err) {
            console.error("Error updating folder:", err);
            showToast("Failed to update folder.");
        }
    };

    // 5. Delete a folder from root collection (Owner only)
    const handleDeleteFolder = async (folderId: string, folderName: string, ownerEmail: string) => {
        if (!user || !user.email) return;
        const email = user.email.toLowerCase();

        if (ownerEmail !== email && !isSAHSUser) {
            showToast("Only the owner of the folder can delete it.");
            return;
        }

        if (!window.confirm(`Are you sure you want to delete the folder "${folderName}"? Bookmarked history items will remain in the main archive.`)) return;

        try {
            const folderRef = doc(db, 'research_folders', folderId);
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

    // 6. Share Folder Handler
    const handleShareFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !sharingFolder || !shareEmail.trim()) return;
        const emailToShare = shareEmail.trim().toLowerCase();

        if (emailToShare === user.email.toLowerCase()) {
            showToast("You are already the owner of this folder.");
            return;
        }

        if (sharingFolder.sharedWith.includes(emailToShare)) {
            showToast("This folder is already shared with that user.");
            return;
        }

        setIsSharing(true);
        try {
            // Verify if the recipient email has research access (is staff or registered member)
            const isStaffDomain = emailToShare.endsWith('@senoiahistory.com');
            let isAuthorized = isStaffDomain;

            if (!isAuthorized) {
                try {
                    const roleDoc = await getDoc(doc(db, 'user_roles', emailToShare));
                    if (roleDoc.exists() && ['admin', 'curator'].includes(roleDoc.data().role)) {
                        isAuthorized = true;
                    }
                } catch (err) {
                    console.warn("Could not check user_roles:", err);
                }
            }

            if (!isAuthorized) {
                try {
                    const memberDoc = await getDoc(doc(db, 'members', emailToShare));
                    if (memberDoc.exists()) {
                        isAuthorized = true;
                    }
                } catch (err) {
                    console.warn("Could not check members:", err);
                }
            }

            if (!isAuthorized) {
                showToast("Failed to share: This email is not a registered member or staff curator.");
                setIsSharing(false);
                return;
            }

            const folderRef = doc(db, 'research_folders', sharingFolder.id);
            const newSharedWith = [...sharingFolder.sharedWith, emailToShare];
            await updateDoc(folderRef, { sharedWith: newSharedWith });
            
            // Trigger collaborative email notification
            await addDoc(collection(defaultDb, 'mail'), {
                to: emailToShare,
                from: "Senoia Area Historical Society <noreply@senoiahistory.com>",
                ownerEmail: user.email.toLowerCase(),
                message: {
                    subject: `SAHS Archives: Collaborative Folder Shared!`,
                    text: `${user.email} has shared the research folder "${sharingFolder.name}"${sharingFolder.description ? ` (${sharingFolder.description})` : ''} with you. Visit your SAHS Archives Research Workspace to collaborate!`,
                    html: `
                        <div style="font-family: sans-serif; padding: 24px; max-width: 600px; margin: auto; background-color: #faf7f2; border: 1px solid #e1d8c7; border-radius: 8px;">
                            <h2 style="color: #2b2b2b; font-family: serif; border-bottom: 1px solid #e1d8c7; padding-bottom: 12px; margin-top: 0;">SAHS Research Workspace</h2>
                            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                                <strong>${user.email}</strong> has shared a collaborative research folder with you:
                            </p>
                            <div style="background-color: #ffffff; padding: 16px; border-left: 4px solid #c8b89c; border-radius: 4px; margin: 20px 0;">
                                <h3 style="margin: 0; color: #2b2b2b; font-family: serif;">📁 ${sharingFolder.name}</h3>
                                ${sharingFolder.description ? `
                                <p style="margin: 8px 0 0 0; color: #666666; font-size: 13px; font-style: italic; line-height: 1.4; border-top: 1px solid #f0f0f0; padding-top: 8px;">
                                    ${sharingFolder.description}
                                </p>
                                ` : ''}
                            </div>
                            <p style="color: #4a4a4a; font-size: 14px; line-height: 1.6;">
                                You can now actively view, add historical archive documents/photographs, and share collaborative notes inside this folder.
                            </p>
                            <a href="https://senoiahistory.com/research" style="display: inline-block; background-color: #2b2b2b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 16px;">
                                Open Workspace
                            </a>
                            <hr style="border: 0; border-top: 1px solid #e1d8c7; margin: 24px 0;" />
                            <p style="font-size: 11px; color: #8c8c8c; margin-bottom: 0;">
                                Sent automatically by the Senoia Area Historical Society Archives platform.
                            </p>
                        </div>
                    `
                }
            });
            
            // Sync local state
            setSharingFolder(prev => prev ? { ...prev, sharedWith: newSharedWith } : null);
            setShareEmail('');
            showToast(`Shared folder with ${emailToShare} and sent invitation email!`);
            fetchFolders();
        } catch (err) {
            console.error("Error sharing folder:", err);
            showToast("Failed to share folder.");
        } finally {
            setIsSharing(false);
        }
    };

    // 7. Unshare User Handler
    const handleUnshareUser = async (emailToUnshare: string) => {
        if (!sharingFolder) return;
        
        setIsSharing(true);
        try {
            const folderRef = doc(db, 'research_folders', sharingFolder.id);
            const newSharedWith = sharingFolder.sharedWith.filter(e => e !== emailToUnshare);
            await updateDoc(folderRef, { sharedWith: newSharedWith });
            
            // Sync local state
            setSharingFolder(prev => prev ? { ...prev, sharedWith: newSharedWith } : null);
            showToast(`Removed access for ${emailToUnshare}`);
            fetchFolders();
        } catch (err) {
            console.error("Error removing collaborator:", err);
            showToast("Failed to remove collaborator.");
        } finally {
            setIsSharing(false);
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
                        Welcome to your collaborative research portal. Create folders, collaborate with other historical researchers, and share notes about historical figures and archives!
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
                        const isOwner = folder.ownerEmail === user?.email?.toLowerCase();
                        return (
                            <div
                                key={folder.id}
                                onClick={() => setSelectedFolder(isSelected ? null : folder)}
                                className={`group relative p-6 pt-8 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between min-h-[170px] shadow-sm ${
                                    isSelected
                                        ? 'bg-tan/10 border-tan shadow-md ring-1 ring-tan'
                                        : 'bg-white hover:bg-tan-light/10 border-tan-light/40 hover:border-tan/40 hover:-translate-y-1'
                                }`}
                            >
                                <div className="absolute top-2.5 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {isOwner && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSharingFolder(folder);
                                            }}
                                            className="p-1.5 bg-white/95 hover:bg-tan/20 rounded-full border border-tan-light/50 text-charcoal/70 hover:text-tan transition-colors"
                                            title="Share Folder"
                                        >
                                            <Users size={14} />
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setRenamingFolder(folder);
                                            setRenameValue(folder.name);
                                            setRenameDescriptionValue(folder.description || '');
                                        }}
                                        className="p-1.5 bg-white/95 hover:bg-tan/20 rounded-full border border-tan-light/50 text-charcoal/70 hover:text-tan transition-colors"
                                        title="Edit Folder Details"
                                    >
                                        <Edit3 size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteFolder(folder.id, folder.name, folder.ownerEmail);
                                        }}
                                        className="p-1.5 bg-white/95 hover:bg-red-500/20 rounded-full border border-tan-light/50 text-charcoal/70 hover:text-red-600 transition-colors"
                                        title="Delete Folder"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>

                                <div className="flex flex-col gap-4 mt-2">
                                    <div className="flex items-center gap-3">
                                        <span className="text-3xl transition-transform group-hover:scale-110 duration-300">
                                            {isSelected ? '📂' : '📁'}
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="font-serif font-bold text-lg text-charcoal leading-tight break-words">
                                                {folder.name}
                                            </h3>
                                            <div className="flex flex-col gap-0.5 mt-0.5">
                                                <p className="text-[10px] text-charcoal/40 font-mono tracking-wider">
                                                    Created {new Date(folder.createdAt).toLocaleDateString()}
                                                </p>
                                                {folder.description && (
                                                    <p className="text-xs text-charcoal/60 font-sans mt-1.5 line-clamp-2 leading-relaxed italic break-words">
                                                        {folder.description}
                                                    </p>
                                                )}
                                                {!isOwner ? (
                                                    <span 
                                                        className="text-[9px] font-bold text-tan-dark bg-tan/10 px-1.5 py-0.5 rounded max-w-full block truncate mt-1"
                                                        title={`Shared by: ${folder.ownerEmail}`}
                                                    >
                                                        Shared by: {folder.ownerEmail}
                                                    </span>
                                                ) : folder.sharedWith.length > 0 ? (
                                                    <span className="text-[9px] font-bold text-charcoal bg-charcoal/5 px-1.5 py-0.5 rounded w-fit mt-1 flex items-center gap-1">
                                                        <Users size={10} /> Collaborative ({folder.sharedWith.length})
                                                    </span>
                                                ) : null}
                                            </div>
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
                        <div className="flex items-center gap-3">
                            {/* Segment View Toggle */}
                            <div className="flex items-center bg-beige/50 border border-tan-light/40 p-1 rounded-xl shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('grid')}
                                    className={`flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold font-sans transition-all ${
                                        viewMode === 'grid'
                                            ? 'bg-white text-charcoal shadow-xs'
                                            : 'text-charcoal-light hover:text-charcoal'
                                    }`}
                                    title="Grid View"
                                >
                                    <LayoutGrid size={14} /> <span className="hidden sm:inline">Grid</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('map')}
                                    className={`flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold font-sans transition-all ${
                                        viewMode === 'map'
                                            ? 'bg-white text-charcoal shadow-xs'
                                            : 'text-charcoal-light hover:text-charcoal'
                                    }`}
                                    title="Map View"
                                >
                                    <Map size={14} /> <span className="hidden sm:inline">Map</span>
                                </button>
                            </div>

                            <button
                                onClick={() => setIsAddItemsOpen(true)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-tan hover:bg-tan-dark text-cream shadow-sm transition-all text-xs font-bold font-sans uppercase tracking-wider active:scale-95 shrink-0"
                            >
                                <Plus size={14} /> Add Items
                            </button>
                            <button
                                onClick={() => setSelectedFolder(null)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-tan-light text-charcoal-light hover:bg-black/5 hover:text-charcoal transition-all text-xs font-bold font-sans uppercase tracking-wider shrink-0"
                            >
                                <X size={14} /> Close Preview
                            </button>
                        </div>
                    </div>

                    {selectedFolder.description && (
                        <p className="text-sm text-charcoal/70 font-sans italic mb-8 leading-relaxed max-w-3xl border-l-2 border-tan/30 pl-4 break-words">
                            {selectedFolder.description}
                        </p>
                    )}

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
                    ) : viewMode === 'map' ? (
                        <FolderMapView items={folderItems} folderId={selectedFolder.id} />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {folderItems.map(item => {
                                const itemNotes = notes[item.id || ''] || [];
                                return (
                                    <div key={item.id} className="flex flex-col gap-3 group relative bg-white/20 p-2.5 rounded-2xl border border-tan-light/10 hover:border-tan-light/30 transition-all hover:shadow-sm">
                                        <DocumentCard
                                            item={item}
                                            galleryIds={folderItems.map(i => i.id || '')}
                                            folderId={selectedFolder.id}
                                        />
                                        
                                        {/* Collaborative Research Notes Journal */}
                                        <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-tan-light/10">
                                            <h4 className="text-[10px] font-bold text-charcoal/40 uppercase tracking-widest px-1">Research Journal</h4>
                                            
                                            <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-0.5">
                                                {itemNotes.length === 0 ? (
                                                    <p className="text-[11px] text-charcoal/40 italic px-1 py-1">No notes recorded yet.</p>
                                                ) : (
                                                    itemNotes.map(note => {
                                                        const isMyNote = (note.ownerEmail || '').toLowerCase() === user?.email?.toLowerCase();
                                                        return (
                                                            <div 
                                                                key={note.id} 
                                                                className={`p-3 rounded-xl border flex flex-col gap-1.5 text-xs text-left relative ${
                                                                    note.isPrivate
                                                                        ? 'bg-[#fefcbf]/40 border-yellow-200/50 text-[#713f12]'
                                                                        : 'bg-tan/5 border-tan-light/30 text-charcoal/80'
                                                                }`}
                                                            >
                                                                <div className="flex justify-between items-center text-[9px] font-bold text-charcoal/40">
                                                                    <span className="flex items-center gap-1 font-sans">
                                                                        {note.isPrivate ? '🔒 Private' : '👥 Shared'}
                                                                        <span>•</span>
                                                                        <span>{note.ownerEmail.split('@')[0]}</span>
                                                                    </span>
                                                                    <div className="flex items-center gap-1">
                                                                        {isMyNote && (
                                                                            <>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setActiveNoteItemId(item.id || '');
                                                                                        setActiveNoteId(note.id);
                                                                                        setActiveNoteContent(note.content);
                                                                                        setActiveNoteTitle(item.title || '');
                                                                                        setActiveNoteIsPrivate(note.isPrivate);
                                                                                    }}
                                                                                    className="text-tan hover:text-tan-dark font-black uppercase hover:underline"
                                                                                >
                                                                                    Edit
                                                                                </button>
                                                                                <span>•</span>
                                                                                <button
                                                                                    onClick={() => handleDeleteNote(note.id)}
                                                                                    className="text-red-500 hover:text-red-700 font-black uppercase hover:underline"
                                                                                >
                                                                                    Delete
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <p className="font-sans font-medium leading-relaxed italic break-words">
                                                                    "{note.content}"
                                                                </p>
                                                                <span className="text-[8px] text-charcoal/30 self-end font-mono">
                                                                    {new Date(note.lastUpdated).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setActiveNoteItemId(item.id || '');
                                                    setActiveNoteId(null);
                                                    setActiveNoteContent('');
                                                    setActiveNoteTitle(item.title || '');
                                                    setActiveNoteIsPrivate(true);
                                                }}
                                                className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-dashed border-tan-light/40 hover:border-tan/40 text-charcoal/50 hover:text-tan bg-white hover:bg-tan-light/10 text-xs font-semibold font-sans transition-all active:scale-98"
                                            >
                                                <Plus size={14} /> Add Note...
                                            </button>
                                        </div>
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

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-tan uppercase tracking-[0.2em] font-sans">Folder Description (Optional)</label>
                            <textarea
                                placeholder="Describe the focus or topic of this research folder..."
                                value={newFolderDescription}
                                onChange={e => setNewFolderDescription(e.target.value)}
                                className="w-full bg-white border border-tan-light/50 p-3 rounded-xl text-sm outline-none focus:border-tan font-sans resize-none"
                                rows={3}
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

            {/* Edit Folder Modal */}
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
                                <h3 className="font-serif font-bold text-xl text-charcoal">Edit Folder Details</h3>
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
                            <label className="text-[10px] font-black text-tan uppercase tracking-[0.2em] font-sans">Folder Name</label>
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

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-tan uppercase tracking-[0.2em] font-sans">Folder Description (Optional)</label>
                            <textarea
                                placeholder="Describe the focus or topic of this research folder..."
                                value={renameDescriptionValue}
                                onChange={e => setRenameDescriptionValue(e.target.value)}
                                className="w-full bg-white border border-tan-light/50 p-3 rounded-xl text-sm outline-none focus:border-tan font-sans resize-none"
                                rows={3}
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
                                Save Changes
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Sharing Folder Modal */}
            {sharingFolder && (
                <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div
                        className="bg-cream border border-tan/30 w-full max-w-md rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 animate-in zoom-in duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center border-b border-tan/20 pb-4">
                            <div className="flex items-center gap-2">
                                <Users size={20} className="text-tan" />
                                <h3 className="font-serif font-bold text-xl text-charcoal">Collaborate on "{sharingFolder.name}"</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSharingFolder(null)}
                                className="p-2 hover:bg-black/5 rounded-full text-charcoal/60 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Add Collaborator Form */}
                        <form onSubmit={handleShareFolder} className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-tan uppercase tracking-[0.2em] font-sans">Share with Researcher (Email)</label>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    placeholder="e.g. colleague@senoiahistory.com"
                                    value={shareEmail}
                                    onChange={e => setShareEmail(e.target.value)}
                                    className="w-full bg-white border border-tan-light/50 p-3 rounded-xl text-sm outline-none focus:border-tan font-sans"
                                    required
                                />
                                <button
                                    type="submit"
                                    disabled={isSharing}
                                    className="px-5 py-3 bg-charcoal hover:bg-tan text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-95 whitespace-nowrap font-sans disabled:opacity-50"
                                >
                                    Share
                                </button>
                            </div>
                        </form>

                        {/* Collaborators List */}
                        <div className="flex flex-col gap-3">
                            <label className="text-[10px] font-black text-tan uppercase tracking-[0.2em] font-sans">Active Collaborators</label>
                            {sharingFolder.sharedWith.length === 0 ? (
                                <p className="text-xs text-charcoal/50 italic font-sans">Not shared with anyone yet.</p>
                            ) : (
                                <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                                    {sharingFolder.sharedWith.map(email => (
                                        <div key={email} className="flex items-center justify-between p-2.5 bg-white border border-tan-light/20 rounded-xl">
                                            <span className="text-xs font-semibold text-charcoal font-sans">{email}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleUnshareUser(email)}
                                                className="p-1 hover:bg-red-50 text-red-500 rounded transition-colors text-xs font-bold font-sans uppercase tracking-wider"
                                                title="Remove Access"
                                                disabled={isSharing}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 justify-end border-t border-tan/20 pt-6 mt-2">
                            <button
                                type="button"
                                onClick={() => setSharingFolder(null)}
                                className="px-6 py-2 bg-charcoal hover:bg-tan text-white font-bold rounded-xl text-sm transition-all shadow-md font-sans"
                            >
                                Done
                            </button>
                        </div>
                    </div>
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
                                        Research Note
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

                            {/* Share note option */}
                            <div className="flex items-center gap-2.5 z-10 px-1 py-2 border-t border-b border-yellow-300/30">
                                <input
                                    type="checkbox"
                                    id="share-note-checkbox"
                                    checked={!activeNoteIsPrivate}
                                    onChange={(e) => setActiveNoteIsPrivate(!e.target.checked)}
                                    className="rounded border-yellow-400 text-tan focus:ring-tan w-4 h-4 cursor-pointer"
                                />
                                <label 
                                    htmlFor="share-note-checkbox" 
                                    className="text-xs font-bold text-[#713f12] cursor-pointer select-none font-sans flex items-center gap-1.5"
                                >
                                    👥 Share note with folder collaborators
                                </label>
                            </div>

                            <div className="flex justify-between items-center text-[10px] font-sans font-bold text-[#a16207]/60 pt-1 z-10">
                                <span>{activeNoteIsPrivate ? '🔒 Private to your account' : '👥 Visible to collaborators'}</span>
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
                                    {isSavingNote ? 'Saving...' : 'Save Note'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* Add Items Modal */}
            {isAddItemsOpen && selectedFolder && (
                <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div
                        className="bg-cream border border-tan/30 w-full max-w-xl rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 animate-in zoom-in duration-300 max-h-[85vh] overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center border-b border-tan/20 pb-4 shrink-0">
                            <div className="flex items-center gap-2">
                                <Plus size={20} className="text-tan" />
                                <h3 className="font-serif font-bold text-xl text-charcoal">Add Items to "{selectedFolder.name}"</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAddItemsOpen(false);
                                    setAddItemKeyword('');
                                }}
                                className="p-2 hover:bg-black/5 rounded-full text-charcoal/60 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="flex flex-col gap-2 shrink-0">
                            <label className="text-[10px] font-black text-tan uppercase tracking-[0.2em] font-sans">Search Archive Items</label>
                            <input
                                type="text"
                                placeholder="Type item title, ID, or description..."
                                value={addItemKeyword}
                                onChange={e => setAddItemKeyword(e.target.value)}
                                className="w-full bg-white border border-tan-light/50 p-3 rounded-xl text-sm outline-none focus:border-tan font-sans font-medium"
                                autoFocus
                            />
                        </div>

                        {/* Search Results List */}
                        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-[250px]">
                            {loadingAllItems ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3 flex-1">
                                    <div className="w-8 h-8 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                                    <p className="font-serif text-charcoal/60 italic text-sm">Loading archive directory...</p>
                                </div>
                            ) : searchedAddItems.length === 0 ? (
                                <div className="text-center py-12 text-charcoal/50 italic font-sans flex-1">
                                    No archive items found matching "{addItemKeyword}".
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2.5">
                                    {searchedAddItems.map(item => {
                                        const isInFolder = selectedFolder.itemIds.includes(item.id || '');
                                        return (
                                            <div key={item.id} className="flex items-center justify-between p-3 bg-white border border-tan-light/20 rounded-xl hover:shadow-xs transition-shadow">
                                                <div className="flex items-center gap-3 min-w-0 pr-4">
                                                    {item.featured_image_url || (item.file_urls && item.file_urls.length > 0) ? (
                                                        <img 
                                                            src={item.featured_image_url || item.file_urls[0]} 
                                                            alt={item.title} 
                                                            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-tan-light/20"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-lg bg-charcoal/5 text-tan flex items-center justify-center text-xs font-serif shrink-0 border border-tan-light/20">
                                                            {item.title.charAt(0)}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <h4 className="text-sm font-bold text-charcoal truncate leading-snug">{item.title}</h4>
                                                        <p className="text-[10px] text-charcoal/50 font-sans tracking-wide mt-0.5 uppercase font-medium">
                                                            ID: {item.artifact_id || 'N/A'} • {item.artifact_type || item.item_type}
                                                        </p>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleFolderItem(item.id || '')}
                                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-sans transition-all active:scale-95 ${
                                                        isInFolder
                                                            ? 'bg-tan/10 text-tan hover:bg-red-500/10 hover:text-red-600'
                                                            : 'bg-charcoal text-white hover:bg-tan'
                                                    }`}
                                                >
                                                    {isInFolder ? '✓ Added' : '+ Add'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 justify-end border-t border-tan/20 pt-6 mt-auto shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAddItemsOpen(false);
                                    setAddItemKeyword('');
                                }}
                                className="px-6 py-2 bg-charcoal hover:bg-tan text-white font-bold rounded-xl text-sm transition-all shadow-md font-sans"
                            >
                                Done
                            </button>
                        </div>
                    </div>
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
