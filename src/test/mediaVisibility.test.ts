import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain CommonJS, deliberately untyped and import-free so this
// test does not drag firebase-functions into the site build. See the module header.
import * as rules from '../../functions/mediaVisibilityRules.js';
import { thumbObjectPath, THUMB_SIZES } from '../lib/imageThumbs';

const { objectPathFromUrl, thumbPathsFor, expectsThumbnails, mediaTargets, mediaSignature, visibilityActions } = rules;

/**
 * functions/mediaVisibility.js applies an item's privacy to its media when the
 * item changes, instead of waiting for the fortnightly reconcile. A private
 * item's thumbnails were public because the resize extension made every variant
 * public; these cover which objects the trigger makes public and which it
 * restricts.
 */

const BUCKET = 'sahs-archives.firebasestorage.app';
const token = (path: string) =>
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=abc`;
const gcs = (path: string) => `https://storage.googleapis.com/${BUCKET}/${path}?GoogleAccessId=x&Signature=y`;

describe('objectPathFromUrl', () => {
    it('reads both URL shapes for our bucket', () => {
        expect(objectPathFromUrl(token('archive_media/a b.png'), BUCKET)).toBe('archive_media/a b.png');
        expect(objectPathFromUrl(gcs('archive_media/x.png'), BUCKET)).toBe('archive_media/x.png');
    });

    it('ignores other buckets and other hosts', () => {
        expect(objectPathFromUrl(token('archive_media/a.png').replace(BUCKET, 'other'), BUCKET)).toBeNull();
        expect(objectPathFromUrl('https://example.com/archive_media/a.png', BUCKET)).toBeNull();
        expect(objectPathFromUrl('', BUCKET)).toBeNull();
    });
});

describe('thumbPathsFor', () => {
    // Must produce exactly what the client derives, or a public item's thumbnail
    // stays restricted while the client asks for it.
    it('matches src/lib/imageThumbs.ts', () => {
        const original = 'archive_media/123_scan.final.png';
        expect(thumbPathsFor(original)).toEqual(THUMB_SIZES.map((s) => thumbObjectPath(original, s)));
    });
});

describe('expectsThumbnails', () => {
    it('is true only for images under the extension\'s include paths', () => {
        expect(expectsThumbnails('archive_media/a.png', 'image/png')).toBe(true);
        expect(expectsThumbnails('archive_media/a.pdf', 'application/pdf')).toBe(false);
        expect(expectsThumbnails('accession_paperwork/a.png', 'image/png')).toBe(false);
        expect(expectsThumbnails('archive_media/thumbs/a_400x400.webp', 'image/webp')).toBe(false);
    });
});

describe('mediaTargets', () => {
    const item = (is_private: boolean | undefined) => ({
        is_private,
        file_urls: [token('archive_media/1.png'), gcs('archive_media/2.jpg')],
        featured_image_url: token('archive_media/1.png'),
        additional_media_urls: [token('additional_media/a.mp3')],
        accession_paperwork_urls: [token('accession_paperwork/deed.pdf')],
        website_image: 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/content_images%2Fx.png?alt=media',
    });

    it('makes a public item\'s media and thumbnails public', () => {
        const t = mediaTargets(item(false), BUCKET);
        expect(t.get('archive_media/1.png')).toBe('public');
        expect(t.get('archive_media/thumbs/1_400x400.webp')).toBe('public');
        expect(t.get('archive_media/thumbs/2_1000x1000.webp')).toBe('public');
        expect(t.get('additional_media/a.mp3')).toBe('public');
    });

    it('restricts a private item\'s media and thumbnails', () => {
        const t = mediaTargets(item(true), BUCKET);
        for (const [, visibility] of t) expect(visibility).toBe('restricted');
        expect(t.get('archive_media/thumbs/1_400x400.webp')).toBe('restricted');
    });

    // firestore.rules hides a document with no is_private from the public, so its
    // media must not be public either.
    it('restricts media of an item missing is_private', () => {
        expect(mediaTargets(item(undefined), BUCKET).get('archive_media/1.png')).toBe('restricted');
    });

    it('never makes paperwork public, even on a public item', () => {
        const t = mediaTargets(item(false), BUCKET);
        expect(t.get('accession_paperwork/deed.pdf')).toBe('restricted');
        expect(mediaTargets({ is_private: false, x: token('accession_paperwork/y.png') }, BUCKET)
            .get('accession_paperwork/y.png')).toBe('restricted');
    });

    it('leaves objects outside the archive\'s own prefixes alone', () => {
        expect(mediaTargets(item(false), BUCKET).has('content_images/x.png')).toBe(false);
    });
});

describe('mediaSignature', () => {
    it('changes when the item\'s visibility or media changes, and not otherwise', () => {
        const base = { is_private: false, file_urls: [token('archive_media/1.png')], title: 'a' };
        expect(mediaSignature({ ...base, title: 'b' }, BUCKET)).toBe(mediaSignature(base, BUCKET));
        expect(mediaSignature({ ...base, is_private: true }, BUCKET)).not.toBe(mediaSignature(base, BUCKET));
        expect(mediaSignature({ ...base, file_urls: [token('archive_media/2.png')] }, BUCKET))
            .not.toBe(mediaSignature(base, BUCKET));
    });
});

describe('visibilityActions', () => {
    it('restricting removes both the public ACL and the download token', () => {
        expect(visibilityActions('restricted', true, true)).toEqual({ makePublic: false, makePrivate: true, revokeToken: true });
        expect(visibilityActions('restricted', false, false)).toEqual({ makePublic: false, makePrivate: false, revokeToken: false });
    });

    it('publishing adds the ACL and leaves tokens alone', () => {
        expect(visibilityActions('public', false, true)).toEqual({ makePublic: true, makePrivate: false, revokeToken: false });
        expect(visibilityActions('public', true, false)).toEqual({ makePublic: false, makePrivate: false, revokeToken: false });
    });
});
