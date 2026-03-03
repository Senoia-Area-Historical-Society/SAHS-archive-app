import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export default function Layout() {
    return (
        <div className="flex min-h-screen w-full bg-cream text-charcoal font-sans selection:bg-tan/20">
            <Sidebar />
            <main className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 w-full flex flex-col">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
