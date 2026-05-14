import { useState, useEffect } from 'react';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    optimizedWidth?: number;
    quality?: number;
}

export function OptimizedImage({ src, alt, optimizedWidth = 400, quality = 80, ...props }: OptimizedImageProps) {
    const [imgSrc, setImgSrc] = useState<string>('');
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!src) return;
        
        // Reset error state on src change
        setError(false);

        // Only use proxy for http/https URLs that aren't already proxied
        if (src.startsWith('http') && !src.includes('images.weserv.nl')) {
            const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=${optimizedWidth}&q=${quality}&output=webp&fit=cover`;
            setImgSrc(proxyUrl);
        } else {
            setImgSrc(src);
        }
    }, [src, optimizedWidth, quality]);

    if (!src) return null;

    return (
        <img
            src={error ? src : imgSrc}
            alt={alt}
            onError={() => {
                if (!error) {
                    console.warn(`Failed to load optimized image for ${src}, falling back to original.`);
                    setError(true);
                }
            }}
            loading="lazy"
            decoding="async"
            {...props}
        />
    );
}
