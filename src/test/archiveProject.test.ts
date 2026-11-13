import { describe, expect, it } from 'vitest';
import firebaserc from '../../.firebaserc?raw';
// @ts-expect-error — plain CommonJS with Node built-ins only, deliberately untyped.
import { archiveStorageBucketFor, resolveProjectId } from '../../scripts/lib/archiveProject.cjs';

/**
 * Maintenance scripts write to whichever project scripts/lib/archiveProject.cjs
 * resolves, so it must never fall back to a project written into the code, and
 * the database and bucket must come from that same project's settings file.
 */
const scriptSources = import.meta.glob('../../scripts/**/*.cjs', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

const rcDefault: string = JSON.parse(firebaserc).projects.default;

describe('resolveProjectId', () => {
    it('prefers --project', () => {
        expect(resolveProjectId(['--prod', '--project', 'other-museum'], {})).toBe('other-museum');
    });

    it('falls back to the .firebaserc default', () => {
        expect(resolveProjectId(['--prod'], {})).toBe(rcDefault);
    });

    it('rejects --project with no value', () => {
        expect(() => resolveProjectId(['--project'], {})).toThrow(/needs a Firebase project id/);
        expect(() => resolveProjectId(['--project', '--prod'], {})).toThrow(/needs a Firebase project id/);
    });

    it('refuses when the ambient Google Cloud project disagrees', () => {
        expect(() => resolveProjectId(['--project', 'a'], { GOOGLE_CLOUD_PROJECT: 'b' })).toThrow(/GOOGLE_CLOUD_PROJECT is b/);
        expect(() => resolveProjectId(['--project', 'a'], { GCLOUD_PROJECT: 'b' })).toThrow(/GCLOUD_PROJECT is b/);
        expect(resolveProjectId(['--project', 'a'], { GOOGLE_CLOUD_PROJECT: 'a' })).toBe('a');
    });
});

describe('archiveStorageBucketFor', () => {
    it('reads the bucket from the project\'s settings file', () => {
        expect(archiveStorageBucketFor(rcDefault)).toMatch(/^[a-z0-9][a-z0-9._-]+[a-z0-9]$/);
    });

    it('fails for a project with no settings file', () => {
        expect(() => archiveStorageBucketFor('no-such-project')).toThrow(/No .*\.env\.no-such-project/);
    });

    it('fails for a project whose file names no bucket', () => {
        // The Docker demo's file names a database but no bucket; nothing it runs needs one.
        expect(() => archiveStorageBucketFor('demo-archive')).toThrow(/no ARCHIVE_STORAGE_BUCKET line/);
    });
});

describe('scripts', () => {
    it('found the scripts to check', () => {
        expect(Object.keys(scriptSources).length).toBeGreaterThanOrEqual(10);
    });

    it.each(Object.entries(scriptSources))('%s names no project or bucket in code', (_file, source) => {
        expect(source).not.toMatch(new RegExp(`['"\`]${rcDefault}['"\`]`));
        expect(source).not.toMatch(/['"`][a-z0-9-]+\.(firebasestorage\.app|appspot\.com)['"`]/);
    });
});
