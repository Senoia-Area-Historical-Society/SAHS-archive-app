import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Upload, LogOut, LogIn, FolderOpen, FileText, Users, Building, LifeBuoy, Box, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.svg';

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
    const { isSAHSUser, logout, user } = useAuth();
    const navigate = useNavigate();

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
            ? 'bg-beige text-charcoal font-semibold shadow-sm'
            : 'text-charcoal-light hover:bg-black/5 hover:text-charcoal font-medium'
        }`;

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
                    className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            <aside className={`
                fixed md:sticky top-0 left-0 h-screen z-50
                w-64 border-r border-tan-light bg-white flex flex-col p-6 shrink-0 overflow-y-auto shadow-[2px_0_8px_rgba(0,0,0,0.02)]
                transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                <div className="mb-10 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white shadow-sm rounded-lg flex items-center justify-center shrink-0 border border-tan-light overflow-hidden">
                            <img src={logo} alt="SAHS Logo" className="w-full h-full object-contain p-1" />
                        </div>
                        <div>
                            <h1 className="font-serif text-lg leading-tight font-bold text-charcoal">
                                Senoia Area<br />Historical Society
                            </h1>
                            <p className="text-xs text-charcoal-light mt-0.5 tracking-wide">
                                Archive Database
                            </p>
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

            <div className="flex-1 flex flex-col gap-8">
                <div>
                    <h2 className="text-xs font-bold text-charcoal-light tracking-wider uppercase mb-3 px-4">Browse</h2>
                    <nav className="flex flex-col gap-1">
                        <NavLink to="/" className={navLinkClass} onClick={handleLinkClick}>
                            <Home size={18} /> Home
                        </NavLink>
                        <Link to="/archive?type=Document" className={getTypeClass('Document')} onClick={handleLinkClick}>
                            <FileText size={18} /> Documents
                        </Link>
                        <Link to="/archive?type=Historic Figure" className={getTypeClass('Historic Figure')} onClick={handleLinkClick}>
                            <Users size={18} /> Historic Figures
                        </Link>
                        <Link to="/archive?type=Historic Organization" className={getTypeClass('Historic Organization')} onClick={handleLinkClick}>
                            <Building size={18} /> Historic Orgs
                        </Link>
                        <Link to="/archive?type=Artifact" className={getTypeClass('Artifact')} onClick={handleLinkClick}>
                            <Box size={18} /> Artifact Collection
                        </Link>
                        <NavLink to="/search" className={navLinkClass} onClick={handleLinkClick}>
                            <Search size={18} /> Advanced Search
                        </NavLink>
                    </nav>
                </div>

                <div>
                    <h2 className="text-xs font-bold text-charcoal-light tracking-wider uppercase mb-3 px-4">Support</h2>
                    <nav className="flex flex-col gap-1">
                        <a
                            href="https://www.senoiahistory.com/contact-sahs"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-charcoal-light hover:bg-black/5 hover:text-charcoal font-medium"
                        >
                            <LifeBuoy size={18} /> Contact Support
                        </a>
                    </nav>
                </div>

                {isSAHSUser && (
                    <div>
                        <h2 className="text-xs font-bold text-charcoal-light tracking-wider uppercase mb-3 px-4">Manage</h2>
                        <nav className="flex flex-col gap-1">
                            <NavLink to="/add-item" className={navLinkClass} onClick={handleLinkClick}>
                                <Upload size={18} /> Add Archive Item
                            </NavLink>
                            <NavLink to="/collections" className={navLinkClass} onClick={handleLinkClick}>
                                <FolderOpen size={18} /> Collections
                            </NavLink>
                        </nav>
                    </div>
                )}
            </div>

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
                        <LogIn size={16} /> Curator Login
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
