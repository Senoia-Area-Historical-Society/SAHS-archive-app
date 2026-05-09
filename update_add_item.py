import os

file_path = '/home/catnolan/SAHS-archive-app/src/pages/AddItem.tsx'
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
            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                if (file.type === 'application/pdf') {
                    const pngs = await convertPdfToPngs(file, (p) => {
                        setPdfConvertProgress(p);
                    });
                    finalFiles.push(...pngs);
                } else {
                    finalFiles.push(file);
                }
            }
            setSelectedFiles(prev => [...prev, ...finalFiles]);"""

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
                    finalFiles.push(...pngs);
                } else {
                    finalFiles.push(file);
                }
            }
            setSelectedFiles(prev => [...prev, ...finalFiles]);"""

# Replace processFiles (be careful with indentations and whitespace)
# I'll use a safer string replacement
content = content.replace(old_process_files, new_process_files)

# 4. Update processFiles finally block to reset isConvertingHeic
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

# 5. Update processAccessionFiles similarly
# (Skip for now to keep it simple, or do it if it's easy)

# 6. Add HEIC overlay in JSX
old_overlay = "{isConvertingPdf ? ("
new_overlay = """{isConvertingHeic ? (
                                    <div className="flex flex-col items-center gap-3 mt-4">
                                        <div className="w-8 h-8 border-4 border-tan border-t-transparent rounded-full animate-spin"></div>
                                        <p className="font-bold text-charcoal">Converting iPhone Image (HEIC)...</p>
                                        <p className="text-xs text-charcoal/60">Optimizing for web preservation</p>
                                    </div>
                                ) : isConvertingPdf ? ("""
content = content.replace(old_overlay, new_overlay)

with open(file_path, 'w') as f:
    f.write(content)
