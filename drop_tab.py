import os

file_path = '/home/catnolan/SAHS-archive-app/src/pages/ItemDetail.tsx'
with open(file_path, 'r') as f:
    content = f.read()

drop_tab_block = """
                    {/* RELATED ITEMS DROP TAB */}
                    {(relatedFigureItems.length > 0 || relatedDocumentItems.length > 0 || relatedOrganizationItems.length > 0) && (
                        <div className="mt-12">
                            <button 
                                onClick={() => setShowLinkedItems(!showLinkedItems)}
                                className="w-full flex items-center justify-between py-4 border-t border-tan-light/30 group hover:bg-tan-light/5 transition-colors text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <Link2 className="text-tan" size={20} />
                                    <span className="text-xl font-serif font-bold text-charcoal">Connected Archive Items</span>
                                    <span className="bg-tan/10 text-tan text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest font-sans">
                                        {relatedFigureItems.length + relatedDocumentItems.length + relatedOrganizationItems.length} Records
                                    </span>
                                </div>
                                <div className={`transition-transform duration-300 ${showLinkedItems ? 'rotate-180' : ''}`}>
                                    <ChevronDown className="text-tan" size={24} />
                                </div>
                            </button>

                            {showLinkedItems && (
                                <div className="py-10 animate-in slide-in-from-top-4 fade-in duration-300 space-y-12">
                                    {relatedDocumentItems.length > 0 && (
                                        <div>
                                            <h4 className="text-[11px] font-black text-tan uppercase tracking-[0.2em] mb-6 flex items-center gap-2 font-sans">
                                                <FileText size={14} /> Documents & Artifacts
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {relatedDocumentItems.map(relItem => (
                                                    <DocumentCard 
                                                        key={relItem.id} 
                                                        item={relItem} 
                                                        galleryIds={relatedDocumentItems.map(i => i.id || '')} 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {relatedOrganizationItems.length > 0 && (
                                        <div>
                                            <h4 className="text-[11px] font-black text-tan uppercase tracking-[0.2em] mb-6 flex items-center gap-2 font-sans">
                                                <Users size={14} /> Related Organizations
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {relatedOrganizationItems.map(relItem => (
                                                    <DocumentCard 
                                                        key={relItem.id} 
                                                        item={relItem} 
                                                        galleryIds={relatedOrganizationItems.map(i => i.id || '')} 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {relatedFigureItems.length > 0 && (
                                        <div>
                                            <h4 className="text-[11px] font-black text-tan uppercase tracking-[0.2em] mb-6 flex items-center gap-2 font-sans">
                                                <User size={14} /> Related Historical Figures
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {relatedFigureItems.map(relItem => (
                                                    <DocumentCard 
                                                        key={relItem.id} 
                                                        item={relItem} 
                                                        galleryIds={relatedFigureItems.map(i => i.id || '')} 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
"""

# Replace the old RELATED ITEMS SECTION
start_marker = "{/* RELATED ITEMS SECTION */}"
end_marker = "{(relatedFigureItems.length > 0 || relatedDocumentItems.length > 0 || relatedOrganizationItems.length > 0) && ("

# Find the end of that block.
# Actually, I'll just replace from the start marker to the end of the block.

start_idx = content.find(start_marker)
if start_idx != -1:
    # Find the matching closing div for the section.
    # The previous section ended with '    )}' before the '</div>' that closes flex-1.
    
    # I'll find the first ')}' after start_idx
    end_idx = content.find(')}', start_idx)
    if end_idx != -1:
        end_idx += 2 # include the closing brace
        content = content[:start_idx] + drop_tab_block + content[end_idx:]

with open(file_path, 'w') as f:
    f.write(content)
