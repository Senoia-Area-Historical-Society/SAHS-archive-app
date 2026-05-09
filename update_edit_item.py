import os

file_path = '/home/catnolan/SAHS-archive-app/src/pages/EditItem.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Add import
import_line = "import { convertPdfToPngs } from '../lib/pdfUtils';"
new_import = "import { convertPdfToPngs } from '../lib/pdfUtils';\nimport { convertHeicToPng } from '../lib/imageUtils';"
content = content.replace(import_line, new_import)

# 2. Add state
state_line = "const [isConvertingPdf, setIsConvertingPdf] = useState(false);"
new_state = state_line + "\n    const [isConvertingHeic, setIsConvertingHeic] = useState(false);"
content = content.replace(state_line, new_state)

# 3. Update processFiles
old_process_files = """    const processFiles = async (files: FileList | File[]) => {
        const fileArray = Array.from(files);
        const finalFiles: File[] = [];
        
        const hasPdf = fileArray.some(f => f.type === 'application/pdf');
        if (hasPdf) {
            setIsConvertingPdf(true);
            setPdfConvertProgress(0);
        }

        try {
            const newItems: { id: string, type: 'new', value: File }[] = [];
            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                if (file.type === 'application/pdf') {
                    const pngs = await convertPdfToPngs(file, (p) => {
                        setPdfConvertProgress(p);
                    });
                    newItems.push(...pngs.map((f, idx) => ({ id: `new-${Date.now()}-${i}-${idx}`, type: 'new' as const, value: f })));
                } else {
                    newItems.push({ id: `new-${Date.now()}-${i}`, type: 'new' as const, value: file });
                }
            }
            setMediaItems(prev => [...prev, ...newItems]);"""

new_process_files = """    const processFiles = async (files: FileList | File[]) => {
        const fileArray = Array.from(files);
        const finalFiles: File[] = [];
        
        const hasPdf = fileArray.some(f => f.type === 'application/pdf');
        const hasHeic = fileArray.some(f => f.name.toLowerCase().endsWith('.heic') || f.name.toLowerCase().endsWith('.heif'));
        
        if (hasPdf) {
            setIsConvertingPdf(true);
            setPdfConvertProgress(0);
        }
        if (hasHeic) {
            setIsConvertingHeic(true);
        }

        try {
            const newItems: { id: string, type: 'new', value: File }[] = [];
            for (let i = 0; i < fileArray.length; i++) {
                let file = fileArray[i];
                
                // HEIC Conversion
                if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
                    file = await convertHeicToPng(file);
                }

                if (file.type === 'application/pdf') {
                    const pngs = await convertPdfToPngs(file, (p) => {
                        setPdfConvertProgress(p);
                    });
                    newItems.push(...pngs.map((f, idx) => ({ id: `new-${Date.now()}-${i}-${idx}`, type: 'new' as const, value: f })));
                } else {
                    newItems.push({ id: `new-${Date.now()}-${i}`, type: 'new' as const, value: file });
                }
            }
            setMediaItems(prev => [...prev, ...newItems]);"""

content = content.replace(old_process_files, new_process_files)

# 4. Update finally block
finally_block = """        } finally {
            setIsConvertingPdf(false);
            setPdfConvertProgress(0);
        }"""
new_finally = """        } finally {
            setIsConvertingPdf(false);
            setIsConvertingHeic(false);
            setPdfConvertProgress(0);
        }"""
content = content.replace(finally_block, new_finally)

# 5. Add overlay in JSX
# Need to find where it is in EditItem.tsx
# In EditItem it might be different. Let's check.
content = content.replace("{isConvertingPdf ? (", """{isConvertingHeic ? (
                                    <div className="flex flex-col items-center gap-3 mt-4">
                                        <div className="w-8 h-8 border-4 border-tan border-t-transparent rounded-full animate-spin"></div>
                                        <p className="font-bold text-charcoal">Converting iPhone Image (HEIC)...</p>
                                        <p className="text-xs text-charcoal/60">Optimizing for web preservation</p>
                                    </div>
                                ) : isConvertingPdf ? (""")

with open(file_path, 'w') as f:
    f.write(content)
