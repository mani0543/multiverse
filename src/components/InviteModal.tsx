import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Share2, ShieldCheck, Users } from 'lucide-react';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomToken: string;
}

export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, roomToken }) => {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const inviteUrl = `${window.location.origin}/chat/${roomToken}`;

  useEffect(() => {
    if (isOpen && roomToken) {
      QRCode.toDataURL(inviteUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR generation failed:', err));
    }
  }, [isOpen, inviteUrl, roomToken]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = inviteUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my private chat on Duo',
          text: 'Here is our private one-to-one chatroom invitation.',
          url: inviteUrl,
        });
      } catch {
        // Ignored if cancelled
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 flex flex-col items-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close invitation"
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon & Title */}
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3">
          <Users className="w-6 h-6 text-indigo-400" />
        </div>

        <h3 className="text-xl font-semibold tracking-tight text-center">Private Invite Link</h3>
        <p className="text-xs text-slate-400 text-center mt-1 mb-4">
          Strictly 2 participants maximum. Once accepted, room locks automatically.
        </p>

        {/* QR Code Container */}
        {qrDataUrl && (
          <div className="p-3 bg-white rounded-2xl shadow-inner mb-4 flex items-center justify-center">
            <img src={qrDataUrl} alt="Invitation QR Code" className="w-48 h-48 rounded-xl object-contain" />
          </div>
        )}

        {/* Invite URL Box */}
        <div className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center gap-2 mb-4">
          <span className="text-xs text-slate-300 font-mono truncate flex-1 select-all">{inviteUrl}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition text-white shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex gap-2">
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-98 transition text-sm font-medium text-slate-200"
            >
              <Share2 className="w-4 h-4 text-indigo-400" />
              <span>Share Link</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 transition text-sm font-medium text-white shadow-lg shadow-indigo-600/20"
          >
            Done
          </button>
        </div>

        {/* Security Notice */}
        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>No public listing. Private end-to-end room.</span>
        </div>
      </div>
    </div>
  );
};
