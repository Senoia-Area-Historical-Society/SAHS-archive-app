import { useEffect } from 'react';

/** Marks the script tags this hook owns, so route changes replace rather than stack. */
const MANAGED_ATTR = 'data-managed-jsonld';

/**
 * Injects JSON-LD structured data into the document head.
 *
 * Every managed block is removed and rewritten on change, so navigating between
 * routes can't leave a previous page's entities behind — stale structured data
 * describing the wrong page is worse than none, since it actively misreports
 * what the URL contains.
 *
 * Pass null/undefined entries (e.g. while data loads) and they're skipped.
 */
export function useJsonLd(blocks: Array<Record<string, unknown> | null | undefined>) {
    // Serialize for the dependency so inline-built objects don't re-run every render.
    const serialized = JSON.stringify(blocks.filter(Boolean));

    useEffect(() => {
        const parsed: unknown[] = JSON.parse(serialized);
        if (parsed.length === 0) return;

        const added = parsed.map((block) => {
            const el = document.createElement('script');
            el.type = 'application/ld+json';
            el.setAttribute(MANAGED_ATTR, 'true');
            el.textContent = JSON.stringify(block);
            document.head.appendChild(el);
            return el;
        });

        return () => added.forEach((el) => el.remove());
    }, [serialized]);
}
