import React, { useState } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ImageViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  fileName?: string;
  downloadUrl?: string;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  fileName,
  downloadUrl,
}) => {
  const [scale, setScale] = useState(1);

  if (!isOpen) return null;

  const handleZoomIn = () => setScale((s) => Math.min(3, s + 0.5));
  const handleZoomOut = () => setScale((s) => Math.max(0.75, s - 0.5));
  const handleResetZoom = () => setScale(1);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md animate-fade-in select-none"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div
        className="w-full h-16 px-4 flex items-center justify-between text-white bg-gradient-to-b from-black/80 to-transparent z-10 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col truncate max-w-[65%]">
          <span className="text-sm font-medium truncate">{fileName || 'Photo'}</span>
          <span className="text-[11px] text-slate-400">Pinch or tap zoom controls</span>
        </div>

        <div className="flex items-center gap-2">
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={fileName || 'image.jpg'}
              className="p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition"
              title="Download image"
            >
              <Download className="w-5 h-5" />
            </a>
          )}
          <button
            onClick={onClose}
            className="p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition"
            aria-label="Close photo viewer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div
        className="flex-1 w-full h-full flex items-center justify-center p-2 overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <img
          src={imageUrl}
          alt={fileName || 'Shared photo'}
          style={{ transform: `scale(${scale})` }}
          className="max-w-full max-h-[85vh] object-contain transition-transform duration-200 rounded-lg shadow-2xl cursor-grab"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Floating Zoom Control Dock */}
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full bg-slate-900/90 border border-slate-700/60 shadow-2xl backdrop-blur-md text-white z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleZoomOut}
          disabled={scale <= 0.75}
          className="p-1.5 rounded-full hover:bg-slate-800 disabled:opacity-40 transition"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono text-slate-300 min-w-10 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          disabled={scale >= 3}
          className="p-1.5 rounded-full hover:bg-slate-800 disabled:opacity-40 transition"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        {scale !== 1 && (
          <button
            onClick={handleResetZoom}
            className="p-1.5 rounded-full hover:bg-slate-800 text-indigo-400 transition"
            aria-label="Reset zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
