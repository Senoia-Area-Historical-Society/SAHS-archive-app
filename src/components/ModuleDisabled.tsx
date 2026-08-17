/**
 * Shown in place of a feature-gated page when its toggle is off in
 * site_settings/appearance.
 *
 * Every gated page renders this from a thin wrapper component that does nothing
 * but read the toggle and branch. That structure is deliberate. The toggles
 * default to `false` in AppearanceContext and are replaced by the real Firestore
 * values a moment later, so the branch flips on essentially every page load. When
 * the gate sat inline — above the page's own useState/useEffect calls — the first
 * render ran a handful of hooks and the second ran dozens, which is React error
 * #310 ("rendered more hooks than during the previous render") and, with no error
 * boundary in this app, a blank page.
 *
 * Keeping the branch in a wrapper means the component that contains the gate has
 * a fixed hook count, and the page body either mounts fresh or doesn't. Adding a
 * hook to a page body is then safe; adding one below a gate is not.
 *
 * The wrappers also check `loading` before showing this, so a page that is in fact
 * enabled never flashes "Module Disabled" on the way to its content. That flash was
 * visible for the whole Firestore round trip, which is long enough for a crawler to
 * snapshot it — /library and /collections are in the sitemap.
 */
export function ModuleDisabled({ module }: { module: string }) {
    return (
        <div className="flex-1 p-8 font-sans text-center flex flex-col justify-center items-center min-h-[400px]">
            <h1 className="text-3xl font-serif font-bold text-charcoal mb-4">Module Disabled</h1>
            <p className="text-charcoal/60 max-w-md">
                The {module} module is not active for this archive site.
            </p>
        </div>
    );
}
