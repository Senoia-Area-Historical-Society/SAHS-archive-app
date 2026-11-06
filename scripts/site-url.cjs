/**
 * A deployment's own public address and default share image, read from the build
 * environment and baked into the app (vite.config.ts) and into the functions'
 * copy of the metadata builders (prepare-functions.cjs) as compile-time constants.
 *
 *   SITE_URL       the archive's origin, e.g. https://archive.example.org
 *   SITE_OG_IMAGE  the image a shared link shows when a page has none of its own:
 *                  a full URL, or a path on SITE_URL such as /share.jpg
 *
 * Both are optional. Unset, the browser uses the origin it was served from and a
 * shared link has no default image; server-side code has no address at all, so
 * the deploy-time scripts that need one refuse to run (see requireSiteUrl).
 * Production sets them in .github/workflows/deploy.yml.
 */

function siteUrlFrom(env) {
    const raw = (env.SITE_URL || '').trim();
    const url = raw.replace(/\/+$/, '');
    if (url && !/^https?:\/\/[^/?#\s]+$/.test(url)) {
        throw new Error(`SITE_URL must be an origin such as https://archive.example.org, not "${raw}".`);
    }
    return url;
}

/** `define` entries for Vite and esbuild. */
function siteBuildDefines(env = process.env) {
    return {
        __SITE_URL__: JSON.stringify(siteUrlFrom(env)),
        __SITE_OG_IMAGE__: JSON.stringify((env.SITE_OG_IMAGE || '').trim()),
    };
}

/** For scripts that write absolute URLs: a relative <loc> or canonical is invalid. */
function requireSiteUrl(siteUrl, what) {
    if (!siteUrl) {
        throw new Error(
            `${what} needs the archive's address, and functions/shared/seo.cjs was built without one. ` +
            'Set SITE_URL and rerun scripts/prepare-functions.cjs.'
        );
    }
    return siteUrl;
}

module.exports = { siteBuildDefines, requireSiteUrl };
