import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Search, Upload, LogOut, LogIn, FolderOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Sidebar() {
    const { isSAHSUser, logout, user } = useAuth();
    const navigate = useNavigate();

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${isActive
            ? 'bg-tan-light text-charcoal font-medium'
            : 'text-charcoal/80 hover:bg-black/5 hover:text-charcoal'
        }`;

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    return (
        <aside className="w-64 border-r border-tan-light bg-white flex flex-col p-6 shrink-0 h-screen sticky top-0 overflow-y-auto shadow-[2px_0_8px_rgba(0,0,0,0.02)]">
            <div className="mb-10">
                <h1 className="font-serif text-[1.4rem] leading-tight font-bold text-charcoal">
                    Senoia Area<br />Historical Society
                </h1>
                <p className="text-sm text-charcoal/60 mt-1 font-medium tracking-wide">
                    Archive Database
                </p>
            </div>

            <div className="flex-1 flex flex-col gap-8">
                <div>
                    <h2 className="text-xs font-bold text-charcoal/50 tracking-wider uppercase mb-3 px-4">Browse</h2>
                    <nav className="flex flex-col gap-1">
                        <NavLink to="/" className={navLinkClass}>
                            <Home size={18} /> Home
                        </NavLink>
                        <NavLink to="/archive" className={navLinkClass}>
                            <Search size={18} /> Browse Archive
                        </NavLink>
                    </nav>
                </div>

                {isSAHSUser && (
                    <div>
                        <h2 className="text-xs font-bold text-charcoal/50 tracking-wider uppercase mb-3 px-4">Manage</h2>
                        <nav className="flex flex-col gap-1">
                            <NavLink to="/add-item" className={navLinkClass}>
                                <Upload size={18} /> Add Archive Item
                            </NavLink>
                            <NavLink to="/collections" className={navLinkClass}>
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
                        className="flex items-center justify-center gap-2 w-full px-4 py-2 border border-charcoal/20 text-charcoal/70 rounded-lg text-sm font-medium hover:bg-black/5 transition-colors"
                    >
                        <LogOut size={16} /> Sign Out
                    </button>
                ) : (
                    <NavLink
                        to="/login"
                        className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-tan text-white rounded-lg text-sm font-medium hover:bg-charcoal transition-colors"
                    >
                        <LogIn size={16} /> Curator Login
                    </NavLink>
                )}

                <p className="text-xs text-charcoal/60 font-serif italic text-center">
                    Preserving History, One Document at a Time
                </p>
            </div>
        </aside>
    );
}
