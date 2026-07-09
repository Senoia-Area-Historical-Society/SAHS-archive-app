import { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Upload, LogOut, LogIn, FolderOpen, FileText, Users, Building, LifeBuoy, Box, X, Settings, MessageSquare, Inbox, Camera, MapPin, Map, Activity, Instagram, Facebook, Youtube, Mic, Bell, QrCode, BookOpen, Palette, Pencil } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc } from 'firebase/firestore';
import logo from '../assets/logo2.png';
import { useAppearance } from '../contexts/AppearanceContext';

function EditableLabel({ tabKey, defaultLabel }: { tabKey: string; defaultLabel: string }) {
    const { realIsAdmin } = useAuth();
    const { settings, refreshSettings, isAppearanceEditMode } = useAppearance();
    const [isEditing, setIsEditing] = useState(false);
    const [val, setVal] = useState(settings.tabNames?.[tabKey] || defaultLabel);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync from settings when they load
    useEffect(() => {
        if (settings.tabNames?.[tabKey]) {
            setVal(settings.tabNames[tabKey]);
        }
    }, [settings.tabNames, tabKey]);

    const handleStartEdit = (e: React.MouseEvent) => {
        if (!realIsAdmin || !isAppearanceEditMode) return;
        e.preventDefault();
        e.stopPropagation();
        setIsEditing(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleSave = async () => {
        setIsEditing(false);
        if (!realIsAdmin || !isAppearanceEditMode) return;
        const trimmed = val.trim();
        if (!trimmed || trimmed === (settings.tabNames?.[tabKey] || defaultLabel)) return;

        try {
            const currentTabNames = settings.tabNames || {};
            await setDoc(doc(db, 'site_settings', 'appearance'), {
                tabNames: {
                    ...currentTabNames,
                    [tabKey]: trimmed
                }
            }, { merge: true });
            await refreshSettings();
        } catch (error) {
            console.error('Error saving custom tab name:', error);
            alert('Failed to save tab name.');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsEditing(false);
            setVal(settings.tabNames?.[tabKey] || defaultLabel);
        }
    };

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                className="ml-1 px-1.5 py-0.5 text-xs bg-white border border-tan rounded outline-none text-charcoal font-sans w-full max-w-[180px] focus:ring-1 focus:ring-tan"
            />
        );
    }

    const displayText = settings.tabNames?.[tabKey] || defaultLabel;

    return (
        <span className="flex-1 flex items-center justify-between group/label min-w-0">
            <span className="whitespace-normal break-words leading-tight">{displayText}</span>
            {realIsAdmin && isAppearanceEditMode && (
                <button
                    type="button"
                    onClick={handleStartEdit}
                    className="opacity-60 hover:opacity-100 p-1 hover:bg-tan/10 rounded text-tan transition-opacity ml-1 shrink-0"
                    title="Rename Tab"
                >
                    <Pencil size={12} />
                </button>
            )}
        </span>
    );
}

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
    onScanClick?: () => void;
}

export function Sidebar({ isOpen = false, onClose, onScanClick }: SidebarProps) {
    const { isSAHSUser, realIsAdmin, logout, user, isEditingMode, setIsEditingMode, hasResearchAccess } = useAuth();
    const { settings, isAppearanceEditMode, setIsAppearanceEditMode } = useAppearance();
    const navigate = useNavigate();

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-[15px] ${isActive
            ? 'bg-beige text-charcoal font-bold shadow-sm'
            : 'text-charcoal/70 hover:bg-black/5 hover:text-charcoal font-semibold'
        }`;

    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!isSAHSUser || !user?.email) {
            setUnreadCount(0);
            return;
        }

        const q = query(collection(db, 'notifications'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const userEmail = user.email!.toLowerCase();
            let count = 0;
            snapshot.docs.forEach((doc) => {
                const data = doc.data();
                const readBy = data.readBy || [];
                const isRead = readBy.map((e: string) => e.toLowerCase()).includes(userEmail);
                if (!isRead) {
                    count++;
                }
            });
            setUnreadCount(count);
        }, (error) => {
            console.error("Error fetching notifications for sidebar badge:", error);
        });

        return () => unsubscribe();
    }, [isSAHSUser, user?.email]);

    const location = useLocation();
    const currentParams = new URLSearchParams(location.search);
    const currentType = currentParams.get('type');
    const isArchive = location.pathname === '/archive';

    const getTypeClass = (typeValue: string) => {
        const isActive = isArchive && currentType === typeValue;
        return navLinkClass({ isActive });
    };

    const handleLogout = async () => {
        await logout();
        if (onClose) onClose();
        navigate('/');
    };

    const handleLinkClick = () => {
        if (onClose) onClose();
    };

    return (
        <>
            {/* Mobile Backdrop */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-[900] md:hidden transition-opacity"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            <aside className={`
                fixed md:sticky top-0 left-0 h-screen z-[1000] md:z-30
                w-72 border-r border-tan-light bg-white flex flex-col p-6 shrink-0 overflow-y-auto shadow-[2px_0_8px_rgba(0,0,0,0.02)]
                transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                <div className="mb-10 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white shadow-sm rounded-lg flex items-center justify-center shrink-0 border border-tan-light overflow-hidden">
                            <img src={settings.logoUrl || logo} alt="SAHS Logo" className="w-full h-full object-contain p-1" />
                        </div>
                        <div>
                            <h1 className="font-serif text-lg leading-tight font-bold text-charcoal whitespace-pre-line">
                                {settings.sidebarTitle || settings.museumName || "Senoia Area\nHistorical Society"}
                            </h1>
                            <p className="text-xs text-charcoal-light mt-0.5 tracking-wide">
                                Archive Database
                            </p>
                            
                            {/* Top Social Media Quick Links */}
                            <div className="flex items-center gap-2 mt-3">
                                {settings.instagramUrl && (
                                    <a 
                                        href={settings.instagramUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="p-1.5 bg-tan/5 text-tan hover:bg-tan hover:text-white rounded-lg transition-all shadow-sm"
                                        title="Instagram"
                                    >
                                        <Instagram size={14} />
                                    </a>
                                )}
                                {settings.facebookUrl && (
                                    <a 
                                        href={settings.facebookUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="p-1.5 bg-tan/5 text-tan hover:bg-tan hover:text-white rounded-lg transition-all shadow-sm"
                                        title="Facebook"
                                    >
                                        <Facebook size={14} />
                                    </a>
                                )}
                                {settings.youtubeUrl && (
                                    <a 
                                        href={settings.youtubeUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="p-1.5 bg-tan/5 text-tan hover:bg-tan hover:text-white rounded-lg transition-all shadow-sm"
                                        title="YouTube"
                                    >
                                        <Youtube size={14} />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Mobile Close Button */}
                    <button 
                        onClick={onClose}
                        className="md:hidden p-2 -mr-2 text-charcoal-light hover:text-charcoal hover:bg-black/5 rounded-lg transition-colors"
                        aria-label="Close menu"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 flex flex-col gap-1">
                    {/* Main Nav Section */}
                    <div className="mb-4">
                        <h2 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-3 px-4">Main</h2>
                        <nav className="flex flex-col gap-1">
                            <NavLink to="/" className={navLinkClass} onClick={handleLinkClick}>
                                <Home size={20} />
                                <EditableLabel tabKey="home" defaultLabel="Home" />
                            </NavLink>
                            {settings.featureToggles?.enableOralHistories !== false && (
                                <NavLink to="/senoia-stories" className={navLinkClass} onClick={handleLinkClick}>
                                    <Mic size={20} className="text-tan" />
                                    <EditableLabel tabKey="senoiaStories" defaultLabel="Senoia Stories" />
                                </NavLink>
                            )}
                        </nav>
                    </div>

                    {/* Archives Section */}
                    <div className="mb-4">
                        <h2 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-3 px-4">Digital Archives</h2>
                        <nav className="flex flex-col gap-1">
                            <Link to="/archive?type=Document" className={getTypeClass('Document')} onClick={handleLinkClick}>
                                <FileText size={20} />
                                <EditableLabel tabKey="documents" defaultLabel="Documents" />
                            </Link>
                            <Link to="/archive?type=Historic Figure" className={getTypeClass('Historic Figure')} onClick={handleLinkClick}>
                                <Users size={20} />
                                <EditableLabel tabKey="figures" defaultLabel="Historic Figures" />
                            </Link>
                            <Link to="/archive?type=Historic Organization" className={getTypeClass('Historic Organization')} onClick={handleLinkClick}>
                                <Building size={20} />
                                <EditableLabel tabKey="orgs" defaultLabel="Historic Orgs" />
                            </Link>
                            <Link to="/archive?type=Artifact" className={getTypeClass('Artifact')} onClick={handleLinkClick}>
                                <Box size={20} />
                                <EditableLabel tabKey="artifacts" defaultLabel="Artifact Collection" />
                            </Link>
                            {settings.featureToggles?.enableLibrary !== false && (
                                <NavLink to="/library" className={navLinkClass} onClick={handleLinkClick}>
                                    <BookOpen size={20} />
                                    <EditableLabel tabKey="library" defaultLabel="Book Library" />
                                </NavLink>
                            )}
                        </nav>
                    </div>

                    {/* Discovery Section */}
                    <div className="mb-4">
                        <h2 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-3 px-4">Discovery Tools</h2>
                        <nav className="flex flex-col gap-1">
                            <NavLink to="/search" className={navLinkClass} onClick={handleLinkClick}>
                                <Search size={20} />
                                <EditableLabel tabKey="search" defaultLabel="Advanced Search" />
                            </NavLink>
                            {settings.featureToggles?.enableMap !== false && (
                                <NavLink to="/map" className={navLinkClass} onClick={handleLinkClick}>
                                    <MapPin size={20} />
                                    <EditableLabel tabKey="map" defaultLabel="Map View" />
                                </NavLink>
                            )}
                            {settings.featureToggles?.enableCollections !== false && (
                                <NavLink to="/collections" className={navLinkClass} onClick={handleLinkClick}>
                                    <FolderOpen size={20} />
                                    <EditableLabel tabKey="collections" defaultLabel="Curated Collections" />
                                </NavLink>
                            )}
                        </nav>
                    </div>

                    {/* Research Section */}
                    {hasResearchAccess && (
                        <div className="mb-4">
                            <h2 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-3 px-4">Research Workspace</h2>
                            <nav className="flex flex-col gap-1">
                                <NavLink to="/my-research" end className={navLinkClass} onClick={handleLinkClick}>
                                    <FolderOpen className="text-tan" size={20} />
                                    <EditableLabel tabKey="researchFolders" defaultLabel="My Research Folders" />
                                </NavLink>
                                <NavLink to="/my-research/map" className={navLinkClass} onClick={handleLinkClick}>
                                    <Map className="text-tan" size={20} />
                                    <EditableLabel tabKey="researchMap" defaultLabel="My Research Map" />
                                </NavLink>
                                {settings.featureToggles?.enableMembership !== false && (
                                    <NavLink to="/my-research/membership" className={navLinkClass} onClick={handleLinkClick}>
                                        <Users className="text-tan" size={20} />
                                        <EditableLabel tabKey="membership" defaultLabel="Membership Status" />
                                    </NavLink>
                                )}
                            </nav>
                        </div>
                    )}

                    {/* Support Section */}
                    {(settings.contactSupportUrl || settings.archiveFeedbackUrl || settings.suggestionBoxUrl) && (
                        <div className="mb-4">
                            <h2 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-3 px-4">Help</h2>
                            <nav className="flex flex-col gap-1">
                                {settings.contactSupportUrl && (
                                    <a
                                        href={settings.contactSupportUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-charcoal/70 hover:bg-black/5 hover:text-charcoal font-semibold text-[15px]"
                                    >
                                        <LifeBuoy size={20} /> Contact Support
                                    </a>
                                )}
                                {settings.archiveFeedbackUrl && (
                                    <a
                                        href={settings.archiveFeedbackUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-charcoal/70 hover:bg-black/5 hover:text-charcoal font-semibold text-[15px]"
                                    >
                                        <MessageSquare size={20} /> Archive Feedback
                                    </a>
                                )}
                                {settings.suggestionBoxUrl && (
                                    <a
                                        href={settings.suggestionBoxUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-charcoal/70 hover:bg-black/5 hover:text-charcoal font-semibold text-[15px]"
                                    >
                                        <Inbox size={20} /> Suggestion Box
                                    </a>
                                )}
                            </nav>
                        </div>
                    )}

                {(isSAHSUser || realIsAdmin) && (
                    <div className="flex flex-col gap-0 border-t border-tan-light/30 pt-6 mt-2">
                        {isSAHSUser && (
                            <div className="mb-4">
                                <h2 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-3 px-4">Workspace</h2>
                                <nav className="flex flex-col gap-1">
                                    <NavLink to="/manage-locations" className={navLinkClass} onClick={handleLinkClick}>
                                        <MapPin size={20} />
                                        <EditableLabel tabKey="locations" defaultLabel="Museum Locations" />
                                    </NavLink>
                                    <NavLink to="/tagging" className={navLinkClass} onClick={handleLinkClick}>
                                        <Camera size={20} />
                                        <EditableLabel tabKey="tagging" defaultLabel="Tagging Hub" />
                                    </NavLink>
                                    {settings.featureToggles?.enableMap !== false && (
                                        <NavLink to="/interactive-map" className={navLinkClass} onClick={handleLinkClick}>
                                            <Map size={20} />
                                            <EditableLabel tabKey="interactiveMap" defaultLabel="Interactive Map" />
                                        </NavLink>
                                    )}
                                    <button
                                        onClick={() => {
                                            if (onScanClick) onScanClick();
                                            if (onClose) onClose();
                                        }}
                                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-charcoal/70 hover:bg-black/5 hover:text-charcoal font-semibold text-[15px] w-full text-left transition-colors"
                                    >
                                        <QrCode size={20} className="text-tan" />
                                        <EditableLabel tabKey="qrSearch" defaultLabel="Search via QR Code" />
                                    </button>
                                </nav>
                            </div>
                        )}

                        <div className="mb-4">
                            <h2 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-3 px-4">Curation</h2>
                            <nav className="flex flex-col gap-1">
                                {isSAHSUser && (
                                    <>
                                        <NavLink to="/add-item" className={navLinkClass} onClick={handleLinkClick}>
                                            <Upload size={20} />
                                            <EditableLabel tabKey="addItem" defaultLabel="Add Archive Item" />
                                        </NavLink>
                                        {settings.featureToggles?.enableLibrary !== false && (
                                            <NavLink to="/library/add" className={navLinkClass} onClick={handleLinkClick}>
                                                <BookOpen size={20} />
                                                <EditableLabel tabKey="addBook" defaultLabel="Add Library Book" />
                                            </NavLink>
                                        )}
                                        {isSAHSUser && (
                                            <NavLink to="/audit" className={navLinkClass} onClick={handleLinkClick}>
                                                <Activity size={20} />
                                                <EditableLabel tabKey="audit" defaultLabel="Data Quality Audit" />
                                            </NavLink>
                                        )}
                                        {isSAHSUser && (
                                            <NavLink to="/notifications" className={navLinkClass} onClick={handleLinkClick}>
                                                <div className="relative flex items-center justify-between w-full min-w-0">
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <Bell size={20} />
                                                        <EditableLabel tabKey="notifications" defaultLabel="Moderation Feed" />
                                                    </div>
                                                    {unreadCount > 0 && (
                                                        <span className="bg-tan text-white text-xs px-2 py-0.5 rounded-full font-bold min-w-[20px] text-center shrink-0">
                                                            {unreadCount}
                                                        </span>
                                                    )}
                                                </div>
                                            </NavLink>
                                        )}
                                    </>
                                )}
                                {realIsAdmin && (
                                    <>
                                        <NavLink to="/appearance" className={navLinkClass} onClick={handleLinkClick}>
                                            <Palette size={20} />
                                            <EditableLabel tabKey="appearance" defaultLabel="Website Appearance" />
                                        </NavLink>
                                        <NavLink to="/settings" className={navLinkClass} onClick={handleLinkClick}>
                                            <Settings size={20} />
                                            <EditableLabel tabKey="settings" defaultLabel="Admin Settings" />
                                        </NavLink>
                                    </>
                                )}
                            </nav>
                        </div>

                        {isSAHSUser && (
                            <div className="px-4 py-4 bg-tan/5 rounded-xl border border-tan/10">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <span className="text-xs font-bold text-charcoal tracking-wide uppercase">Editing Mode</span>
                                    <button
                                        onClick={() => setIsEditingMode(!isEditingMode)}
                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isEditingMode ? 'bg-tan' : 'bg-charcoal/20'}`}
                                    >
                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isEditingMode ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                                <p className="text-xs text-charcoal/60 leading-relaxed font-medium">
                                    {isEditingMode 
                                        ? 'Clicking items will take you directly to the editor.' 
                                        : 'Enable for high-volume editing'}
                                </p>
                                {realIsAdmin && (
                                     <div className="mt-3 pt-3 border-t border-tan-light/20">
                                         <div className="flex items-center justify-between gap-3 mb-2">
                                             <span className="text-xs font-bold text-charcoal tracking-wide uppercase">Page Editor</span>
                                             <button
                                                 onClick={() => setIsAppearanceEditMode(!isAppearanceEditMode)}
                                                 className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isAppearanceEditMode ? 'bg-tan' : 'bg-charcoal/20'}`}
                                                 title="Toggle direct text editing on pages"
                                             >
                                                 <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isAppearanceEditMode ? 'translate-x-4' : 'translate-x-0'}`} />
                                             </button>
                                         </div>
                                         <p className="text-xs text-charcoal/60 leading-relaxed font-medium">
                                             {isAppearanceEditMode 
                                                 ? 'Click inline text blocks on pages to edit them directly.' 
                                                 : 'Enable to edit website titles and text blocks directly on pages.'}
                                         </p>
                                     </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>


                {!user && settings.featureToggles?.enableMembership !== false && (
                    <div className="p-4 rounded-xl bg-tan/5 border border-tan/20 flex flex-col gap-2 mb-2">
                        <h3 className="font-serif font-bold text-[13px] text-charcoal leading-snug">SAHS Member Benefits</h3>
                        <p className="text-[11px] text-charcoal/60 leading-relaxed font-medium">
                            Active members can sign in to save custom research folders, bookmark resources, and download archival images.
                        </p>
                        <NavLink
                            to="/login"
                            className="text-left text-[11px] font-bold text-tan hover:text-tan-dark transition-colors uppercase tracking-wider mt-1"
                            onClick={handleLinkClick}
                        >
                            Log in as Member →
                        </NavLink>
                    </div>
                )}

                <div className="mt-8 pt-6 border-t border-tan-light/50 flex flex-col gap-4">
                {user ? (
                    <button
                        onClick={handleLogout}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-tan-light text-charcoal-light rounded-lg text-sm font-medium hover:bg-black/5 hover:text-charcoal transition-colors"
                    >
                        <LogOut size={16} /> Sign Out
                    </button>
                ) : (
                    <NavLink
                        to="/login"
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-charcoal text-white rounded-lg text-sm font-medium hover:bg-charcoal-light transition-colors"
                        onClick={handleLinkClick}
                    >
                        <LogIn size={16} /> Member & Curator Login
                    </NavLink>
                )}

                <p className="text-xs text-charcoal-light font-serif italic text-center leading-relaxed">
                    Preserving History, One Document at a Time
                </p>
            </div>
        </aside>
        </>
    );
}
