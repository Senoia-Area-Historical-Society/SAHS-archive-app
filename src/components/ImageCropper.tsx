import React, { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { X, Check, RotateCcw, RotateCw, Maximize2 } from 'lucide-react'
import getCroppedImg from '../utils/imageUtils'

interface ImageCropperProps {
  image: string
  aspectRatio?: number
  onCropComplete: (croppedBlob: Blob) => void
  onCancel: () => void
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  image,
  aspectRatio,
  onCropComplete,
  onCancel,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentAspect, setCurrentAspect] = useState<number | undefined>(aspectRatio)
  const [isOriginalAspect, setIsOriginalAspect] = useState(aspectRatio === undefined)
  const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 })

  const onCropChange = (crop: { x: number; y: number }) => {
    setCrop(crop)
  }

  const onCropCompleteInternal = useCallback(
    (_croppedArea: any, croppedAreaPixels: any) => {
      setCroppedAreaPixels(croppedAreaPixels)
    },
    []
  )

  const onZoomChange = (zoom: number) => {
    setZoom(zoom)
  }

  const onMediaLoaded = (mediaSize: { width: number; height: number }) => {
    setMediaSize(mediaSize)
  }

  // Effect to handle aspect ratio changes during rotation
  React.useEffect(() => {
    if (isOriginalAspect && mediaSize.width > 0) {
      const isPortrait = (rotation / 90) % 2 !== 0;
      setCurrentAspect(isPortrait ? mediaSize.height / mediaSize.width : mediaSize.width / mediaSize.height);
    }
  }, [rotation, mediaSize, isOriginalAspect]);

  const selectAll = () => {
    setZoom(1)
    setCrop({ x: 0, y: 0 })
    setIsOriginalAspect(true)
  }

  const handleSave = async () => {
    setIsApplying(true)
    setError(null)
    try {
      const croppedBlob = await getCroppedImg(
        image,
        croppedAreaPixels,
        rotation
      )
      if (croppedBlob) {
        onCropComplete(croppedBlob)
      }
    } catch (e: any) {
      console.error(e)
      setError("The server security (CORS) blocked the rotation. Please re-upload this photo from your computer to rotate it.")
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] bg-charcoal/90 flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-4xl h-[70vh] bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex flex-col p-4 border-b border-charcoal/10 bg-white z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-serif font-bold text-charcoal">Edit & Rotate Image</h3>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-charcoal/5 rounded-full text-charcoal/50 hover:text-charcoal transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-charcoal/60 mt-1">
            Drag to center or use the tools below to rotate.
          </p>
          {error && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded flex items-center gap-2 animate-pulse">
              <RotateCcw size={14} />
              {error}
            </div>
          )}
        </div>

        {/* Cropper Container */}
        <div className="relative flex-1 bg-charcoal/5">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={currentAspect}
            onCropChange={onCropChange}
            onCropComplete={onCropCompleteInternal}
            onZoomChange={onZoomChange}
            onMediaLoaded={onMediaLoaded}
          />
        </div>

        {/* Controls */}
        <div className="p-6 bg-white border-t border-charcoal/10 z-10">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-charcoal/60 w-12">Zoom</span>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-tan"
              />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-charcoal/60 w-12">Rotate</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRotation((prev) => (prev - 90 + 360) % 360)}
                  className="p-2 bg-tan/10 text-tan hover:bg-tan hover:text-white rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
                  title="Rotate 90° CCW"
                >
                  <RotateCcw size={16} /> -90°
                </button>
                <button
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  className="p-2 bg-tan/10 text-tan hover:bg-tan hover:text-white rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
                  title="Rotate 90° CW"
                >
                  <RotateCw size={16} /> +90°
                </button>
              </div>
              <input
                type="range"
                value={rotation}
                min={0}
                max={360}
                step={1}
                aria-labelledby="Rotation"
                onChange={(e) => setRotation(Number(e.target.value))}
                className="flex-1 accent-tan"
              />
              <button
                onClick={() => setRotation(0)}
                className="p-1 hover:bg-charcoal/5 rounded-full text-charcoal/40 hover:text-charcoal"
                title="Reset Rotation"
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <div className="flex items-center gap-6 mt-2 pt-4 border-t border-charcoal/5">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-charcoal/40 tracking-widest">Aspect Ratio:</span>
                    {mediaSize.width > 0 && (
                        <button 
                            onClick={() => setIsOriginalAspect(true)} 
                            className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${isOriginalAspect ? 'bg-tan text-white shadow-sm' : 'bg-cream text-charcoal/40 hover:text-charcoal'}`}
                        >
                            Original Aspect
                        </button>
                    )}
                    <button 
                        onClick={() => {
                            setIsOriginalAspect(false);
                            setCurrentAspect(1);
                        }} 
                        className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${!isOriginalAspect && currentAspect === 1 ? 'bg-tan text-white shadow-sm' : 'bg-cream text-charcoal/40 hover:text-charcoal'}`}
                    >
                        Square (1:1)
                    </button>
                    <button 
                        onClick={() => {
                            setIsOriginalAspect(false);
                            setCurrentAspect(undefined);
                        }} 
                        className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${!isOriginalAspect && currentAspect === undefined ? 'bg-tan text-white shadow-sm' : 'bg-cream text-charcoal/40 hover:text-charcoal'}`}
                    >
                        Free Form
                    </button>
                </div>
                <button 
                    type="button"
                    onClick={selectAll}
                    className="ml-auto text-[10px] font-black uppercase text-tan hover:text-charcoal tracking-widest flex items-center gap-1.5 transition-colors"
                >
                    <Maximize2 size={12} /> Use Entire Image (No Crop)
                </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-charcoal/60 hover:text-charcoal font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isApplying}
              className="flex items-center gap-2 bg-tan text-white px-6 py-2 rounded-lg font-medium hover:bg-charcoal transition-colors shadow-lg shadow-tan/20 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px] justify-center"
            >
              {isApplying ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check size={18} />
              )}
              {isApplying ? 'Applying...' : 'Apply Changes'}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-4 text-white/60 text-sm">Drag to move, use sliders to rotate. By default, the entire image is preserved.</p>
    </div>
  )
}
