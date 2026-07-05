import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy, updateDoc, doc } from 'firebase/firestore';
import type { ArchiveItem, Collection, ItemType } from '../types/database';
import { 
    ShieldAlert, 
    Image as ImageIcon, 
    Calendar, 
    MapPin, 
    ChevronRight, 
    CheckCircle2, 
    Activity,
    ArrowRight,
    Search,
    ClipboardList,
    AlertCircle,
    Info,
    ArrowUpDown,
    LayoutGrid,
    Tag,
    FolderOpen,
    RotateCw
} from 'lucide-react';
import { Link } from 'react-router-dom';

type AuditIssue = 'no-image' | 'no-date' | 'no-id' | 'no-desc' | 'no-location';
type SortOption = 'health-asc' | 'health-desc' | 'newest';

interface AuditStats {
    totalItems: number;
    averageScore: number;
    missingImages: number;
    missingDates: number;
    missingIds: number;
    missingLocations: number;
    criticalGaps: number;
}

export function AuditDashboard() {
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Filters and Sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [activeIssue, setActiveIssue] = useState<AuditIssue | 'all'>('all');
    const [selectedType, setSelectedType] = useState<ItemType | 'All Types'>('All Types');
    const [selectedCollection, setSelectedCollection] = useState<string>('All Collections');
    const [sortBy, setSortBy] = useState<SortOption>('health-asc');

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Items
                const q = query(collection(db, 'archive_items'), orderBy('created_at', 'desc'));
                const querySnapshot = await getDocs(q);
                const itemsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArchiveItem[];
                setItems(itemsData);

                // Fetch Collections
                const collectionsSnapshot = await getDocs(collection(db, 'collections'));
                const collectionsData = collectionsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Collection[];
                setCollections(collectionsData);

            } catch (error) {
                console.error("Error fetching audit data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const calculateItemScore = (item: ArchiveItem) => {
        let score = 0;
        
        const rawType = item.item_type || '';
        const type = typeof rawType === 'string' ? rawType.trim().toLowerCase() : '';
        
        // 1. Title/Identity (Support type-specific names)
        const hasTitle = item.title || item.full_name || item.org_name;
        if (hasTitle && item.description && item.description.length > 20) score += 20;
        
        // 2. Visual Representation
        if (item.featured_image_url || (item.file_urls && item.file_urls.length > 0)) {
            score += 20;
        } else if (type === 'historic organization') {
            score += 10; // Organizations get partial credit without photos
        }

        // 3. Temporal Data (Support type-specific dates)
        const hasDate = item.date || item.founding_date || item.birth_date;
        if (hasDate) score += 20;

        // 4. Inventory/Artifact ID (Support Archive Reference for Documents)
        if (item.artifact_id || (type === 'document' && item.archive_reference) || type === 'historic figure') {
            score += 20; 
        }

        // 5. Physical Museum Location (The "Shelf" assignment)
        const hasLocation = !!(item.museum_location_id || (item.museum_location_ids && item.museum_location_ids.length > 0));
        if (hasLocation || type === 'historic figure' || type === 'historic organization') {
            score += 20;
        }

        return Math.min(score, 100);
    };

    const auditData = useMemo(() => {
        const stats: AuditStats = {
            totalItems: items.length,
            averageScore: 0,
            missingImages: 0,
            missingDates: 0,
            missingIds: 0,
            missingLocations: 0,
            criticalGaps: 0
        };

        if (items.length === 0) return { stats, processedItems: [] };

        let totalScore = 0;
        const processedItems = items.map(item => {
            const score = calculateItemScore(item);
            totalScore += score;

            const issues: AuditIssue[] = [];
            
            // Normalize type for robust checks
            const rawType = item.item_type || '';
            const type = typeof rawType === 'string' ? rawType.trim().toLowerCase() : '';
            
            const hasImage = !!(item.featured_image_url || (item.file_urls && item.file_urls.length > 0));
            if (!hasImage && type !== 'historic organization') { 
                issues.push('no-image');
                stats.missingImages++;
            }
            
            const hasTemporal = !!(item.date || item.founding_date || item.birth_date);
            if (!hasTemporal && type !== 'historic figure' && type !== 'historic organization') {
                issues.push('no-date');
                stats.missingDates++;
            }
            
            const hasId = !!(item.artifact_id || (type === 'document' && item.archive_reference));
            if (!hasId && (type === 'artifact' || type === 'document')) {
                issues.push('no-id');
                stats.missingIds++;
            }

            const hasLocation = !!(item.museum_location_id || (item.museum_location_ids && item.museum_location_ids.length > 0));
            if (!hasLocation && type === 'artifact') {
                issues.push('no-location');
                stats.missingLocations++;
            }
            
            if (!item.description || item.description.trim().length < 10) {
                issues.push('no-desc');
            }

            if (score <= 40) stats.criticalGaps++;

            return { ...item, auditScore: score, auditIssues: issues };
        });

        stats.averageScore = Math.round(totalScore / items.length);
        return { stats, processedItems };
    }, [items]);

    const filteredItems = useMemo(() => {
        const filtered = auditData.processedItems.filter(item => {
            const matchesSearch = 
                item.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                item.artifact_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.org_name?.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesIssue = activeIssue === 'all' || item.auditIssues.includes(activeIssue);
            const rawType = item.item_type || '';
            const normalizedItemType = typeof rawType === 'string' ? rawType.trim().toLowerCase() : '';
            const normalizedSelectedType = selectedType.trim().toLowerCase();
            const matchesType = selectedType === 'All Types' || normalizedItemType === normalizedSelectedType;
            const matchesCollection = selectedCollection === 'All Collections' || 
                item.collection_id === selectedCollection || 
                item.collection_ids?.includes(selectedCollection);
            
            return matchesSearch && matchesIssue && matchesType && matchesCollection;
        });

        // Sort
        return filtered.sort((a, b) => {
            if (sortBy === 'health-asc') return a.auditScore! - b.auditScore!;
            if (sortBy === 'health-desc') return b.auditScore! - a.auditScore!;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }, [auditData.processedItems, searchTerm, activeIssue, selectedType, selectedCollection, sortBy]);

    const [isSyncing, setIsSyncing] = useState(false);

    const runRetroactiveSync = async () => {
        if (!confirm("Run retroactive two-way sync? This will process the entire database.")) return;
        setIsSyncing(true);
        try {
            const allItemsRef = collection(db, 'archive_items');
            const snap = await getDocs(query(allItemsRef));
            const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ArchiveItem[];

            const updates = new Map<string, any>(); // Map of id -> updates
            
            // Build the graph
            for (const item of allItems) {
                const id = item.id;
                const type = item.item_type?.trim();
                
                const processArray = (arr: string[] | undefined, targetField: string) => {
                    if (!arr) return;
                    for (const targetId of arr) {
                        if (!updates.has(targetId)) updates.set(targetId, {});
                        const currentUpdates = updates.get(targetId);
                        if (!currentUpdates[targetField]) currentUpdates[targetField] = [];
                        if (!currentUpdates[targetField].includes(id)) {
                            currentUpdates[targetField].push(id);
                        }
                    }
                };

                // If I am an Org, my related_documents should point back to me via related_organizations
                if (type === 'Historic Organization') {
                    processArray(item.related_documents, 'related_organizations');
                } else if (type === 'Historic Figure') {
                    processArray(item.related_documents, 'related_figures');
                } else {
                    processArray(item.related_documents, 'related_documents');
                    processArray(item.related_organizations, 'related_documents');
                    processArray(item.related_figures, 'related_documents');
                }
            }

            // Also do address cascade
            for (const item of allItems) {
                const type = item.item_type?.trim();
                if (type !== 'Historic Organization' && type !== 'Historic Figure' && !item.historical_address) {
                    let newAddress = null;
                    let newCoords = null;
                    
                    // Check its related orgs
                    const myOrgs = item.related_organizations || [];
                    const updatedOrgs = updates.get(item.id)?.related_organizations || [];
                    const allLinkedOrgs = Array.from(new Set([...myOrgs, ...updatedOrgs]));
                    
                    for (const orgId of allLinkedOrgs) {
                        const org = allItems.find(o => o.id === orgId);
                        if (org && org.historical_address) {
                            newAddress = org.historical_address;
                            newCoords = org.coordinates || null;
                            break;
                        }
                    }
                    
                    if (!newAddress) {
                        const myFigs = item.related_figures || [];
                        const updatedFigs = updates.get(item.id)?.related_figures || [];
                        const allLinkedFigs = Array.from(new Set([...myFigs, ...updatedFigs]));
                        
                        for (const figId of allLinkedFigs) {
                            const fig = allItems.find(o => o.id === figId);
                            if (fig && fig.historical_address) {
                                newAddress = fig.historical_address;
                                newCoords = fig.coordinates || null;
                                break;
                            }
                        }
                    }
                    
                    if (newAddress) {
                        if (!updates.has(item.id)) updates.set(item.id, {});
                        const currentUpdates = updates.get(item.id);
                        currentUpdates.historical_address = newAddress;
                        currentUpdates.coordinates = newCoords;
                    }
                }
            }

            let numUpdated = 0;
            // Execute updates
            for (const [docId, updateData] of updates.entries()) {
                const originalItem = allItems.find(i => i.id === docId);
                if (!originalItem) continue;
                
                const finalPayload: any = {};
                let changed = false;
                
                if (updateData.related_organizations) {
                    const existing = originalItem.related_organizations || [];
                    const merged = Array.from(new Set([...existing, ...updateData.related_organizations]));
                    if (merged.length !== existing.length) {
                        finalPayload.related_organizations = merged;
                        changed = true;
                    }
                }
                if (updateData.related_figures) {
                    const existing = originalItem.related_figures || [];
                    const merged = Array.from(new Set([...existing, ...updateData.related_figures]));
                    if (merged.length !== existing.length) {
                        finalPayload.related_figures = merged;
                        changed = true;
                    }
                }
                if (updateData.related_documents) {
                    const existing = originalItem.related_documents || [];
                    const merged = Array.from(new Set([...existing, ...updateData.related_documents]));
                    if (merged.length !== existing.length) {
                        finalPayload.related_documents = merged;
                        changed = true;
                    }
                }
                if (updateData.historical_address) {
                    finalPayload.historical_address = updateData.historical_address;
                    finalPayload.coordinates = updateData.coordinates;
                    changed = true;
                }

                if (changed) {
                    await updateDoc(doc(db, 'archive_items', docId), finalPayload);
                    numUpdated++;
                }
            }
            
            alert(`Sync complete! Updated ${numUpdated} items.`);
            window.location.reload();
        } catch (error) {
            console.error("Sync error:", error);
            alert("Sync failed.");
        } finally {
            setIsSyncing(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto h-[60vh] flex flex-col items-center justify-center gap-6">
                <div className="w-16 h-16 border-4 border-tan/20 border-t-tan rounded-full animate-spin"></div>
                <div className="text-center">
                    <h2 className="text-2xl font-serif font-bold text-charcoal mb-2">Analyzing Archive Integrity</h2>
                    <p className="text-charcoal/50">Evaluating metadata completeness across all collections...</p>
                </div>
            </div>
        );
    }

    const { stats } = auditData;

    return (
        <div className="max-w-7xl mx-auto h-full flex flex-col gap-10 pb-12 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 border-b border-tan-light pb-10">
                <div className="flex-1">
                    <div className="flex items-center gap-3 text-tan mb-4 bg-tan/5 w-max px-5 py-2 rounded-full border border-tan/10">
                        <ShieldAlert size={20} />
                        <span className="text-[10px] font-black uppercase tracking-widest">System Integrity Audit</span>
                    </div>
                    <h1 className="text-6xl font-serif font-bold text-charcoal tracking-tight mb-4">Archive Health Dashboard</h1>
                    <p className="text-charcoal-light text-xl max-w-2xl leading-relaxed mb-6">System-wide audit for identification of metadata gaps, preservation issues, and data inconsistency.</p>
                    <button 
                        onClick={runRetroactiveSync} 
                        disabled={isSyncing}
                        className="flex items-center gap-2 bg-tan text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-charcoal transition-colors disabled:opacity-50"
                    >
                        <RotateCw size={16} className={isSyncing ? "animate-spin" : ""} />
                        {isSyncing ? "Running Global Sync..." : "Run Retroactive Two-Way Sync"}
                    </button>
                </div>
                
                <div className="bg-white p-7 rounded-[2rem] border border-tan-light shadow-xl shadow-tan/5 flex items-center gap-8 min-w-[320px]">
                    <div className="relative w-24 h-24">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-cream" />
                            <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="8" fill="transparent" 
                                strokeDasharray={2 * Math.PI * 44}
                                strokeDashoffset={2 * Math.PI * 44 * (1 - stats.averageScore / 100)}
                                className={stats.averageScore > 80 ? 'text-green-500' : stats.averageScore > 60 ? 'text-tan' : 'text-red-500'}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-black text-charcoal leading-none">{stats.averageScore}</span>
                            <span className="text-[10px] uppercase font-bold text-charcoal/30">Score</span>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal/40 mb-2">Diagnostic Result</h4>
                        <p className={`text-xl font-serif font-bold mb-1 ${stats.averageScore > 80 ? 'text-green-600' : 'text-tan'}`}>
                            {stats.averageScore > 80 ? 'Archival Grade A' : stats.averageScore > 60 ? 'Preservation Grade B' : 'Action Required'}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-charcoal/50 font-medium">
                            <CheckCircle2 size={12} className="text-green-500" />
                            <span>{stats.totalItems} Items Monitored</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Overview Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Unpictured Items', count: stats.missingImages, icon: <ImageIcon size={28} />, color: 'text-red-500', bg: 'bg-red-50', id: 'no-image' },
                    { label: 'Undated Records', count: stats.missingDates, icon: <Calendar size={28} />, color: 'text-amber-500', bg: 'bg-amber-50', id: 'no-date' },
                    { label: 'Inventory ID Gaps', count: stats.missingIds, icon: <Tag size={28} />, color: 'text-purple-500', bg: 'bg-purple-50', id: 'no-id' },
                    { label: 'Unplaced Artifacts', count: stats.missingLocations, icon: <MapPin size={28} />, color: 'text-rose-500', bg: 'bg-rose-50', id: 'no-location' }
                ].map((stat, i) => (
                    <button 
                        key={i}
                        onClick={() => setActiveIssue(activeIssue === stat.id ? 'all' : stat.id as any)}
                        className={`p-7 rounded-3xl border transition-all text-left flex flex-col justify-between group h-52 relative overflow-hidden ${activeIssue === stat.id ? 'bg-white border-tan shadow-xl ring-8 ring-tan/5' : 'bg-white border-tan-light hover:border-tan shadow-sm'}`}
                    >
                        <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${stat.bg} opacity-20 group-hover:scale-150 transition-transform duration-700`} />
                        
                        <div className={`p-4 rounded-2xl w-max ${stat.bg} ${stat.color} mb-4 relative z-10`}>
                            {stat.icon}
                        </div>
                        
                        <div className="relative z-10">
                            <h4 className="text-xs font-bold text-charcoal/40 uppercase tracking-widest mb-1">{stat.label}</h4>
                            <div className="flex items-center justify-between">
                                <p className="text-4xl font-serif font-black text-charcoal">{stat.count}</p>
                                <ChevronRight size={20} className={`transition-all ${activeIssue === stat.id ? 'translate-x-0 opacity-100 text-tan' : '-translate-x-4 opacity-0 text-charcoal/20'}`} />
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Audit List Section */}
            <div className="bg-white rounded-[2.5rem] border border-tan-light shadow-sm overflow-hidden flex flex-col flex-1">
                {/* Refined Filter Bar */}
                <div className="p-8 border-b border-tan-light bg-cream/10 flex flex-col gap-8">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex items-center gap-5">
                            <div className="p-4 bg-white rounded-2xl border border-tan-light shadow-sm text-tan flex items-center justify-center">
                                <ClipboardList size={28} />
                            </div>
                            <div>
                                <h2 className="text-3xl font-serif font-bold text-charcoal">Action Log</h2>
                                <p className="text-charcoal/50 font-medium">Monitoring {filteredItems.length} records matching your current filter profile.</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/30" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Search archival metadata..."
                                    className="pl-12 pr-6 py-3.5 bg-white border border-tan-light rounded-2xl text-sm outline-none focus:border-tan focus:ring-8 focus:ring-tan/5 transition-all w-80 shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            
                            <div className="flex items-center bg-cream/40 p-1.5 rounded-2xl border border-tan-light shadow-inner">
                                <button 
                                    onClick={() => setSortBy(sortBy === 'health-asc' ? 'health-desc' : 'health-asc')}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${sortBy.startsWith('health') ? 'bg-white text-tan shadow-sm' : 'text-charcoal/40 hover:text-charcoal'}`}
                                >
                                    <Activity size={16} /> 
                                    {sortBy === 'health-asc' ? 'Needs Attention' : 'Highest Health'}
                                </button>
                                <button 
                                    onClick={() => setSortBy('newest')}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${sortBy === 'newest' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/40 hover:text-charcoal'}`}
                                >
                                    <ChevronRight size={16} /> Newest First
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="relative">
                            <LayoutGrid className="absolute left-4 top-1/2 -translate-y-1/2 text-tan" size={18} />
                            <select 
                                className="w-full bg-white border border-tan-light rounded-2xl pl-12 pr-4 py-3 text-sm font-medium outline-none appearance-none cursor-pointer focus:border-tan focus:ring-8 focus:ring-tan/5 transition-all shadow-sm"
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value as any)}
                            >
                                <option value="All Types text-charcoal/40">Filter by Category...</option>
                                <option value="All Types">All Categories</option>
                                <option value="Artifact">Artifact Collection</option>
                                <option value="Document">Archival Documents</option>
                                <option value="Historic Figure">Historical Figures</option>
                                <option value="Historic Organization">Historical Organizations</option>
                            </select>
                            <ArrowUpDown className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal/20 pointer-events-none" size={14} />
                        </div>

                        <div className="relative">
                            <FolderOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-tan" size={18} />
                            <select 
                                className="w-full bg-white border border-tan-light rounded-2xl pl-12 pr-4 py-3 text-sm font-medium outline-none appearance-none cursor-pointer focus:border-tan focus:ring-8 focus:ring-tan/5 transition-all shadow-sm"
                                value={selectedCollection}
                                onChange={(e) => setSelectedCollection(e.target.value)}
                            >
                                <option value="All Collections text-charcoal/40">Filter by Collection...</option>
                                <option value="All Collections">All Collections</option>
                                {collections.map(c => (
                                    <option key={c.id} value={c.id}>{c.title}</option>
                                ))}
                            </select>
                            <ArrowUpDown className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal/20 pointer-events-none" size={14} />
                        </div>

                        <div className="flex items-center gap-2 px-4 py-3 bg-tan/5 border border-tan/10 rounded-2xl">
                            <Info size={16} className="text-tan shrink-0" />
                            <p className="text-[11px] text-charcoal/60 leading-tight">
                                Custom filters target high-priority gaps within specific curators' zones.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                            <tr className="bg-white border-b border-tan-light italic font-serif">
                                <th className="px-10 py-5 text-charcoal/40 font-medium">Resource Identity</th>
                                <th className="px-6 py-5 text-charcoal/40 font-medium">Diagnostic Health</th>
                                <th className="px-6 py-5 text-charcoal/40 font-medium">Identified Metadata Gaps</th>
                                <th className="px-10 py-5 text-right text-charcoal/40 font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-tan-light/30">
                            {filteredItems.map((item) => (
                                <tr key={item.id} className="group hover:bg-cream/20 transition-all duration-300">
                                    <td className="px-10 py-6">
                                        <div className="flex items-center gap-5">
                                            {(item.featured_image_url || (item.file_urls && item.file_urls.length > 0)) ? (
                                                <div className="relative">
                                                    <img 
                                                        src={item.featured_image_url || item.file_urls[0]} 
                                                        className="w-16 h-16 rounded-[1.25rem] object-cover border-2 border-tan-light shadow-md" 
                                                        alt="" 
                                                    />
                                                    <div className={`absolute -top-2 -right-2 w-6 h-6 ${item.featured_image_url ? 'bg-green-500' : 'bg-tan'} rounded-full border-4 border-white flex items-center justify-center`}>
                                                        {item.featured_image_url ? <CheckCircle2 size={10} className="text-white" /> : <Info size={10} className="text-white" />}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-16 h-16 rounded-[1.25rem] bg-red-50 border-2 border-red-100 flex items-center justify-center text-red-300 relative">
                                                    <ImageIcon size={24} />
                                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full border-4 border-white flex items-center justify-center">
                                                        <AlertCircle size={10} className="text-white" />
                                                    </div>
                                                </div>
                                            )}
                                            <div>
                                                <div className="font-serif font-bold text-charcoal text-lg leading-tight mb-1 group-hover:text-tan transition-colors">
                                                    {item.title || item.full_name || item.org_name}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-charcoal/20 px-2 py-0.5 bg-cream/50 rounded-md border border-tan-light/10">
                                                        ID: {item.artifact_id || 'OPEN'}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-tan/60 italic">
                                                        {item.item_type}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 border-l border-cream/50">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center justify-between gap-4">
                                                <span className={`text-[11px] font-black uppercase tracking-widest ${item.auditScore! > 60 ? 'text-tan' : 'text-red-500'}`}>
                                                    {item.auditScore}%
                                                </span>
                                                <span className="text-[10px] font-bold text-charcoal/30">Completeness</span>
                                            </div>
                                            <div className="w-24 bg-cream h-2 rounded-full overflow-hidden shadow-inner">
                                                <div className={`h-full transition-all duration-1000 ${
                                                    item.auditScore! > 80 ? 'bg-green-500' :
                                                    item.auditScore! > 60 ? 'bg-tan' :
                                                    item.auditScore! > 30 ? 'bg-amber-500' : 'bg-red-500'
                                                }`} style={{ width: `${item.auditScore}%` }}></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="flex flex-wrap gap-2">
                                            {item.auditIssues.map((issue) => (
                                                <span key={issue} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-bold tracking-tight transition-transform hover:-translate-y-0.5 shadow-sm border ${
                                                    issue === 'no-image' ? 'bg-red-50 text-red-600 border-red-100' :
                                                    issue === 'no-date' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                    issue === 'no-id' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                    issue === 'no-location' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                    'bg-charcoal/5 text-charcoal/60 border-charcoal/10'
                                                }`}>
                                                    {issue === 'no-image' && <ImageIcon size={10} />}
                                                    {issue === 'no-date' && <Calendar size={10} />}
                                                    {issue === 'no-id' && <Tag size={10} />}
                                                    {issue === 'no-location' && <MapPin size={10} />}
                                                    {issue === 'no-location' ? 'unplaced' : issue.replace('no-', 'missing ')}
                                                </span>
                                            ))}
                                            {item.auditIssues.length === 0 && (
                                                <div className="flex items-center gap-2 text-green-600 bg-green-50/50 px-4 py-1.5 rounded-full border border-green-100/50">
                                                    <CheckCircle2 size={14} />
                                                    <span className="text-[10px] font-black uppercase tracking-tighter">Perfected Archive Record</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-10 py-6 text-right">
                                        <Link 
                                            to={`/edit-item/${item.id}?from=audit`}
                                            className="inline-flex items-center gap-3 bg-white border border-tan-light px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-charcoal hover:bg-charcoal hover:text-white hover:border-charcoal transition-all active:scale-95 shadow-lg shadow-charcoal/5 group/btn"
                                        >
                                            Curate Record 
                                            <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredItems.length === 0 && !loading && (
                    <div className="p-32 text-center flex flex-col items-center justify-center animate-in zoom-in duration-500">
                        <div className="w-24 h-24 bg-cream rounded-full flex items-center justify-center text-tan mb-6 shadow-xl border border-tan/10">
                            <CheckCircle2 size={48} />
                        </div>
                        <h3 className="text-3xl font-serif font-bold text-charcoal mb-2">Diagnostic Clean</h3>
                        <p className="text-charcoal/40 text-lg max-w-sm">No items were identified with gaps matching your current selection criteria.</p>
                        <button 
                            onClick={() => { setActiveIssue('all'); setSelectedType('All Types'); setSelectedCollection('All Collections'); setSearchTerm(''); }}
                            className="mt-8 text-tan font-bold flex items-center gap-2 hover:underline"
                        >
                            <Activity size={16} /> Reset All Audit Filters
                        </button>
                    </div>
                )}
            </div>

            {/* Strategy Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-tan/5 border border-tan/20 rounded-[2rem] p-8 flex gap-6 relative overflow-hidden group">
                    <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-tan/5 rounded-full blur-3xl" />
                    <div className="bg-tan text-white p-3 rounded-2xl h-max shadow-xl z-10">
                        <Info size={28} />
                    </div>
                    <div className="z-10">
                        <h4 className="text-xl font-serif font-bold text-charcoal mb-2">Inventory Strategy</h4>
                        <p className="text-charcoal/60 leading-relaxed text-sm">
                            Focusing on <strong>Physical Locations</strong> ensures every artifact is accounted for in the museum's digital twin. 
                            Use the <em>Tagging Hub</em> or the <em>Interactive Map</em> to quickly place these unassigned items onto their corresponding shelves and boxes.
                        </p>
                    </div>
                </div>

                <div className="bg-tan/10 border border-tan/20 rounded-[2rem] p-8 flex gap-6 relative overflow-hidden group">
                    <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-tan/10 rounded-full blur-3xl transition-transform group-hover:scale-120 duration-1000" />
                    <div className="bg-tan text-white p-3 rounded-2xl h-max shadow-xl z-10">
                        <CheckCircle2 size={28} />
                    </div>
                    <div className="z-10">
                        <h4 className="text-xl font-serif font-bold text-charcoal mb-2">Collection Integrity</h4>
                        <p className="text-charcoal/60 leading-relaxed text-sm">
                            The Health Score is a diagnostic tool to help curators identify items that need more research or better photography. Every item, regardless of its score, is a valuable part of the collection and remains fully accessible to the public search engine.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
