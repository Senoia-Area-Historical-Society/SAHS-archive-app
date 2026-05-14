// pdfjs-dist is dynamically imported below to reduce initial bundle size

/**
 * Converts a PDF file into an array of PNG File objects, one for each page.
 * @param file The original PDF File object
 * @param onProgress Optional callback to report conversion progress
 * @returns Array of PNG File objects
 */
export async function convertPdfToPngs(
    file: File, 
    onProgress?: (progress: number) => void
): Promise<File[]> {
    // Dynamic imports to keep PDF processing out of the main bundle
    const pdfjsLib = await import('pdfjs-dist');
    const pdfWorker = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    const numPages = pdf.numPages;
    const pngFiles: File[] = [];

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        // Scale 2.5 gives a good high-resolution image suitable for archive display and zooming
        const scale = 2.5; 
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) continue;
        
        // Ensure background is white
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
            canvas: canvas as unknown as HTMLCanvasElement, // Added to fix typing
        };

        // Wait for page rendering to finish
        await page.render(renderContext).promise;

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/png');
        });

        if (blob) {
            const baseName = file.name.replace(/\.pdf$/i, '');
            const newFileName = `${baseName}_page-${i}.png`;
            const pngFile = new File([blob], newFileName, { type: 'image/png' });
            pngFiles.push(pngFile);
        }
        
        if (onProgress) {
            onProgress(Math.round((i / numPages) * 100));
        }
    }

    return pngFiles;
}
