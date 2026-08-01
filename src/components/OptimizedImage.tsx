import { useState, useEffect } from 'react';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    optimizedWidth?: number;
    quality?: number;
    priority?: boolean;
}

function resolveImageSrc(src: string, optimizedWidth: number, quality: number): string {
    if (!src) return '';
    // Skip proxying for Firebase Storage & Google Cloud CDN - load directly for maximum speed
    const isGoogleStorage = src.includes('firebasestorage.googleapis.com') || 
                            src.includes('storage.googleapis.com') ||
                            src.includes('googleusercontent.com');
                            
    if (src.startsWith('http') && !src.includes('images.weserv.nl') && !isGoogleStorage) {
        return `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=${optimizedWidth}&q=${quality}&output=webp&fit=cover`;
    }
    return src;
}

export function OptimizedImage({ src, alt, optimizedWidth = 400, quality = 80, priority = false, ...props }: OptimizedImageProps) {
    const [imgSrc, setImgSrc] = useState<string>(() => resolveImageSrc(src, optimizedWidth, quality));
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!src) return;
        setError(false);
        setImgSrc(resolveImageSrc(src, optimizedWidth, quality));
    }, [src, optimizedWidth, quality]);

    if (!src) return null;

    return (
        <img
            src={error ? src : (imgSrc || src)}
            alt={alt}
            onError={() => {
                if (!error) {
                    setError(true);
                }
            }}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            {...(priority ? ({ fetchpriority: 'high' } as any) : {})}
            {...props}
        />
    );
}
