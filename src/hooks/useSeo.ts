import { useEffect } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import {
    DEFAULT_DESCRIPTION,
    DEFAULT_OG_IMAGE,
    DEFAULT_SITE_NAME,
    SITE_URL,
    type SeoMeta,
} from '../lib/seo';

/**
 * Create or update a <meta>/<link> tag, keyed by attribute so repeated
 * navigations overwrite rather than accumulate duplicates in the head.
 */
function upsertTag(
    tag: 'meta' | 'link',
    keyAttr: 'name' | 'property' | 'rel',
    keyValue: string,
    valueAttr: 'content' | 'href',
    value: string
) {
    const selector = `${tag}[${keyAttr}="${keyValue}"]`;
    let el = document.head.querySelector<HTMLElement>(selector);

    if (!el) {
        el = document.createElement(tag);
        el.setAttribute(keyAttr, keyValue);
        document.head.appendChild(el);
    }
    el.setAttribute(valueAttr, value);
}

function removeTag(selector: string) {
    document.head.querySelector(selector)?.remove();
}

/**
 * Applies per-route metadata to the document head.
 *
 * This hook is the single owner of document.title, the meta description, the
 * canonical link, and the Open Graph / Twitter tags. Nothing else in the app
 * should write them — `Layout` previously set `document.title` from an effect
 * keyed on the Firestore-backed museum name, which overwrote whatever the child
 * page had set as soon as those settings resolved.
 *
 * Pass `null` to leave the head untouched (e.g. while a page is still loading),
 * so the previous route's metadata isn't replaced by a placeholder.
 */
export function useSeo(meta: SeoMeta | null) {
    const { settings } = useAppearance();
    const siteName = settings.museumName || DEFAULT_SITE_NAME;

    const { title, description, canonical, image, type, noindex } = meta ?? {};

    useEffect(() => {
        if (!meta) return;

        const resolvedTitle = title || siteName;
        const resolvedDescription = description || DEFAULT_DESCRIPTION;
        const resolvedImage = image || DEFAULT_OG_IMAGE;
        // Fall back to the live URL so a page that omits an explicit canonical
        // still self-canonicalizes instead of inheriting the previous route's.
        const resolvedUrl = canonical || `${SITE_URL}${window.location.pathname}`;

        document.title = resolvedTitle;

        upsertTag('meta', 'name', 'description', 'content', resolvedDescription);
        upsertTag('meta', 'property', 'og:title', 'content', resolvedTitle);
        upsertTag('meta', 'property', 'og:description', 'content', resolvedDescription);
        upsertTag('meta', 'property', 'og:image', 'content', resolvedImage);
        upsertTag('meta', 'property', 'og:type', 'content', type || 'website');
        upsertTag('meta', 'property', 'og:site_name', 'content', siteName);
        upsertTag('meta', 'name', 'twitter:title', 'content', resolvedTitle);
        upsertTag('meta', 'name', 'twitter:description', 'content', resolvedDescription);
        upsertTag('meta', 'name', 'twitter:image', 'content', resolvedImage);

        if (noindex) {
            upsertTag('meta', 'name', 'robots', 'content', 'noindex, nofollow');
            // A noindex page must not assert a canonical or an og:url; doing so
            // sends contradictory signals about which URL should be indexed.
            removeTag('link[rel="canonical"]');
            removeTag('meta[property="og:url"]');
        } else {
            upsertTag('meta', 'name', 'robots', 'content', 'index, follow, max-image-preview:large');
            upsertTag('link', 'rel', 'canonical', 'href', resolvedUrl);
            upsertTag('meta', 'property', 'og:url', 'content', resolvedUrl);
        }
        // `meta` is intentionally not a dependency: callers commonly build the
        // object inline, so depending on the identity would re-run every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, description, canonical, image, type, noindex, siteName]);
}
