import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  MoreVertical,
  Search,
  Image as ImageIcon,
  UserPlus,
  Settings,
  LogOut,
  Shield,
  WifiOff,
} from 'lucide-react';
import type { ChatRoom, ConnectionState } from '../types.js';
import { formatLastSeen } from '../utils/format.js';

interface HeaderProps {
  room: ChatRoom;
  connectionState: ConnectionState;
  isPeerTyping: boolean;
  onBack: () => void;
  onOpenInvite: () => void;
  onOpenSearch: () => void;
  onOpenSharedMedia: () => void;
  onOpenSettings: () => void;
  onLeaveRoom: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  room,
  connectionState,
  isPeerTyping,
  onBack,
  onOpenInvite,
  onOpenSearch,
  onOpenSharedMedia,
  onOpenSettings,
  onLeaveRoom,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const peer = room.peer;
  const isSolo = !peer;

  return (
    <header className="h-16 px-3 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between text-slate-100 z-20 shrink-0">
      {/* Left: Back & Avatar & Info */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          className="p-2 -ml-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Avatar with Presence Indicator */}
        <div className="relative shrink-0">
          {peer?.avatarUrl ? (
            <img
              src={peer.avatarUrl}
              alt={peer.displayName}
              className="w-10 h-10 rounded-full object-cover border border-slate-700 shadow-sm"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-semibold text-sm">
              {peer ? peer.displayName.charAt(0).toUpperCase() : <Shield className="w-5 h-5" />}
            </div>
          )}

          {/* Online Dot */}
          {peer && (
            <span
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${
                peer.online ? 'bg-emerald-500' : 'bg-slate-500'
              }`}
            />
          )}
        </div>

        {/* Names & Presence / Typing */}
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-sm truncate text-white leading-tight">
            {peer ? peer.displayName : 'Waiting for Peer...'}
          </span>

          <span className="text-[11px] truncate leading-tight mt-0.5">
            {connectionState === 'reconnecting' ? (
              <span className="text-amber-400 flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Reconnecting...
              </span>
            ) : isPeerTyping ? (
              <span className="text-indigo-400 font-medium animate-pulse">typing...</span>
            ) : peer ? (
              <span className={peer.online ? 'text-emerald-400' : 'text-slate-400'}>
                {formatLastSeen(peer.lastSeen, peer.online)}
              </span>
            ) : (
              <span className="text-indigo-400">Tap + Invite to connect</span>
            )}
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Solo room invite pill */}
        {isSolo && (
          <button
            onClick={onOpenInvite}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600 hover:text-white text-xs font-medium transition active:scale-95 mr-1"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Invite</span>
          </button>
        )}

        <button
          onClick={onOpenSearch}
          aria-label="Search conversation"
          className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95"
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Menu Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Chat menu options"
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-1.5 z-50 text-slate-200 animate-fade-in text-sm font-medium">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSharedMedia();
                }}
                className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-800 transition"
              >
                <ImageIcon className="w-4 h-4 text-slate-400" />
                <span>Shared Media & Files</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenInvite();
                }}
                className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-800 transition"
              >
                <UserPlus className="w-4 h-4 text-slate-400" />
                <span>Room Invite & QR</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings();
                }}
                className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-800 transition"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Settings & Sync Key</span>
              </button>

              <div className="my-1 border-t border-slate-800" />

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLeaveRoom();
                }}
                className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-red-500/10 text-red-400 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Leave Chat</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
