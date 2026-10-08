import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Plus,
  Camera,
  Image as ImageIcon,
  FileText,
  X,
  Smile,
  Loader2,
} from 'lucide-react';
import { socketClient } from '../services/socket.js';
import { formatFileSize } from '../utils/format.js';

interface MessageComposerProps {
  onSendMessage: (text: string) => Promise<void>;
  onSendAttachment: (file: File, caption?: string, onProgress?: (percent: number) => void) => Promise<void>;
  disabled?: boolean;
}

const COMMON_EMOJIS = ['❤️', '👍', '😊', '😂', '🔥', '🎉', '🙏', '🙌', '✨', '👀', '💯', '👋'];

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  onSendAttachment,
  disabled,
}) => {
  const [text, setText] = useState('');
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false);

  // Selected file preview state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<any>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);

    // Notify typing event to peer
    socketClient.sendTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socketClient.sendTyping(false);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (selectedFile) {
      // Send attachment
      setIsUploading(true);
      setUploadProgress(0);
      try {
        await onSendAttachment(selectedFile, caption || undefined, (progress) => {
          setUploadProgress(progress);
        });
        clearSelectedFile();
      } catch (err) {
        console.error('Failed to send attachment:', err);
      } finally {
        setIsUploading(false);
      }
      return;
    }

    if (!text.trim() || disabled) return;

    const outgoing = text;
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    socketClient.sendTyping(false);

    try {
      await onSendMessage(outgoing);
    } catch (err) {
      console.error('Failed to send message:', err);
      setText(outgoing); // restore on error
    }
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setAttachmentMenuOpen(false);

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    // Reset input
    e.target.value = '';
  };

  const clearSelectedFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption('');
    setUploadProgress(0);
  };

  const addEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    setEmojiMenuOpen(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="relative w-full bg-slate-900 border-t border-slate-800 text-slate-100 z-20 shrink-0 pb-[env(safe-area-inset-bottom)]">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleFileChosen}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileChosen}
        accept="image/*"
        capture="environment"
        className="hidden"
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChosen}
        className="hidden"
      />

      {/* Attachment Pre-send Preview Bar */}
      {selectedFile && (
        <div className="p-3 bg-slate-950 border-b border-slate-800 animate-slide-up flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-400">Attach file</span>
            <button
              onClick={clearSelectedFile}
              disabled={isUploading}
              className="p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Upload preview"
                className="w-14 h-14 object-cover rounded-xl border border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-indigo-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium truncate block text-slate-200">
                {selectedFile.name}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {formatFileSize(selectedFile.size)}
              </span>

              {isUploading ? (
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add an optional caption..."
                  className="w-full bg-transparent border-b border-slate-800 text-xs text-white py-1 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600 mt-1"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attachment Options Popover Menu */}
      {attachmentMenuOpen && (
        <div className="absolute bottom-full left-3 mb-2 p-2 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex items-center gap-2 z-30 animate-fade-in">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-col items-center gap-1 p-2.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition"
            title="Take Photo"
          >
            <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Camera</span>
          </button>

          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex flex-col items-center gap-1 p-2.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition"
            title="Photos & Images"
          >
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Photos</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-1 p-2.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition"
            title="Documents & Files"
          >
            <div className="w-10 h-10 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Files</span>
          </button>
        </div>
      )}

      {/* Emoji Tray Popover */}
      {emojiMenuOpen && (
        <div className="absolute bottom-full right-12 mb-2 p-2 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl grid grid-cols-6 gap-1.5 z-30 animate-fade-in">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => addEmoji(emoji)}
              className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-800 rounded-lg active:scale-90 transition"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Main Input Row */}
      <div className="px-3 py-2 flex items-end gap-2">
        {/* Attachment Toggle Button */}
        <button
          type="button"
          onClick={() => {
            setAttachmentMenuOpen(!attachmentMenuOpen);
            setEmojiMenuOpen(false);
          }}
          disabled={isUploading}
          aria-label="Add attachment"
          className={`p-2.5 rounded-full transition active:scale-95 shrink-0 ${
            attachmentMenuOpen
              ? 'bg-indigo-600 text-white rotate-45'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Plus className="w-5 h-5 transition-transform" />
        </button>

        {/* Text Input Container */}
        <div className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2 flex items-end gap-2 focus-within:border-indigo-500/80 transition">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={selectedFile ? 'Press send to upload file...' : 'Message...'}
            disabled={isUploading || disabled}
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none resize-none leading-relaxed max-h-32 min-h-[22px]"
          />

          <button
            type="button"
            onClick={() => {
              setEmojiMenuOpen(!emojiMenuOpen);
              setAttachmentMenuOpen(false);
            }}
            className="p-1 text-slate-400 hover:text-white transition shrink-0"
            aria-label="Insert emoji"
          >
            <Smile className="w-4 h-4" />
          </button>
        </div>

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={(!text.trim() && !selectedFile) || isUploading || disabled}
          aria-label="Send message"
          className="p-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white shadow-md shadow-indigo-600/30 transition active:scale-95 shrink-0 flex items-center justify-center"
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
          )}
        </button>
      </div>
    </div>
  );
};
