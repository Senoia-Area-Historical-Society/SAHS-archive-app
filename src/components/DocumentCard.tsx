import { Link } from 'react-router-dom';
import type { ArchiveItem } from '../types/database';

export function DocumentCard({ item }: { item: ArchiveItem }) {
    const imageUrl = item.file_urls && item.file_urls.length > 0 ? item.file_urls[0] : null;
    const totalImages = item.file_urls ? item.file_urls.length : 0;

    return (
        <Link
            to={`/items/${item.id}`}
            className="bg-white border border-tan-light rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all flex flex-col group cursor-pointer"
        >
            <div className="aspect-[4/3] bg-tan-light/20 flex flex-col p-4 relative overflow-hidden">
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={item.title}
                        className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-tan-light bg-charcoal/5">
                        <span className="font-serif text-4xl opacity-20">{item.title.charAt(0)}</span>
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {totalImages > 1 && (
                    <span className="absolute top-3 right-3 bg-charcoal/80 text-white text-xs px-2.5 py-1 rounded-full font-medium z-10">
                        +{totalImages - 1} more
                    </span>
                )}
            </div>
            <div className="p-6 flex-1 flex flex-col bg-white z-10 relative">
                <h3 className="font-bold text-xl leading-tight mb-3 font-serif text-charcoal">{item.title}</h3>
                <p className="text-[15px] text-charcoal-light line-clamp-2 mb-6 font-sans leading-relaxed">{item.description}</p>
                <div className="flex items-center gap-3 mt-auto pt-2">
                    <span className="text-sm text-charcoal-light flex items-center gap-1.5 font-sans whitespace-nowrap">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        {item.date || 'Unknown Date'}
                    </span>
                    <span className="text-sm bg-beige text-charcoal-light px-3 py-1 rounded-full font-medium whitespace-nowrap font-sans">
                        {item.type || item.item_type}
                    </span>
                </div>
            </div>
        </Link>
    );
}
