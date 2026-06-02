import { Link } from 'react-router-dom';
import { Lock, X, Clock, XCircle, Calendar, Mic } from 'lucide-react';
import type { ArchiveItem } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { OptimizedImage } from './OptimizedImage';

export function DocumentCard({ 
    item, 
    galleryIds, 
    collectionId,
    onRemove 
}: { 
    item: ArchiveItem, 
    galleryIds?: string[],
    collectionId?: string,
    onRemove?: (e: React.MouseEvent) => void
}) {
    const { isEditingMode, isSAHSUser } = useAuth();
    const imageUrl = item.featured_image_url || (item.file_urls && item.file_urls.length > 0 ? item.file_urls[0] : null);
    const totalImages = item.file_urls ? item.file_urls.length : 0;

    return (
        <Link
            to={isEditingMode ? `/edit-item/${item.id}` : `/items/${item.id}`}
            state={{ galleryIds, collectionId }}
            className="bg-white border-2 border-tan-light/50 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] hover:border-tan transition-all flex flex-col group cursor-pointer"
        >
            <div className="aspect-[4/3] bg-tan-light/20 flex flex-col p-4 relative overflow-hidden">
                {imageUrl ? (
                    <OptimizedImage
                        src={imageUrl}
                        alt={item.title}
                        optimizedWidth={400}
                        className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-tan-light bg-charcoal/5">
                        {item.item_type === 'Oral History' ? (
                            <Mic size={48} className="opacity-40 animate-pulse text-tan" />
                        ) : (
                            <span className="font-serif text-4xl opacity-20">{item.title.charAt(0)}</span>
                        )}
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {/* Specific preservation status badges - Only for Artifacts */}
                {item.item_type === 'Artifact' ? (
                    <>
                        {item.collection_status === 'pending' && isSAHSUser && (
                            <span className="absolute top-3 left-3 bg-amber-600 text-white text-[10px] px-2 py-1 rounded font-black uppercase tracking-widest flex items-center gap-1 z-10 shadow-sm">
                                <Clock size={10} /> Pending
                            </span>
                        )}
                        {item.collection_status === 'deaccessioned' && isSAHSUser && (
                            <span className="absolute top-3 left-3 bg-red-700 text-white text-[10px] px-2 py-1 rounded font-black uppercase tracking-widest flex items-center gap-1 z-10 shadow-sm">
                                <XCircle size={10} /> Deaccessioned
                            </span>
                        )}
                        {item.collection_status === 'loan' && (
                            <span className="absolute top-3 left-3 bg-blue-600 text-white text-[10px] px-2 py-1 rounded font-black uppercase tracking-widest flex items-center gap-1 z-10 shadow-sm">
                                <Calendar size={10} /> On Loan
                            </span>
                        )}
                        {item.is_private && !['pending', 'deaccessioned'].includes(item.collection_status || '') && isSAHSUser && (
                            <span className="absolute top-3 left-3 bg-amber-500 text-white text-[10px] px-2 py-1 rounded font-black uppercase tracking-widest flex items-center gap-1 z-10 shadow-sm">
                                <Lock size={10} /> Private
                            </span>
                        )}
                    </>
                ) : (
                    item.is_private && isSAHSUser && (
                        <span className="absolute top-3 left-3 bg-amber-500 text-white text-[10px] px-2 py-1 rounded font-black uppercase tracking-widest flex items-center gap-1 z-10 shadow-sm">
                            <Lock size={10} /> Private
                        </span>
                    )
                )}
                {totalImages > 1 && (
                    <span className={`absolute top-3 ${onRemove && isSAHSUser ? 'right-12' : 'right-3'} bg-charcoal/80 text-white text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-widest z-10 transition-all`}>
                        {totalImages} Images
                    </span>
                )}
                {onRemove && isSAHSUser && (
                    <button
                        onClick={onRemove}
                        title="Remove from this location"
                        className="absolute top-3 right-3 p-1.5 bg-white/90 text-charcoal/40 hover:text-red-500 hover:bg-white rounded-lg transition-all z-20 shadow-md group/btn"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
            <div className="p-6 flex-1 flex flex-col bg-white z-10 relative">
                <h3 className="font-bold text-2xl leading-tight mb-2 font-serif text-charcoal group-hover:text-tan transition-colors">{item.title}</h3>
                {item.item_type === 'Historic Figure' && (item.also_known_as || item.occupation || item.birthplace) && (
                    <div className="mb-3 space-y-1">
                        {item.also_known_as && (
                            <p className="text-sm font-serif italic text-tan line-clamp-1">"{item.also_known_as}"</p>
                        )}
                        {(item.occupation || item.birthplace) && (
                            <p className="text-[12px] font-sans text-charcoal/60 font-medium uppercase tracking-wider line-clamp-1">
                                {item.occupation}{item.occupation && item.birthplace ? ' • ' : ''}{item.birthplace}
                            </p>
                        )}
                    </div>
                )}
                {item.item_type === 'Historic Organization' && item.alternative_names && (
                    <p className="text-sm font-serif italic text-tan mb-3 line-clamp-1">"{item.alternative_names}"</p>
                )}
                {item.item_type === 'Oral History' && (item.interviewer || item.interview_date) && (
                    <div className="mb-3 space-y-1">
                        {item.interviewer && (
                            <p className="text-[12px] font-sans text-charcoal/60 font-medium uppercase tracking-wider line-clamp-1">
                                Interviewer: {item.interviewer}
                            </p>
                        )}
                    </div>
                )}
                <p className={`text-base md:text-lg text-charcoal/80 line-clamp-3 mb-6 font-sans leading-relaxed ${
                    (item.item_type === 'Historic Figure' && (item.also_known_as || item.occupation || item.birthplace)) || 
                    (item.item_type === 'Historic Organization' && item.alternative_names) ||
                    (item.item_type === 'Oral History' && (item.interviewer || item.interview_date))
                    ? '' : 'mt-2'}`}>{item.description}</p>
                <div className="flex items-center flex-wrap gap-3 mt-auto pt-2">
                    <span className="text-sm text-charcoal-light flex items-center gap-1.5 font-sans">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        {item.item_type === 'Historic Figure' 
                            ? `${item.birth_date || '?'} — ${item.death_date || '?'}`
                            : item.item_type === 'Historic Organization'
                                ? `${item.founding_date || '?'} — ${item.dissolved_date || 'Present'}`
                                : item.item_type === 'Oral History'
                                    ? (item.interview_date || item.date || 'Unknown Date')
                                    : (item.date || 'Unknown Date')}
                    </span>
                    <span className="text-sm bg-beige/50 text-charcoal/70 px-4 py-1.5 rounded-full font-bold font-sans border border-tan-light/20">
                        {item.artifact_type || item.type || item.item_type}
                    </span>
                </div>
                
                <div className="mt-4 pt-4 border-t border-tan-light/10 flex items-center justify-between text-tan opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                    <span className="text-xs font-black uppercase tracking-widest">View Details</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </div>
            </div>
        </Link>
    );
}
