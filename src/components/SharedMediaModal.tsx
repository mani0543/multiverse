import React, { useState, useEffect } from 'react';
import { X, Image as ImageIcon, FileText, Download, Calendar } from 'lucide-react';
import { api } from '../services/api.js';
import type { Message } from '../types.js';
import { formatFileSize, formatMessageTime } from '../utils/format.js';

interface SharedMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  onSelectImage: (imageUrl: string, fileName?: string, downloadUrl?: string) => void;
}

export const SharedMediaModal: React.FC<SharedMediaModalProps> = ({
  isOpen,
  onClose,
  roomId,
  onSelectImage,
}) => {
  const [tab, setTab] = useState<'photos' | 'files'>('photos');
  const [images, setImages] = useState<Message[]>([]);
  const [files, setFiles] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && roomId) {
      setLoading(true);
      api
        .getSharedMedia(roomId)
        .then((res) => {
          setImages(res.images || []);
          setFiles(res.files || []);
        })
        .catch((err) => console.error('Failed to load shared media:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, roomId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-0 sm:p-4">
      <div className="w-full sm:max-w-md h-[80vh] bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-base">Shared Media & Files</h3>
            <p className="text-xs text-slate-400">Exclusively from this private chat</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 px-5 pt-2 shrink-0">
          <button
            onClick={() => setTab('photos')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition ${
              tab === 'photos'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Photos ({images.length})</span>
          </button>
          <button
            onClick={() => setTab('files')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition ${
              tab === 'files'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Files ({files.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
              Loading shared media...
            </div>
          ) : tab === 'photos' ? (
            images.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
                <ImageIcon className="w-8 h-8 opacity-40" />
                <span className="text-sm">No photos shared in this chat yet</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {images.map((msg) => {
                  if (!msg.attachment) return null;
                  const url = api.getAttachmentUrl(roomId, msg.attachment.storage_key);
                  const downloadUrl = api.getAttachmentUrl(roomId, msg.attachment.storage_key, true);
                  return (
                    <div
                      key={msg.id}
                      onClick={() => onSelectImage(url, msg.attachment?.file_name, downloadUrl)}
                      className="group relative aspect-square rounded-xl overflow-hidden bg-slate-950 cursor-pointer border border-slate-800 hover:border-indigo-500/50 transition active:scale-95"
                    >
                      <img
                        src={url}
                        alt={msg.attachment.file_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-1.5">
                        <span className="text-[10px] text-white truncate">{msg.attachment.file_name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
              <FileText className="w-8 h-8 opacity-40" />
              <span className="text-sm">No files or documents shared yet</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {files.map((msg) => {
                if (!msg.attachment) return null;
                const downloadUrl = api.getAttachmentUrl(roomId, msg.attachment.storage_key, true);
                return (
                  <div
                    key={msg.id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-slate-200">
                        {msg.attachment.file_name}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{formatFileSize(msg.attachment.file_size)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {formatMessageTime(msg.created_at)}
                        </span>
                      </div>
                    </div>
                    <a
                      href={downloadUrl}
                      download={msg.attachment.file_name}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition shrink-0"
                      title="Download file"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
