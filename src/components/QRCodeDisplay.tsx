import { QRCodeCanvas } from 'qrcode.react';
import { Download, Printer, Maximize2, X, Copy, Check } from 'lucide-react';
import { useRef, useState } from 'react';

interface QRCodeDisplayProps {
    value: string;
    label: string;
    subLabel?: string;
    size?: number;
}

export function QRCodeDisplay({ value, label, subLabel, size = 160 }: QRCodeDisplayProps) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [printSize, setPrintSize] = useState<'large' | 'small'>('large');

    const downloadQRCode = (e: React.MouseEvent) => {
        e.stopPropagation();
        const canvas = canvasRef.current?.querySelector('canvas');
        if (canvas) {
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `qrcode-${label.replace(/\s+/g, '-').toLowerCase()}.png`;
            link.href = url;
            link.click();
        }
    };

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePrint = (e: React.MouseEvent) => {
        e.stopPropagation();
        const canvas = canvasRef.current?.querySelector('canvas');
        if (!canvas) return;

        const dataUrl = canvas.toDataURL('image/png');
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const isSmall = printSize === 'small';
        const bodyStyle = isSmall 
            ? 'display: flex; align-items: flex-start; justify-content: flex-start; margin: 0; background: #fff;'
            : 'display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: serif;';
        const containerStyle = isSmall
            ? 'border: 1px solid #999; padding: 10px; text-align: center; width: 1.5in; height: 1.5in; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; background: #fff;'
            : 'border: 2px solid #000; padding: 40px; text-align: center;';
        const h1Style = isSmall
            ? 'margin: 6px 0 2px 0; font-size: 10px; font-weight: bold; font-family: sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;'
            : 'margin-bottom: 5px; font-size: 24px;';
        const pStyle = isSmall
            ? 'margin: 0; color: #666; font-size: 8px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;'
            : 'margin-top: 0; color: #666; font-size: 16px;';
        const imgStyle = isSmall
            ? 'width: 96px; height: 96px;'
            : 'width: 300px; height: 300px;';

        printWindow.document.write(`
            <html>
                <head>
                    <title>Print QR Code - ${label}</title>
                    <style>
                        body { ${bodyStyle} }
                        .container { ${containerStyle} }
                        h1 { ${h1Style} }
                        p { ${pStyle} }
                        img { ${imgStyle} }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <img src="${dataUrl}" />
                        <h1>${label}</h1>
                        ${subLabel ? `<p>${subLabel}</p>` : ''}
                        ${!isSmall ? `<p style="margin-top: 20px; font-size: 12px; color: #999;">SAHS Archive Tracking System</p>` : ''}
                    </div>
                    <script>
                        window.onload = () => {
                            window.print();
                            window.onafterprint = () => window.close();
                        };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <>
            <div 
                onClick={() => setIsExpanded(true)}
                className="group relative flex flex-col items-center gap-3 p-4 bg-white rounded-2xl border border-tan-light/30 shadow-sm transition-all hover:shadow-md hover:border-tan/30 cursor-pointer w-full max-w-[200px]"
            >
                <div ref={canvasRef} className="p-2 bg-white rounded-lg group-hover:scale-105 transition-transform duration-300">
                    <QRCodeCanvas 
                        value={value} 
                        size={size}
                        level="L"
                        includeMargin={false}
                    />
                </div>
                
                <div className="text-center w-full overflow-hidden">
                    <h3 className="font-serif font-bold text-sm text-charcoal truncate">{label}</h3>
                    {subLabel && <p className="text-[10px] text-charcoal/40 truncate mt-0.5 uppercase tracking-widest">{subLabel}</p>}
                </div>

                <div className="absolute top-2 right-2 p-1.5 bg-white/80 rounded-full text-tan opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm border border-tan-light/30 shadow-sm">
                    <Maximize2 size={14} />
                </div>
            </div>

            {/* Premium Modal Popup */}
            {isExpanded && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/40 backdrop-blur-md animate-in fade-in duration-300"
                    onClick={() => setIsExpanded(false)}
                >
                    <div 
                        className="bg-white rounded-[2rem] shadow-2xl p-8 md:p-12 max-w-lg w-full relative animate-in zoom-in slide-in-from-bottom-8 duration-500"
                        onClick={e => e.stopPropagation()}
                    >
                        <button 
                            onClick={() => setIsExpanded(false)}
                            className="absolute top-6 right-6 p-2 text-charcoal/40 hover:text-charcoal hover:bg-black/5 rounded-full transition-all"
                        >
                            <X size={24} />
                        </button>

                        <div className="flex flex-col items-center text-center">
                            <div className="mb-2">
                                <span className="text-[10px] font-black text-tan uppercase tracking-[0.3em] bg-tan/10 px-3 py-1 rounded-full">Tracking Code</span>
                            </div>
                            <h2 className="text-2xl md:text-3xl font-serif font-bold text-charcoal mb-2">{label}</h2>
                            {subLabel && <p className="text-charcoal/60 mb-8">{subLabel}</p>}

                            <div className="p-6 bg-cream/30 rounded-3xl mb-8 shadow-inner border border-tan-light/20">
                                <QRCodeCanvas 
                                    value={value} 
                                    size={280}
                                    level="L"
                                    includeMargin={true}
                                />
                            </div>

                            <div className="w-full space-y-3">
                                {/* Print Size Selector */}
                                <div className="flex items-center justify-between gap-4 bg-tan/5 p-3 rounded-2xl border border-tan/10 w-full mb-1">
                                    <span className="text-xs font-bold text-charcoal/60 uppercase tracking-wider">Print Label Size:</span>
                                    <div className="flex bg-cream/80 p-1 rounded-xl border border-tan-light/40">
                                        <button
                                            type="button"
                                            onClick={() => setPrintSize('large')}
                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                printSize === 'large'
                                                    ? 'bg-tan text-white shadow-sm'
                                                    : 'text-charcoal/60 hover:text-charcoal'
                                            }`}
                                        >
                                            Large (3")
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPrintSize('small')}
                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                printSize === 'small'
                                                    ? 'bg-tan text-white shadow-sm'
                                                    : 'text-charcoal/60 hover:text-charcoal'
                                            }`}
                                        >
                                            Small (1.5")
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={downloadQRCode}
                                        className="flex-1 flex items-center justify-center gap-2 bg-tan text-white px-6 py-4 rounded-xl font-bold hover:bg-charcoal transition-all shadow-md active:scale-95"
                                    >
                                        <Download size={20} /> Download PNG
                                    </button>
                                    <button
                                        onClick={handlePrint}
                                        className="flex-1 flex items-center justify-center gap-2 bg-white border-2 border-tan-light/50 text-charcoal px-6 py-4 rounded-xl font-bold hover:bg-cream transition-all active:scale-95"
                                    >
                                        <Printer size={20} /> Print Label
                                    </button>
                                </div>
                                
                                <button
                                    onClick={handleCopy}
                                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-charcoal/50 hover:text-tan transition-colors py-2"
                                >
                                    {copied ? (
                                        <><Check size={14} className="text-green-500" /> Copied URL</>
                                    ) : (
                                        <><Copy size={14} /> Copy Linking URL</>
                                    )}
                                </button>
                                
                                <p className="text-[10px] text-charcoal/30 font-serif italic mt-4 max-w-xs mx-auto">
                                    Scanning this code outside the app will direct you to the artifact's digital record.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

