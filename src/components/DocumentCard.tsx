import { Link } from 'react-router-dom';
import type { ArchiveItem } from '../types/database';

export function DocumentCard({ item }: { item: ArchiveItem }) {
    const imageUrl = item.file_urls && item.file_urls.length > 0 ? item.file_urls[0] : null;
    const totalImages = item.file_urls ? item.file_urls.length : 0;

    return (
        <Link
            to={`/items/${item.id}`}
            className="bg-white border border-tan-light/50 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col group cursor-pointer"
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
            <div className="p-5 flex-1 flex flex-col bg-white z-10 relative">
                <h3 className="font-bold text-lg leading-tight mb-2 font-serif">{item.title}</h3>
                <p className="text-sm text-charcoal/70 line-clamp-2 mb-4 font-sans leading-relaxed">{item.description}</p>
                <div className="flex items-center justify-between mt-auto pt-2">
                    <span className="text-xs text-charcoal/60 flex items-center gap-1 font-medium">{item.date}</span>
                    <span className="text-[10px] sm:text-xs bg-tan-light text-charcoal px-2.5 py-1 rounded-full font-medium uppercase tracking-wider">
                        {item.type || item.item_type}
                    </span>
                </div>
            </div>
        </Link>
    );
}
