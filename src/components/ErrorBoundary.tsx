import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * Catches render-phase errors so a crash degrades instead of blanking the page.
 *
 * Without one, any throw during render unmounts the whole React tree and leaves
 * a white page at HTTP 200, with the failure visible only in the console. That
 * is not hypothetical: a feature-toggle gate placed above a page's hook
 * declarations threw React error #310 and served four blank routes in
 * production. Nothing degraded, nothing was logged where anyone would see it.
 *
 * The likelier trigger is a deploy, not a bug. Every page is behind
 * React.lazy(), and each build emits new content-hashed chunk filenames while
 * the old ones stop existing. Anyone with the app already open is holding HTML
 * that points at chunks now returning 404, so their next navigation throws. The
 * fallback below detects that case specifically and offers a reload, which
 * fixes it outright.
 *
 * This has to be a class. React 19 still ships no hook equivalent of
 * getDerivedStateFromError / componentDidCatch, and App.tsx uses
 * <BrowserRouter><Routes> rather than createBrowserRouter, so React Router's
 * built-in errorElement is not available either.
 */

interface Props {
    children: ReactNode;
    /**
     * Change this to clear a caught error — RouteErrorBoundary passes the
     * pathname.
     *
     * A class boundary holds its error state across navigation. Without a reset,
     * one crash pins the fallback in place until a full reload, which makes the
     * boundary worse than the blank page it replaced: the fallback looks
     * deliberate, so nobody thinks to reload.
     *
     * Compared as a prop rather than applied as React's `key`. Keying would
     * remount the entire subtree on every navigation, healthy or not — moving
     * between two items would rebuild the page instead of re-rendering it.
     */
    resetKey?: string;
    /** Shown above the message, e.g. "the archive map". */
    label?: string;
}

interface State {
    error: Error | null;
    resetKey?: string;
}

/**
 * A stale chunk reference produces a network-ish error from the module loader
 * rather than anything the app threw. Browsers word it differently, so match on
 * all three rather than one.
 */
function isStaleChunkError(error: Error): boolean {
    const text = `${error.name} ${error.message}`;
    return /dynamically imported module|module script failed|Importing a module/i.test(text);
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null, resetKey: this.props.resetKey };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
        if (props.resetKey !== state.resetKey) {
            return { error: null, resetKey: props.resetKey };
        }
        return null;
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // The boundary's one real cost is that it hides crashes: a page that
        // throws every render now looks like a tidy card rather than an obvious
        // blank, and can survive longer before anyone reports it. Logging keeps
        // this no quieter than the blank page was.
        console.error('Render error caught by ErrorBoundary:', error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        const stale = isStaleChunkError(error);

        return (
            <div className="flex flex-col items-center justify-center min-h-[55vh] text-center px-4">
                <AlertTriangle size={40} className="text-tan mb-4" aria-hidden="true" />
                <p className="font-sans text-tan text-sm font-black uppercase tracking-[0.25em] mb-4">
                    {stale ? 'Update Available' : 'Something Went Wrong'}
                </p>
                <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal mb-4 tracking-tight">
                    {stale ? 'This page needs a refresh' : 'This page failed to load'}
                </h1>
                <p className="font-sans text-charcoal/70 max-w-md mb-8 leading-relaxed">
                    {stale
                        ? 'The archive was updated while you had it open, so part of this page is no longer available. Reloading will pick up the new version.'
                        : `Something went wrong while displaying ${this.props.label || 'this page'}. The rest of the archive is unaffected.`}
                </p>

                {/*
                  * The message is only useful to someone who can act on it. In
                  * production it is noise at best and confusing at worst, so it
                  * goes to the console instead — see componentDidCatch.
                  */}
                {import.meta.env.DEV && (
                    <pre className="font-mono text-xs text-left text-charcoal/80 bg-tan/10 border border-tan/30 rounded-xl p-4 mb-8 max-w-xl overflow-x-auto">
                        {error.name}: {error.message}
                    </pre>
                )}

                <div className="flex flex-col sm:flex-row gap-4">
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center justify-center gap-2 bg-tan hover:bg-tan-dark text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-sm"
                    >
                        <RotateCw size={20} aria-hidden="true" />
                        Reload the page
                    </button>
                    {/*
                      * A plain anchor, not <Link>. The root boundary sits outside
                      * BrowserRouter and has no router context, and a full document
                      * load is the more reliable recovery anyway when the cause is a
                      * stale bundle.
                      */}
                    <a
                        href="/"
                        className="inline-flex items-center justify-center gap-2 border-2 border-tan/40 hover:border-tan text-charcoal px-6 py-3 rounded-xl font-bold transition-colors"
                    >
                        Return Home
                    </a>
                </div>
            </div>
        );
    }
}

/**
 * The boundary as used inside Layout, resetting itself when the route changes.
 *
 * Separate from ErrorBoundary because useLocation needs router context, which
 * the root-level boundary in App.tsx sits outside of.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
