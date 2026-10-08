import React, { useState, useEffect } from 'react';
import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../services/api.js';
import type { Message } from '../types.js';
import { formatMessageTime } from '../utils/format.js';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  onJumpToMessage: (messageId: string) => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  isOpen,
  onClose,
  roomId,
  onJumpToMessage,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim() || !roomId) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearching(true);
      api
        .searchMessages(roomId, query.trim())
        .then((res) => {
          setResults(res.messages || []);
        })
        .catch((err) => console.error('Search failed:', err))
        .finally(() => setSearching(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [query, roomId]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-xl p-3 animate-fade-in flex flex-col gap-2">
      {/* Input row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus-within:border-indigo-500 transition">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversation..."
            autoFocus
            className="w-full bg-transparent focus:outline-none placeholder:text-slate-500 text-sm"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-white p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition"
        >
          Cancel
        </button>
      </div>

      {/* Results Dropdown */}
      {query.trim() && (
        <div className="max-h-60 overflow-y-auto rounded-xl bg-slate-950 border border-slate-800 p-1 flex flex-col gap-1">
          {searching ? (
            <div className="p-3 text-xs text-slate-400 text-center">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 text-center">No messages matching "{query}"</div>
          ) : (
            results.map((msg) => (
              <div
                key={msg.id}
                onClick={() => {
                  onJumpToMessage(msg.id);
                  onClose();
                }}
                className="p-2.5 rounded-lg hover:bg-slate-900 active:bg-slate-800 cursor-pointer flex flex-col gap-0.5 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-indigo-400">
                    {msg.message_type === 'image' ? 'Photo' : msg.message_type === 'file' ? 'Attachment' : 'Message'}
                  </span>
                  <span className="text-[10px] text-slate-500">{formatMessageTime(msg.created_at)}</span>
                </div>
                <p className="text-xs text-slate-200 line-clamp-2">
                  {msg.text_content || msg.attachment?.file_name || 'Media attachment'}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
