import { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import QRCode from 'qrcode';
import { QrCode, Printer, AlertCircle, Loader2 } from 'lucide-react';
import { useAppearance } from '../contexts/AppearanceContext';

export function BulkQRPrint() {
    const [idsInput, setIdsInput] = useState('');
    const [printSize, setPrintSize] = useState<'large' | 'small'>('small');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { settings } = useAppearance();

    const handlePrint = async () => {
        setError(null);
        
        // Parse IDs (split by comma, newline, or space, and remove empty)
        const rawIds = idsInput
            .split(/[\n, ]+/)
            .map(id => id.trim())
            .filter(id => id.length > 0);
            
        if (rawIds.length === 0) {
            setError('Please enter at least one artifact ID.');
            return;
        }

        // Deduplicate
        const targetIds = [...new Set(rawIds)];

        if (targetIds.length > 100) {
            setError('Please limit to 100 IDs at a time to prevent performance issues.');
            return;
        }

        setIsGenerating(true);

        try {
            // Firestore 'in' query supports max 10 items. So we chunk the queries.
            const chunks = [];
            for (let i = 0; i < targetIds.length; i += 10) {
                chunks.push(targetIds.slice(i, i + 10));
            }

            const items: any[] = [];
            
            for (const chunk of chunks) {
                const q = query(
                    collection(db, 'archive_items'),
                    where('artifact_id', 'in', chunk)
                );
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => {
                    items.push({ id: doc.id, ...doc.data() });
                });
            }

            if (items.length === 0) {
                setError('No items found matching those IDs.');
                setIsGenerating(false);
                return;
            }
            
            // Sort items to match input order
            items.sort((a, b) => {
                const aIndex = targetIds.indexOf(a.artifact_id?.toString() || '');
                const bIndex = targetIds.indexOf(b.artifact_id?.toString() || '');
                return aIndex - bIndex;
            });

            // Generate HTML for printing
            const isSmall = printSize === 'small';
            
            // Styles matching QRCodeDisplay.tsx
            const bodyStyle = isSmall 
                ? 'display: flex; flex-wrap: wrap; align-content: flex-start; margin: 0; background: #fff; gap: 0.25in; padding: 0.5in;'
                : 'display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0; font-family: serif; gap: 2in; padding: 1in;';
            const containerStyle = isSmall
                ? 'border: 1px solid #999; padding: 10px; text-align: center; width: 1.5in; height: 1.5in; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; background: #fff; page-break-inside: avoid;'
                : 'border: 2px solid #000; padding: 40px; text-align: center; page-break-inside: avoid;';
            const h1Style = isSmall
                ? 'margin: 6px 0 2px 0; font-size: 10px; font-weight: bold; font-family: sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; line-height: 1;'
                : 'margin-bottom: 5px; font-size: 24px; line-height: 1.2;';
            const pStyle = isSmall
                ? 'margin: 0; color: #666; font-size: 8px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; line-height: 1;'
                : 'margin-top: 0; color: #666; font-size: 16px;';
            const imgStyle = isSmall
                ? 'width: 96px; height: 96px; display: block; margin: 0 auto;'
                : 'width: 300px; height: 300px; display: block; margin: 0 auto;';

            let htmlContent = `
                <html>
                    <head>
                        <title>Bulk Print QR Codes</title>
                        <style>
                            @page { margin: 0.5in; }
                            body { ${bodyStyle} }
                            .container { ${containerStyle} }
                            h1 { ${h1Style} }
                            p { ${pStyle} }
                            img { ${imgStyle} }
                        </style>
                    </head>
                    <body>
            `;

            const origin = window.location.hostname === 'localhost' ? 'https://sahs-archives.web.app' : window.location.origin;

            for (const item of items) {
                const url = `${origin}/items/${item.id}`;
                const label = item.title || 'No Title';
                const subLabel = item.artifact_id || item.id;
                
                // Generate QR Code data URL
                const dataUrl = await QRCode.toDataURL(url, {
                    width: isSmall ? 192 : 600, // higher res for print
                    margin: 0,
                    errorCorrectionLevel: 'L'
                });

                htmlContent += `
                    <div class="container">
                        <img src="${dataUrl}" />
                        <h1>${label}</h1>
                        ${subLabel ? `<p>${subLabel}</p>` : ''}
                        ${!isSmall ? `<p style="margin-top: 20px; font-size: 12px; color: #999;">${settings.museumShortName || 'SAHS'} Archive Tracking System</p>` : ''}
                    </div>
                `;
            }

            htmlContent += `
                        <script>
                            window.onload = () => {
                                setTimeout(() => {
                                    window.print();
                                    window.onafterprint = () => window.close();
                                }, 500);
                            };
                        </script>
                    </body>
                </html>
            `;

            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(htmlContent);
                printWindow.document.close();
            } else {
                setError('Popup blocked. Please allow popups for this site to print labels.');
            }
            
            if (items.length < targetIds.length) {
                setError(`Printed ${items.length} labels. ${targetIds.length - items.length} IDs were not found.`);
            }

        } catch (err) {
            console.error('Error generating bulk QR codes:', err);
            setError('An error occurred while generating the QR codes. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h1 className="text-3xl font-serif font-bold text-charcoal mb-2 flex items-center gap-3">
                    <QrCode className="text-tan" size={32} />
                    Bulk QR Print
                </h1>
                <p className="text-charcoal/70">
                    Generate and print physical QR labels for multiple artifacts at once.
                </p>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-2xl border border-tan-light/50 shadow-sm space-y-6">
                
                {error && (
                    <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                        <AlertCircle className="shrink-0 mt-0.5" size={20} />
                        <p className="text-sm font-semibold">{error}</p>
                    </div>
                )}

                <div className="space-y-3">
                    <label htmlFor="ids" className="block text-sm font-bold text-charcoal">
                        Artifact IDs
                    </label>
                    <p className="text-xs text-charcoal/60">
                        Enter artifact IDs separated by commas, spaces, or new lines. (Max 100)
                    </p>
                    <textarea
                        id="ids"
                        value={idsInput}
                        onChange={(e) => setIdsInput(e.target.value)}
                        placeholder="e.g. 1096, 1113, 1145, 1178&#10;1208&#10;1209"
                        className="w-full h-48 px-4 py-3 bg-cream/30 border border-tan-light rounded-xl text-charcoal placeholder:text-charcoal/30 focus:outline-none focus:border-tan focus:ring-1 focus:ring-tan transition-all resize-y font-mono text-sm"
                    />
                </div>

                <div className="space-y-3">
                    <label className="block text-sm font-bold text-charcoal">
                        Print Size Format
                    </label>
                    <div className="flex gap-4">
                        <label className="flex-1 cursor-pointer">
                            <input 
                                type="radio" 
                                name="printSize" 
                                value="small" 
                                checked={printSize === 'small'}
                                onChange={() => setPrintSize('small')}
                                className="peer sr-only"
                            />
                            <div className="p-4 border-2 rounded-xl transition-all peer-checked:border-tan peer-checked:bg-tan/5 border-tan-light/50 hover:bg-cream">
                                <div className="font-bold text-charcoal mb-1">Small (1.5" x 1.5")</div>
                                <div className="text-xs text-charcoal/60">Best for small artifacts. Fits many per page.</div>
                            </div>
                        </label>
                        <label className="flex-1 cursor-pointer">
                            <input 
                                type="radio" 
                                name="printSize" 
                                value="large" 
                                checked={printSize === 'large'}
                                onChange={() => setPrintSize('large')}
                                className="peer sr-only"
                            />
                            <div className="p-4 border-2 rounded-xl transition-all peer-checked:border-tan peer-checked:bg-tan/5 border-tan-light/50 hover:bg-cream">
                                <div className="font-bold text-charcoal mb-1">Large (3" x 3")</div>
                                <div className="text-xs text-charcoal/60">Best for prominent displays or large items.</div>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="pt-4 border-t border-tan-light/30 flex justify-end">
                    <button
                        onClick={handlePrint}
                        disabled={isGenerating || !idsInput.trim()}
                        className="flex items-center gap-2 px-8 py-3.5 bg-tan text-white rounded-xl font-bold hover:bg-charcoal transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-[0.98]"
                    >
                        {isGenerating ? (
                            <><Loader2 className="animate-spin" size={20} /> Generating Labels...</>
                        ) : (
                            <><Printer size={20} /> Generate & Print Labels</>
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
}
