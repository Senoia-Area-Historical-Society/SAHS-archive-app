import re
import os

file_path = '/home/catnolan/SAHS-archive-app/src/pages/ItemDetail.tsx'
with open(file_path, 'r') as f:
    content = f.read()

start_comment = '{/* SEAMLESS INFORMATION SECTION */}'
end_comment = '{/* Keep Exploring Section */}'

start_index = content.find(start_comment)
end_index = content.find(end_comment)

if start_index == -1 or end_index == -1:
    print(f"Error: Comments not found. Start: {start_index}, End: {end_index}")
    exit(1)

# Extract the part before and after the section
prefix = content[:start_index]
suffix = content[end_index:]

# New layout for the Information section
new_section = """{/* SEAMLESS INFORMATION SECTION */}
                    <div className="mb-12">
                        <h3 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2 border-b border-tan-light/50 pb-4 mb-8">
                            <Info className="text-tan" size={24} />
                            Information & Archival Details
                        </h3>

                        {item.item_type === 'Historic Figure' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
                                {/* Column 1: Identity & Life */}
                                <div className="space-y-8">
                                    <div>
                                        <h4 className="text-[11px] font-black text-tan uppercase tracking-[0.3em] mb-6 pb-2 border-b border-tan/10">Personal Identity</h4>
                                        <div className="space-y-6">
                                            {item.full_name && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Full Name</p>
                                                    <p className="text-xl font-serif text-charcoal leading-tight">{item.full_name}</p>
                                                </div>
                                            )}
                                            {(item.birth_date || item.death_date) && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Dates of Life</p>
                                                    <div className="flex flex-wrap gap-x-10 gap-y-4">
                                                        {item.birth_date && (
                                                            <div>
                                                                <span className="text-[10px] font-bold text-tan uppercase tracking-widest block mb-1">Birth</span>
                                                                <p className="text-lg font-serif text-charcoal">{item.birth_date}</p>
                                                            </div>
                                                        )}
                                                        {item.death_date && (
                                                            <div>
                                                                <span className="text-[10px] font-bold text-tan uppercase tracking-widest block mb-1">Death</span>
                                                                <p className="text-lg font-serif text-charcoal">{item.death_date}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {item.birthplace && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Birthplace</p>
                                                    <p className="text-lg font-serif text-charcoal">{item.birthplace}</p>
                                                </div>
                                            )}
                                            {item.occupation && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Primary Occupation</p>
                                                    <p className="text-lg font-serif text-charcoal">{item.occupation}</p>
                                                </div>
                                            )}
                                            {item.historical_address && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                                        <MapPin size={12} className="text-tan" /> Historical Address
                                                    </p>
                                                    <p className="text-lg font-serif text-charcoal leading-snug">{item.historical_address}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Column 2: Archival Registry */}
                                <div className="space-y-8">
                                    <div>
                                        <h4 className="text-[11px] font-black text-tan uppercase tracking-[0.3em] mb-6 pb-2 border-b border-tan/10">Archival Registry</h4>
                                        <div className="space-y-6">
                                            {item.artifact_id && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans text-tan">Catalog ID #</p>
                                                    <p className="text-xl font-serif font-bold text-tan">{item.artifact_id}</p>
                                                </div>
                                            )}
                                            {(item.archive_reference || item.identifier) && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Archival References</p>
                                                    <p className="text-base font-sans text-charcoal/80 leading-relaxed font-medium">
                                                        {item.archive_reference}
                                                        {item.identifier && <span className="block italic opacity-60 mt-1">{item.identifier}</span>}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-12">
                                {/* Personal / Type Facts */}
                                <div className="space-y-6">
                                    {item.item_type === 'Historic Organization' && (
                                        <>
                                            {item.org_name && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Official Name</p>
                                                    <p className="text-lg font-serif text-charcoal">{item.org_name}</p>
                                                </div>
                                            )}
                                            {(item.founding_date || item.dissolved_date) && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Organization Lifespan</p>
                                                    <p className="text-lg font-serif text-charcoal">
                                                        {item.founding_date || '?'} — {item.dissolved_date || 'Present'}
                                                    </p>
                                                </div>
                                            )}
                                            {item.alternative_names && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Alternative / Former Names</p>
                                                    <p className="text-lg font-serif text-charcoal">{item.alternative_names}</p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {!['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Category</p>
                                            <p className="text-lg font-serif text-charcoal">{item.item_type}</p>
                                            {item.category && item.item_type !== 'Artifact' && (
                                                <span className="inline-block bg-tan/10 text-tan px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-tan/20 mt-2 capitalize font-sans">
                                                    {item.category}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                        {collectionsData.length > 0 && !['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && (
                                            <div>
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Part of Collection{collectionsData.length > 1 ? 's' : ''}</p>
                                                <div className="flex flex-col gap-2">
                                                    {collectionsData.map(col => (
                                                        <Link key={col.id} to={`/collections/${col.id}`} className="text-lg font-serif text-tan hover:underline inline-flex items-center gap-1.5 align-top">
                                                            <BookOpen size={16} />
                                                            {col.title}
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    {item.condition && item.item_type !== 'Historic Figure' && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Condition</p>
                                            <span className="inline-block bg-tan-light/10 text-charcoal/80 px-2.5 py-0.5 rounded-full text-[12px] font-bold border border-tan-light/30 mt-1 font-sans">
                                                {item.condition}
                                            </span>
                                        </div>
                                    )}
                                    {item.date && item.item_type !== 'Historic Figure' && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Origin Date</p>
                                            <p className="text-lg font-serif text-charcoal">{item.date}</p>
                                        </div>
                                    )}
                                    {item.creator && !['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Creator / Author</p>
                                            <p className="text-lg font-serif text-charcoal">{item.creator}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Column 2: Context / Donor Details */}
                                <div className="space-y-6">
                                    {item.item_type === 'Artifact' && (
                                        <>
                                            {item.donor && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Original Donor</p>
                                                    <p className="text-lg font-serif text-charcoal">{item.donor}</p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {item.item_type === 'Historic Organization' && (
                                        <>
                                            {item.creator && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Media / Data Contributor</p>
                                                    <p className="text-lg font-serif text-charcoal">{item.creator}</p>
                                                </div>
                                            )}
                                            {item.historical_address && (
                                                <div>
                                                    <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                                        <MapPin size={12} className="text-tan" /> Historical Address
                                                    </p>
                                                    <p className="text-lg font-serif text-charcoal leading-snug">{item.historical_address}</p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Archival Tracking */}
                                <div className="space-y-6">
                                    {item.artifact_id && item.item_type !== 'Historic Figure' && item.item_type !== 'Historic Organization' && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans text-tan">Catalog ID #</p>
                                            <p className="text-lg font-serif font-bold text-tan">{item.artifact_id}</p>
                                        </div>
                                    )}
                                    {(item.archive_reference || item.identifier) && item.item_type !== 'Historic Figure' && item.item_type !== 'Historic Organization' && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans">Archival References</p>
                                            <p className="text-sm font-sans text-charcoal/80 leading-relaxed font-medium">
                                                {item.archive_reference}
                                                {item.identifier && <span className="block italic opacity-60 mt-0.5">{item.identifier}</span>}
                                            </p>
                                        </div>
                                    )}
                                    {item.physical_location && item.item_type !== 'Historic Figure' && item.item_type !== 'Historic Organization' && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                                <MapPin size={12} className="text-tan" /> Origin / Location
                                            </p>
                                            <p className="text-[15px] font-sans text-charcoal leading-snug">{item.physical_location}</p>
                                        </div>
                                    )}
                                    {item.historical_address && !['Historic Figure', 'Historic Organization'].includes(item.item_type.trim()) && (
                                        <div>
                                            <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] mb-2 font-sans flex items-center gap-1.5 align-top">
                                                <MapPin size={12} className="text-tan" /> Historical Address
                                            </p>
                                            <p className="text-[15px] font-sans text-charcoal leading-snug">{item.historical_address}</p>
                                        </div>
                                    )}
                                    {(item.museum_location_id || item.museum_location || isSAHSUser) && item.item_type !== 'Historic Figure' && item.item_type !== 'Historic Organization' && (
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs font-black text-charcoal/40 uppercase tracking-[0.2em] font-sans">Physical Museum Shelf/Box</p>
                                                {isSAHSUser && !isEditingLocation && (
                                                    <button onClick={handleEditLocationClick} className="text-[10px] text-tan hover:text-tan-light bg-tan/10 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition-colors">
                                                        <Edit2 size={10} /> Link
                                                    </button>
                                                )}
                                            </div>
                                            
                                            {isEditingLocation ? (
                                                <div className="flex flex-col gap-3 mt-2 bg-cream/30 p-3 rounded-xl border border-tan-light/50">
                                                    <select 
                                                        value={newLocationId} 
                                                        onChange={(e) => setNewLocationId(e.target.value)}
                                                        className="w-full bg-white border border-tan-light/50 p-2.5 rounded-lg text-sm outline-none focus:border-tan font-sans"
                                                        disabled={isSavingLocation}
                                                    >
                                                        <option value="">-- No Location (Unassigned) --</option>
                                                        {[...allLocations].sort((a,b) => a.name.localeCompare(b.name)).map(loc => (
                                                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                                                        ))}
                                                    </select>
                                                    <div className="flex gap-2 justify-end">
                                                        <button onClick={() => setIsEditingLocation(false)} disabled={isSavingLocation} className="text-xs font-bold text-charcoal/50 hover:text-charcoal px-3 py-1.5 transition-colors">Cancel</button>
                                                        <button onClick={handleSaveLocation} disabled={isSavingLocation} className="text-xs font-bold bg-tan text-white px-4 py-1.5 rounded-lg hover:bg-charcoal transition-colors shadow-sm relative">
                                                            {isSavingLocation ? 'Saving...' : 'Confirm'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {(item.museum_location_ids && item.museum_location_ids.length > 0) || item.museum_location_id ? (
                                                        <div className="flex flex-col gap-2">
                                                            {Array.from(new Set([...(item.museum_location_ids || []), ...(item.museum_location_id ? [item.museum_location_id] : [])])).map(locId => {
                                                                const locObj = allLocations.find(l => l.id === locId);
                                                                return (
                                                                    <Link key={locId} to={`/location/${locId}`} className="text-lg font-serif text-tan hover:underline flex items-center gap-2">
                                                                        <MapPin size={18} />
                                                                        {locObj?.name || 'Loading location...'}
                                                                    </Link>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p className="text-lg font-serif text-charcoal/40 italic">Not currently placed on museum blueprint</p>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
"""

new_content = prefix + new_section + suffix

with open(file_path, 'w') as f:
    f.write(new_content)
