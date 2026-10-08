import React from 'react';
import { Check, CheckCheck, Clock, FileText, Download, AlertCircle } from 'lucide-react';
import type { Message } from '../types.js';
import { formatFileSize, formatMessageTime } from '../utils/format.js';
import { api } from '../services/api.js';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  roomId: string;
  onOpenImage: (url: string, fileName?: string, downloadUrl?: string) => void;
  isHighlighted?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isOwn,
  roomId,
  onOpenImage,
  isHighlighted,
}) => {
  const isImage = message.message_type === 'image' && message.attachment;
  const isFile = message.message_type === 'file' && message.attachment;

  const imageUrl =
    isImage && message.attachment
      ? api.getAttachmentUrl(roomId, message.attachment.storage_key)
      : '';
  const downloadUrl =
    message.attachment
      ? api.getAttachmentUrl(roomId, message.attachment.storage_key, true)
      : '';

  // Status icon logic
  const renderStatus = () => {
    if (!isOwn) return null;

    if (message.hasError) {
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    }
    if (message.isPending) {
      return <Clock className="w-3 h-3 text-slate-400 animate-pulse" />;
    }
    if (message.read_at) {
      // Read by peer
      return <CheckCheck className="w-3.5 h-3.5 text-sky-400" />;
    }
    if (message.delivered_at) {
      // Delivered to peer's device
      return <CheckCheck className="w-3.5 h-3.5 text-slate-400" />;
    }
    // Sent to server
    return <Check className="w-3.5 h-3.5 text-slate-400" />;
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`flex w-full px-3 py-1 transition-colors duration-500 ${
        isOwn ? 'justify-end' : 'justify-start'
      } ${isHighlighted ? 'bg-indigo-500/20 rounded-xl' : ''}`}
    >
      <div
        className={`relative max-w-[82%] sm:max-w-[70%] rounded-2xl p-2.5 shadow-sm text-sm break-words select-text ${
          isOwn
            ? 'bg-indigo-600 text-white rounded-tr-xs'
            : 'bg-slate-800 text-slate-100 rounded-tl-xs border border-slate-700/50'
        }`}
      >
        {/* Image Attachment Preview */}
        {isImage && (
          <div className="mb-1 rounded-xl overflow-hidden bg-slate-950/40 cursor-pointer">
            <img
              src={imageUrl}
              alt={message.attachment?.file_name || 'Shared image'}
              onClick={() => onOpenImage(imageUrl, message.attachment?.file_name, downloadUrl)}
              className="max-h-72 w-full object-cover hover:opacity-95 transition active:scale-99"
              loading="lazy"
            />
          </div>
        )}

        {/* Document / File Attachment */}
        {isFile && message.attachment && (
          <a
            href={downloadUrl}
            download={message.attachment.file_name}
            className={`flex items-center gap-3 p-2.5 rounded-xl mb-1 transition ${
              isOwn
                ? 'bg-indigo-700/60 hover:bg-indigo-700 text-white'
                : 'bg-slate-900/80 hover:bg-slate-900 text-slate-200 border border-slate-700'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-black/20 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-indigo-300" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium truncate block leading-tight">
                {message.attachment.file_name}
              </span>
              <span className="text-[10px] opacity-75 mt-0.5 block">
                {formatFileSize(message.attachment.file_size)}
              </span>
            </div>
            <Download className="w-4 h-4 opacity-80 shrink-0" />
          </a>
        )}

        {/* Text Content */}
        {message.text_content && (
          <div className="whitespace-pre-wrap leading-relaxed text-[13.5px] px-1 font-normal">
            {message.text_content}
          </div>
        )}

        {/* Timestamp & Status Metadata */}
        <div
          className={`flex items-center justify-end gap-1 mt-1 text-[10px] select-none ${
            isOwn ? 'text-indigo-200' : 'text-slate-400'
          }`}
        >
          <span>{formatMessageTime(message.created_at)}</span>
          {renderStatus()}
        </div>
      </div>
    </div>
  );
};
