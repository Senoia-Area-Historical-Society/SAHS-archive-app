/**
 * The switch inside a search box between forgiving search (typos, any word
 * order — the default) and exact search (only the text exactly as typed). See
 * src/lib/forgivingSearch.ts. Sits at the right-hand end of the box, so the
 * input needs room for it on the right (pr-28).
 */
export function ExactMatchToggle({ exact, onChange }: { exact: boolean; onChange: (exact: boolean) => void }) {
    return (
        <button
            type="button"
            aria-pressed={exact}
            onClick={() => onChange(!exact)}
            title={exact ? 'Showing only results with exactly what you typed. Click to also allow typos and any word order.' : 'Allowing typos and any word order. Click to show only results with exactly what you typed.'}
            className={`absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${
                exact
                    ? 'bg-tan text-white border-tan'
                    : 'bg-white text-charcoal/50 border-tan-light hover:text-charcoal hover:border-tan'
            }`}
        >
            Exact
        </button>
    );
}
