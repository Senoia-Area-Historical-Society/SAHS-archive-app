import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Menu } from 'lucide-react';

export default function Layout() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <div className="flex min-h-screen w-full bg-cream text-charcoal font-sans selection:bg-tan/20">
            <Sidebar 
                isOpen={isMobileMenuOpen} 
                onClose={() => setIsMobileMenuOpen(false)} 
            />
            <main className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="md:hidden flex flex-shrink-0 items-center justify-between p-4 bg-white border-b border-tan-light shadow-[0_2px_8px_rgba(0,0,0,0.02)] z-10 sticky top-0">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="p-2 -ml-2 text-charcoal hover:bg-black/5 rounded-lg transition-colors"
                            aria-label="Open menu"
                        >
                            <Menu size={24} />
                        </button>
                        <h1 className="font-serif text-lg leading-tight font-bold text-charcoal">
                            Senoia Area Historical Society
                        </h1>
                    </div>
                </header>

                <div className="flex-1 w-full flex flex-col">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
