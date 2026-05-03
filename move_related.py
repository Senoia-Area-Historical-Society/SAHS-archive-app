import os

file_path = '/home/catnolan/SAHS-archive-app/src/pages/ItemDetail.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Extract the Related Items block
start_marker = "{/* RELATED ITEMS DROP TAB */}"
end_marker = "                </div>\n            </div>" # These are the divs that follow the related block

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx != -1 and end_idx != -1:
    # Find the end of the related items block (the ')}' at line 905)
    block_end_idx = content.rfind(')}', start_idx, end_idx)
    if block_end_idx != -1:
        block_end_idx += 2
        
        related_block = content[start_idx:block_end_idx]
        
        # Remove the block from its current position
        content = content[:start_idx] + content[block_end_idx:]
        
        # Now find the place to insert it.
        # It should be AFTER the two closing divs we just found (flex-1 and lg:flex-row)
        # and BEFORE the Keep Exploring Section.
        
        keep_exploring_marker = "{/* Keep Exploring Section */}"
        insert_idx = content.find(keep_exploring_marker)
        
        if insert_idx != -1:
            # We want to insert it right before the keep exploring marker.
            # But let's add some spacing and adjust the mt-12 in the block.
            
            # Adjust the mt-12 to mt-16 for consistency with Keep Exploring
            related_block = related_block.replace('className="mt-12"', 'className="mt-16"')
            
            content = content[:insert_idx] + related_block + "\n\n            " + content[insert_idx:]

with open(file_path, 'w') as f:
    f.write(content)
