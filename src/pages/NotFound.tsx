import { Link } from 'react-router-dom';
import { Search, Home as HomeIcon } from 'lucide-react';
import { useAppearance } from '../contexts/AppearanceContext';
import { useSeo } from '../hooks/useSeo';
import { formatTitle, DEFAULT_SITE_NAME } from '../lib/seo';

/**
 * Catch-all route.
 *
 * Firebase Hosting rewrites every unmatched path to index.html, so the server
 * cannot return a real 404 status for an SPA route. Without this route, unknown
 * URLs rendered the Layout around an empty <Outlet> — a blank page at HTTP 200,
 * which crawlers read as an unlimited supply of thin duplicate pages.
 *
 * We can't change the status code, but `noindex` keeps these out of the index,
 * and giving the user real navigation makes it a genuine 404 experience.
 */
export function NotFound() {
    const { settings } = useAppearance();
    const siteName = settings.museumName || DEFAULT_SITE_NAME;

    useSeo({
        title: formatTitle('Page Not Found', siteName),
        description: 'The page you are looking for could not be found in the digital archive.',
        noindex: true,
    });

    return (
        <div className="flex flex-col items-center justify-center min-h-[55vh] text-center px-4">
            <p className="font-sans text-tan text-sm font-black uppercase tracking-[0.25em] mb-4">
                Error 404
            </p>
            <h1 className="text-4xl sm:text-5xl font-serif font-bold text-charcoal mb-4 tracking-tight">
                Page Not Found
            </h1>
            <p className="font-sans text-charcoal/70 max-w-md mb-10 leading-relaxed">
                We couldn't find that page. It may have been moved, or the link may be
                incorrect.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
                <Link
                    to="/"
                    className="inline-flex items-center justify-center gap-2 bg-tan hover:bg-tan-dark text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-sm"
                >
                    <HomeIcon size={20} />
                    Return Home
                </Link>
                <Link
                    to="/archive"
                    className="inline-flex items-center justify-center gap-2 border-2 border-tan/40 hover:border-tan text-charcoal px-6 py-3 rounded-xl font-bold transition-colors"
                >
                    <Search size={20} />
                    Browse the Archive
                </Link>
            </div>
        </div>
    );
}
