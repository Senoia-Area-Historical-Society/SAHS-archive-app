import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';

interface QRScannerProps {
    onScan: (data: string) => void;
    onClose?: () => void;
    active?: boolean;
}

export function QRScanner({ onScan, onClose, active = true }: QRScannerProps) {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const hasScannedRef = useRef<boolean>(false);
    const activeTracksRef = useRef<MediaStreamTrack[]>([]);
    
    // Default to a 1x-5x slider immediately so all devices can utilize at least Digital Zoom for centering/aiming
    const [zoomParams, setZoomParams] = useState<{ min: number, max: number, step: number } | null>({ min: 1, max: 5, step: 0.1 });
    const [zoomLevel, setZoomLevel] = useState(1);

    // Completely forces the hardware camera light to go off by stopping tracks we intercepted
    const forceKillVideoTracks = () => {
        activeTracksRef.current.forEach(track => {
            try { track.stop(); } catch (e) { /* ignore */ }
        });
        activeTracksRef.current = [];
        
        // Failsafe for the DOM element if attached
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach(video => {
            if (video.srcObject) {
                const stream = video.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
                video.srcObject = null;
            }
        });
    };

    useEffect(() => {
        if (!active) return;
        hasScannedRef.current = false;

        // Intercept WebRTC track requests so we can guarantee their destruction later, and access advanced hardware capabilities like Zoom!
        const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
        if (navigator.mediaDevices && originalGetUserMedia) {
            navigator.mediaDevices.getUserMedia = async (constraints) => {
                const stream = await originalGetUserMedia(constraints);
                const track = stream.getVideoTracks()[0];
                if (track) {
                    activeTracksRef.current.push(track);
                    setTimeout(() => {
                        try {
                            const capabilities = track.getCapabilities ? track.getCapabilities() : {} as any;
                            const settings = track.getSettings ? track.getSettings() : {} as any;
                            if (capabilities.zoom) {
                                setZoomParams({
                                    min: capabilities.zoom.min || 1,
                                    max: capabilities.zoom.max || 5,
                                    step: capabilities.zoom.step || 0.1
                                });
                                setZoomLevel(settings.zoom || 1);
                            }
                        } catch (e) { console.error("Could not fetch camera zoom capabilities:", e); }
                    }, 500);
                }
                return stream;
            };
        }

        // Initialize scanner
        // We request high resolution (1080p) so tiny QR codes occupy enough pixels to be parsed.
        const scanner = new Html5QrcodeScanner(
            "qr-reader",
            { 
                fps: 20, 
                qrbox: { width: 280, height: 280 },
                formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ],
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                },
                videoConstraints: { 
                    facingMode: "environment",
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            },
            /* verbose= */ false
        );

        scanner.render(
            (decodedText) => {
                if (!hasScannedRef.current) {
                    hasScannedRef.current = true;
                    // Properly shut down the scanner before notifying parent
                    // This ensures the DOM node exists so html5-qrcode can stop the video stream correctly
                    if (scannerRef.current) {
                        scannerRef.current.clear()
                            .catch(console.error)
                            .finally(() => {
                                forceKillVideoTracks();
                                onScan(decodedText);
                            });
                    } else {
                        forceKillVideoTracks();
                        onScan(decodedText);
                    }
                }
            },
            () => {
                // Ignore frequent scan errors (usually just "no QR code detected in frame")
            }
        );

        scannerRef.current = scanner;

        return () => {
            // Restore getUserMedia
            if (navigator.mediaDevices && originalGetUserMedia) {
                navigator.mediaDevices.getUserMedia = originalGetUserMedia;
            }

            if (scannerRef.current && !hasScannedRef.current) {
                // Failsafe for normal unmounts
                scannerRef.current.clear().catch(console.error).finally(() => {
                    forceKillVideoTracks();
                });
            } else {
                forceKillVideoTracks();
            }
        };
    }, [active, onScan]);

    if (!active) return null;

    return (
        <div className="fixed inset-0 z-[2000] bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-tan-light/50 flex items-center justify-between bg-cream/30">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-tan/10 flex items-center justify-center text-tan">
                            <Camera size={18} />
                        </div>
                        <h2 className="font-serif font-bold text-charcoal">Scan Tracking Code</h2>
                    </div>
                    {onClose && (
                        <button 
                            onClick={() => {
                                if (!hasScannedRef.current) {
                                    hasScannedRef.current = true;
                                    if (scannerRef.current) {
                                        scannerRef.current.clear()
                                            .catch(console.error)
                                            .finally(() => {
                                                forceKillVideoTracks();
                                                onClose();
                                            });
                                    } else {
                                        forceKillVideoTracks();
                                        onClose();
                                    }
                                }
                            }}
                            className="p-2 hover:bg-black/5 rounded-full transition-colors text-charcoal/60"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="p-6">
                    <div id="qr-reader" className="overflow-hidden rounded-2xl border-4 border-tan-light/20 bg-black relative">
                        {/* html5-qrcode injects here */}
                        
                        {/* Force internal video to scale for Digital Zoom if Native Optical Zoom is unavailable */}
                        <style>{`
                            #qr-reader video {
                                transition: transform 0.15s ease-out;
                                transform: scale(${zoomLevel});
                                transform-origin: center center;
                            }
                        `}</style>
                    </div>
                    
                    <div className="mt-6 flex flex-col items-center text-center">
                        <p className="text-sm text-charcoal/70 max-w-xs">
                            Point your camera at a SAHS artifact or location QR code.
                        </p>
                        
                        <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-tan/60 animate-pulse">
                            <div className="w-2 h-2 rounded-full bg-tan"></div>
                            Scanner Active
                        </div>
                        
                        {zoomParams && (
                            <div className="w-full mt-6 bg-cream/30 p-4 rounded-xl border border-tan/20 flex flex-col gap-2">
                                <div className="flex items-center justify-between text-xs font-bold text-charcoal/60 uppercase">
                                    <ZoomOut size={16} />
                                    <span>Optical Zoom ({zoomLevel.toFixed(1)}x)</span>
                                    <ZoomIn size={16} />
                                </div>
                                <input
                                    type="range"
                                    min={zoomParams.min}
                                    max={Math.min(zoomParams.max, 5)} // Cap at 5x so it doesn't get ridiculously blurry
                                    step={zoomParams.step}
                                    value={zoomLevel}
                                    onChange={(e) => {
                                        const newZoom = parseFloat(e.target.value);
                                        setZoomLevel(newZoom);
                                        if (activeTracksRef.current[0]) {
                                            const advancedConstraint: any = { zoom: newZoom };
                                            activeTracksRef.current[0].applyConstraints({ advanced: [advancedConstraint] }).catch(console.error);
                                        }
                                    }}
                                    className="w-full h-2 bg-tan/20 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <button 
                onClick={() => window.location.reload()} 
                className="mt-6 flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-medium"
            >
                <RefreshCw size={16} /> Reset Camera
            </button>
        </div>
    );
}
