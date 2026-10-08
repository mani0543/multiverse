import React, { useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  FileText,
  Download,
  AlertCircle,
  Reply,
  Trash2,
  Image as ImageIcon,
  MoreHorizontal,
} from 'lucide-react';
import type { Message, ReplyToPreview } from '../types.js';
import { formatFileSize, formatMessageTime } from '../utils/format.js';
import { api } from '../services/api.js';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  roomId: string;
  onOpenImage: (url: string, fileName?: string, downloadUrl?: string) => void;
  isHighlighted?: boolean;
  onReply: (replyData: ReplyToPreview) => void;
  onDelete: (messageId: string) => void;
  onJumpToMessage: (messageId: string) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isOwn,
  roomId,
  onOpenImage,
  isHighlighted,
  onReply,
  onDelete,
  onJumpToMessage,
}) => {
  const [showActions, setShowActions] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const isImage = message.message_type === 'image' && message.attachment;
  const isFile = message.message_type === 'file' && message.attachment;

  const imageUrl =
    isImage && message.attachment
      ? message.attachment.cloudinary_url || api.getAttachmentUrl(roomId, message.attachment.storage_key)
      : '';
  const downloadUrl =
    message.attachment
      ? message.attachment.cloudinary_url || api.getAttachmentUrl(roomId, message.attachment.storage_key, true)
      : '';

  const renderStatus = () => {
    if (!isOwn) return null;

    if (message.hasError) {
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    }
    if (message.isPending) {
      return <Clock className="w-3 h-3 text-slate-400 animate-pulse" />;
    }
    if (message.read_at) {
      return <CheckCheck className="w-3.5 h-3.5 text-sky-400" />;
    }
    if (message.delivered_at) {
      return <CheckCheck className="w-3.5 h-3.5 text-slate-400" />;
    }
    return <Check className="w-3.5 h-3.5 text-slate-400" />;
  };

  const handleReplyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReply({
      id: message.id,
      sender_id: message.sender_id,
      sender_name: isOwn ? 'You' : 'Friend',
      text_content: message.text_content,
      message_type: message.message_type,
      file_name: message.attachment?.file_name,
    });
    setShowActions(false);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirmDelete(true);
  };

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(message.id);
    setShowConfirmDelete(false);
    setShowActions(false);
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`group relative flex w-full px-3 py-1 transition-colors duration-500 ${
        isOwn ? 'justify-end' : 'justify-start'
      } ${isHighlighted ? 'bg-indigo-500/25 rounded-2xl ring-2 ring-indigo-400/50' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        if (!showConfirmDelete) setShowActions(false);
      }}
    >
      {/* Floating Action Menu (WhatsApp style) */}
      <div
        className={`absolute top-0 z-10 flex items-center gap-1 transition-opacity duration-200 ${
          isOwn ? 'right-full mr-2' : 'left-full ml-2'
        } ${showActions || showConfirmDelete ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        {!showConfirmDelete ? (
          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-full p-1 shadow-lg backdrop-blur-sm">
            <button
              onClick={handleReplyClick}
              aria-label="Reply to message"
              title="Reply"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition active:scale-95"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDeleteClick}
              aria-label="Delete message"
              title="Delete"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-full transition active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl p-1.5 shadow-xl text-xs text-white animate-fade-in">
            <span className="text-[11px] text-slate-300 px-1">Delete message?</span>
            <button
              onClick={confirmDelete}
              className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[11px] font-medium transition"
            >
              Yes
            </button>
            <button
              onClick={() => {
                setShowConfirmDelete(false);
                setShowActions(false);
              }}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] transition"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Message Bubble */}
      <div
        className={`relative max-w-[84%] sm:max-w-[72%] rounded-2xl p-2.5 shadow-sm text-sm break-words select-text ${
          isOwn
            ? 'bg-indigo-600 text-white rounded-tr-xs'
            : 'bg-slate-800 text-slate-100 rounded-tl-xs border border-slate-700/50'
        }`}
      >
        {/* WhatsApp-Style Quoted Reply Block */}
        {message.reply_to && (
          <div
            onClick={() => message.reply_to && onJumpToMessage(message.reply_to.id)}
            className={`mb-2 p-2 rounded-xl border-l-4 cursor-pointer text-xs transition active:scale-99 ${
              isOwn
                ? 'bg-indigo-700/60 border-indigo-300 text-indigo-100 hover:bg-indigo-700/80'
                : 'bg-slate-900/80 border-indigo-400 text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className="font-semibold text-[11px] text-indigo-300 mb-0.5 truncate">
              {message.reply_to.sender_name || 'Participant'}
            </div>
            <div className="line-clamp-2 text-[11.5px] opacity-90">
              {message.reply_to.message_type === 'image' ? (
                <span className="flex items-center gap-1">
                  <ImageIcon className="w-3 h-3 text-indigo-300 inline" /> Photo
                </span>
              ) : message.reply_to.message_type === 'file' ? (
                <span className="flex items-center gap-1 truncate">
                  <FileText className="w-3 h-3 text-indigo-300 inline" /> {message.reply_to.file_name || 'Document'}
                </span>
              ) : (
                message.reply_to.text_content || 'Message'
              )}
            </div>
          </div>
        )}

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
            target="_blank"
            rel="noopener noreferrer"
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
                {message.attachment.cloudinary_url && ' • Cloud'}
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
