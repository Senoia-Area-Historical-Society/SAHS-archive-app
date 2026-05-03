import os

file_path = '/home/catnolan/SAHS-archive-app/src/pages/ItemDetail.tsx'
with open(file_path, 'r') as f:
    content = f.read()

related_block = """
                    {/* RELATED ITEMS SECTION */}
                    {(relatedFigureItems.length > 0 || relatedDocumentItems.length > 0 || relatedOrganizationItems.length > 0) && (
                        <div className="mt-12 pt-8 border-t border-tan-light/30">
                            <h3 className="text-xl font-serif font-bold text-charcoal flex items-center gap-2 mb-8">
                                <Link2 className="text-tan" size={20} />
                                Connected Archive Items
                            </h3>

                            <div className="space-y-12">
                                {relatedDocumentItems.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
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
                                        <h4 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
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
                                        <h4 className="text-xs font-black text-tan uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
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
                        </div>
                    )}
"""

# We want to insert this AFTER the mb-12 div that ends before Keep Exploring Section
# The marker we can use is the end of the information section we just fixed.

target = "</div>\\n                </div>\\n            </div>\\n{/* Keep Exploring Section */}"
# Wait, let's use a simpler search.

# Find '{/* Keep Exploring Section */}'
marker = "{/* Keep Exploring Section */}"
idx = content.find(marker)

if idx != -1:
    # Find the second </div> BEFORE this marker
    # 1st is lg:flex-row
    # 2nd is flex-1
    # We want to insert INSIDE flex-1, so after its last child (the mb-12 div).
    
    # Actually, the structure was:
    # <div className="flex-1 flex flex-col">
    #    <div className="mb-12"> ... </div>
    #    {/* INSERT HERE */}
    # </div>
    
    # Find the </div> that closes mb-12. It's the first one before the two final ones.
    
    # I'll find the grid closing divs and the item_type ternary closer.
    # Actually, let's just find the closing tag for mb-12.
    
    # Looking at my previous sed output:
    # 828:                    </div>
    # 829:                </div>
    # 830:            </div>
    # 831: {/* Keep Exploring Section */}
    
    # So I want to insert before line 829.
    
    # I'll search backwards from idx for '</div>' twice.
    last_div = content.rfind('</div>', 0, idx) # 830
    prev_div = content.rfind('</div>', 0, last_div) # 829
    
    if prev_div != -1:
        content = content[:prev_div] + related_block + content[prev_div:]

with open(file_path, 'w') as f:
    f.write(content)
