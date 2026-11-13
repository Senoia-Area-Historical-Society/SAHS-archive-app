import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicMediaUrl, storageObjectPath, thumbnailUrl } from '../lib/imageThumbs';
import imageThumbsSource from '../lib/imageThumbs.ts?raw';

/**
 * Thumbnail and public-media URLs are derived for the install's own bucket
 * (VITE_FIREBASE_STORAGE_BUCKET). A bucket written into the code would send every
 * other museum's thumbnails to SAHS's bucket, where they 404 or 403.
 */
const OWN = 'example-museum.firebasestorage.app';
const OTHER = 'some-other-archive.firebasestorage.app';

const tokenUrl = (bucket: string, path: string) =>
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=abc`;
const signedUrl = (bucket: string, path: string) =>
    `https://storage.googleapis.com/${bucket}/${path}?GoogleAccessId=x&Signature=y`;

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('media URLs follow the configured bucket', () => {
    it('derives URLs for objects in the configured bucket', () => {
        vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', OWN);

        expect(storageObjectPath(tokenUrl(OWN, 'archive_media/a b.png'))).toBe('archive_media/a b.png');
        expect(storageObjectPath(signedUrl(OWN, 'archive_media/x.png'))).toBe('archive_media/x.png');
        expect(thumbnailUrl(tokenUrl(OWN, 'archive_media/scan.png'), 260)).toBe(
            `https://storage.googleapis.com/${OWN}/archive_media/thumbs/scan_400x400.webp`,
        );
        expect(publicMediaUrl(tokenUrl(OWN, 'archive_media/a b.png'))).toBe(
            `https://storage.googleapis.com/${OWN}/archive_media/a%20b.png`,
        );
    });

    it('leaves objects in any other bucket alone', () => {
        vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', OWN);

        expect(thumbnailUrl(tokenUrl(OTHER, 'archive_media/scan.png'), 260)).toBeNull();
        expect(publicMediaUrl(signedUrl(OTHER, 'archive_media/scan.png'))).toBeNull();
    });

    it('derives nothing when no bucket is configured, so originals load as stored', () => {
        vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', '');

        expect(thumbnailUrl(tokenUrl(OWN, 'archive_media/scan.png'), 260)).toBeNull();
        expect(publicMediaUrl(tokenUrl(OWN, 'archive_media/scan.png'))).toBeNull();
    });

    it('has no bucket name written into the code', () => {
        expect(imageThumbsSource).not.toMatch(/['"`][a-z0-9-]+\.(firebasestorage\.app|appspot\.com)['"`]/);
    });
});
