import { describe, it, expect } from 'vitest';
import {
    featuredAfterRemoval,
    featuredIndexAfterRemoval,
    featuredUrlForSave,
    isLocalPreviewUrl,
} from '../lib/featuredImage';

/**
 * The bugs these guard: Edit Item and Edit Collection could store a `blob:` preview
 * URL as `featured_image_url`, which no other browser can load; and Add Item's
 * featured index kept pointing at the same position when an earlier image was
 * removed, so a different image became featured.
 */

const BLOB = 'blob:https://archives.senoiahistory.com/0b1c';
const A = 'https://storage.googleapis.com/bucket/archive_media/a.jpg';
const B = 'https://storage.googleapis.com/bucket/archive_media/b.jpg';

describe('isLocalPreviewUrl', () => {
    it('recognises blob: and data: URLs', () => {
        expect(isLocalPreviewUrl(BLOB)).toBe(true);
        expect(isLocalPreviewUrl('data:image/png;base64,AAAA')).toBe(true);
    });

    it('is false for stored URLs and blanks', () => {
        expect(isLocalPreviewUrl(A)).toBe(false);
        expect(isLocalPreviewUrl('')).toBe(false);
        expect(isLocalPreviewUrl(null)).toBe(false);
    });
});

describe('featuredAfterRemoval', () => {
    it('leaves the choice alone when another image is removed', () => {
        expect(featuredAfterRemoval(A, B, [A])).toBe(A);
    });

    it('falls back to the first remaining image when the featured one is removed', () => {
        expect(featuredAfterRemoval(BLOB, BLOB, [A, B])).toBe(A);
        expect(featuredAfterRemoval(A, A, [null, B])).toBe(B);
    });

    it('falls back to none when nothing is left', () => {
        expect(featuredAfterRemoval(BLOB, BLOB, [])).toBeNull();
    });

    it('keeps no selection as no selection', () => {
        expect(featuredAfterRemoval(null, A, [B])).toBeNull();
    });
});

describe('featuredUrlForSave', () => {
    it('keeps a stored URL', () => {
        expect(featuredUrlForSave(A, [A, B])).toBe(A);
    });

    it('never stores a blob: URL, falling back to the first saved image', () => {
        expect(featuredUrlForSave(BLOB, [B, A])).toBe(B);
        expect(featuredUrlForSave(BLOB, [BLOB, A])).toBe(A);
    });

    it('stores null when there is nothing to fall back to', () => {
        expect(featuredUrlForSave(BLOB, [])).toBeNull();
        expect(featuredUrlForSave(null, [A])).toBeNull();
    });
});

describe('featuredIndexAfterRemoval', () => {
    it('follows the featured image left when an earlier one is removed', () => {
        expect(featuredIndexAfterRemoval(2, 0)).toBe(1);
        expect(featuredIndexAfterRemoval(2, 1)).toBe(1);
    });

    it('is unchanged when a later image is removed', () => {
        expect(featuredIndexAfterRemoval(1, 3)).toBe(1);
    });

    it('falls back to the first image when the featured one is removed', () => {
        expect(featuredIndexAfterRemoval(2, 2)).toBe(0);
    });
});
