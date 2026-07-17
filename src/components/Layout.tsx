import { useState, useEffect } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Menu, QrCode, LogIn, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { QRScanner } from './QRScanner';
import { useAppearance } from '../contexts/AppearanceContext';

const parseQRData = (data: string): { type: 'item' | 'location' | 'room' | 'book' | 'unknown', id: string } => {
    const trimmed = data.trim();
    
    // Handle full URLs
    if (trimmed.includes('/items/')) {
        const parts = trimmed.split('/items/');
        const id = parts[parts.length - 1].split('?')[0].split('/')[0];
        return { type: 'item', id };
    }
    if (trimmed.includes('/library/')) {
        const parts = trimmed.split('/library/');
        const id = parts[parts.length - 1].split('?')[0].split('/')[0];
        return { type: 'book', id };
    }
    if (trimmed.includes('/locations/')) {
        const parts = trimmed.split('/locations/');
        const id = parts[parts.length - 1].split('?')[0].split('/')[0];
        return { type: 'location', id };
    }
    if (trimmed.includes('/rooms/')) {
        const parts = trimmed.split('/rooms/');
        const id = parts[parts.length - 1].split('?')[0].split('/')[0];
        return { type: 'room', id };
    }
    
    // Handle legacy/prefix formats
    if (trimmed.startsWith('item:')) {
        return { type: 'item', id: trimmed.replace('item:', '') };
    }
    if (trimmed.startsWith('book:')) {
        return { type: 'book', id: trimmed.replace('book:', '') };
    }
    if (trimmed.startsWith('loc:')) {
        return { type: 'location', id: trimmed.replace('loc:', '') };
    }
    if (trimmed.startsWith('room:')) {
        return { type: 'room', id: trimmed.replace('room:', '') };
    }
    
    return { type: 'unknown', id: '' };
};

export default function Layout() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const { isSAHSUser, user, logout } = useAuth();
    const { settings } = useAppearance();
    const navigate = useNavigate();

    useEffect(() => {
        if (settings.museumName) {
            document.title = `${settings.museumName} | Digital Archive`;
        }
    }, [settings.museumName]);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 4000);
    };

    const handleGlobalScan = (data: string) => {
        setIsScannerOpen(false);
        const parsed = parseQRData(data);
        
        if (parsed.type === 'item') {
            navigate(`/items/${parsed.id}`);
            showToast("Redirecting to item details...");
        } else if (parsed.type === 'book') {
            navigate(`/library/${parsed.id}`);
            showToast("Redirecting to library book...");
        } else if (parsed.type === 'location') {
            navigate(`/locations/${parsed.id}`);
            showToast("Redirecting to location details...");
        } else if (parsed.type === 'room') {
            navigate(`/rooms/${parsed.id}`);
            showToast("Redirecting to room details...");
        } else {
            showToast(`Invalid QR code format. Please scan a ${settings.museumShortName || 'SAHS'} item, book, or location QR code.`);
        }
    };

    return (
        <div className="flex min-h-screen w-full bg-cream text-charcoal font-sans selection:bg-tan/20">
            <Sidebar 
                isOpen={isMobileMenuOpen} 
                onClose={() => setIsMobileMenuOpen(false)} 
                onScanClick={() => setIsScannerOpen(true)}
            />
            <main className="flex-1 flex flex-col min-w-0 relative z-0 md:z-auto">
                {/* Mobile Header */}
                <header className="md:hidden flex flex-shrink-0 items-center justify-between p-4 bg-white border-b border-tan-light shadow-[0_2px_8px_rgba(0,0,0,0.02)] z-[40] sticky top-0">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="p-2 -ml-2 text-charcoal hover:bg-black/5 rounded-lg transition-colors"
                            aria-label="Open menu"
                        >
                            <Menu size={24} />
                        </button>
                        <h1 className="font-serif text-lg leading-tight font-bold text-charcoal">
                            {settings.museumName}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {isSAHSUser && (
                            <button 
                                onClick={() => setIsScannerOpen(true)}
                                className="p-2 text-tan hover:bg-tan/10 rounded-lg transition-colors flex items-center justify-center animate-in fade-in"
                                title="Search via QR Code"
                                aria-label="Search via QR Code"
                            >
                                <QrCode size={20} />
                            </button>
                        )}
                        {user ? (
                            <button
                                onClick={logout}
                                className="p-2 -mr-2 text-charcoal hover:bg-black/5 rounded-lg transition-colors flex items-center justify-center"
                                title="Sign Out"
                                aria-label="Sign Out"
                            >
                                <LogOut size={20} />
                            </button>
                        ) : (
                            <NavLink
                                to="/login"
                                className="flex items-center gap-1.5 bg-tan hover:bg-tan-dark text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98]"
                            >
                                <LogIn size={14} /> Log In
                            </NavLink>
                        )}
                    </div>
                </header>

                {/* Desktop/Tablet Top-Right Login / Account Status Floating Bar */}
                <div className="hidden md:block absolute top-6 right-6 z-50">
                    {user ? (
                        <div className="flex items-center gap-3 bg-white/90 backdrop-blur border border-tan-light/50 px-4 py-2 rounded-xl shadow-sm hover:shadow transition-shadow">
                            <div className="w-8 h-8 rounded-full bg-tan/20 flex items-center justify-center text-tan font-bold text-sm">
                                {user.email?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-charcoal/50 font-bold uppercase tracking-wider">Signed in</span>
                                <span className="text-xs font-semibold text-charcoal max-w-[120px] truncate">{user.email}</span>
                            </div>
                            <button
                                onClick={logout}
                                className="ml-2 p-1.5 hover:bg-black/5 rounded-lg text-charcoal-light hover:text-charcoal transition-colors"
                                title="Sign Out"
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    ) : (
                        <NavLink
                            to="/login"
                            className="flex items-center gap-2 bg-tan hover:bg-tan-dark text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:shadow transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <LogIn size={16} /> Log In
                        </NavLink>
                    )}
                </div>

                <div className="flex-1 w-full flex flex-col">
                    <Outlet />
                </div>
            </main>

            {/* Global QR Scanner Modal */}
            {isScannerOpen && (
                <QRScanner 
                    active={isScannerOpen}
                    onScan={handleGlobalScan}
                    onClose={() => setIsScannerOpen(false)}
                />
            )}

            {/* Premium Toast Notification */}
            {toastMessage && (
                <div className="fixed bottom-8 right-8 z-[2500] bg-charcoal text-cream border border-tan/30 px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300 font-serif font-semibold text-[15px]">
                    <span className={`w-2 h-2 rounded-full ${toastMessage.toLowerCase().includes('invalid') ? 'bg-red-500' : 'bg-emerald-500 animate-ping'}`}></span>
                    {toastMessage}
                </div>
            )}
        </div>
    );
}
