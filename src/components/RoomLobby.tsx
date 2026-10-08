import React, { useState, useEffect } from 'react';
import {
  Shield,
  Plus,
  LogIn,
  Settings,
  MessageCircle,
  Users,
  Lock,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../services/api.js';
import type { ChatRoom } from '../types.js';
import { formatLastSeen } from '../utils/format.js';

interface RoomLobbyProps {
  onSelectRoom: (roomId: string, token: string) => void;
  onOpenSettings: () => void;
}

export const RoomLobby: React.FC<RoomLobbyProps> = ({ onSelectRoom, onOpenSettings }) => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);

  const fetchRooms = async () => {
    try {
      const res = await api.getRooms();
      setRooms(res.rooms || []);
    } catch (err) {
      console.error('Failed to load user rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    try {
      const { room } = await api.createRoom();
      onSelectRoom(room.id, room.token);
    } catch (err: any) {
      alert(err.message || 'Failed to create chat room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    // Handle full URL or raw token
    let cleanCode = joinCode.trim();
    if (cleanCode.includes('/chat/')) {
      cleanCode = cleanCode.split('/chat/')[1].split('?')[0];
    }

    setIsJoining(true);
    setJoinError('');

    try {
      const { room } = await api.joinRoom(cleanCode);
      onSelectRoom(room.id, room.token);
    } catch (err: any) {
      setJoinError(err.message || 'Failed to join chat room.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="flex-1 w-full max-w-lg mx-auto flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Top Header */}
      <header className="px-5 py-4 flex items-center justify-between border-b border-slate-900 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white leading-none">Duo</h1>
            <span className="text-[10px] text-slate-400">Private 2-Person Chat</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 p-1.5 pr-2.5 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Me" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold">
                {user?.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs font-medium text-slate-200 max-w-[90px] truncate">
              {user?.displayName}
            </span>
            <Settings className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 p-5 flex flex-col gap-5">
        {/* Primary Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          {/* Create Room Button */}
          <button
            onClick={handleCreateRoom}
            disabled={isCreating}
            className="group relative flex flex-col items-start p-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 active:scale-98 transition text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            </div>
            <span className="font-semibold text-sm">Create Chat</span>
            <span className="text-xs text-indigo-200 mt-0.5">Start a new private 1-to-1 room</span>
          </button>

          {/* Join Chat Button */}
          <button
            onClick={() => setShowJoinInput(!showJoinInput)}
            className="group flex flex-col items-start p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 active:scale-98 transition text-left text-slate-100"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mb-3 group-hover:scale-105 transition text-indigo-400">
              <LogIn className="w-5 h-5" />
            </div>
            <span className="font-semibold text-sm">Join Chat</span>
            <span className="text-xs text-slate-400 mt-0.5">Use invitation code or link</span>
          </button>
        </div>

        {/* Join Code Collapsible Input */}
        {showJoinInput && (
          <form
            onSubmit={handleJoinByCode}
            className="p-4 rounded-2xl bg-slate-900 border border-indigo-500/30 animate-slide-up flex flex-col gap-2 shrink-0"
          >
            <label className="text-xs font-semibold text-slate-300">
              Enter Room Invitation Code or Link:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Paste link or token code..."
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none"
              />
              <button
                type="submit"
                disabled={isJoining || !joinCode.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              >
                {isJoining ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>Join</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
            {joinError && <p className="text-xs text-rose-400 mt-1 font-medium">{joinError}</p>}
          </form>
        )}

        {/* Conversation List */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Your Conversations
            </span>
            <span className="text-xs text-slate-500">{rooms.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-xs text-slate-500">
                Loading conversations...
              </div>
            ) : rooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-slate-900/50 border border-slate-900 text-center gap-2">
                <MessageCircle className="w-8 h-8 text-slate-600" />
                <span className="text-xs font-medium text-slate-400">No active chatrooms yet</span>
                <p className="text-[11px] text-slate-500 max-w-xs">
                  Create a chat and send the invite link to the person you want to talk with.
                </p>
              </div>
            ) : (
              rooms.map((r) => {
                const peer = r.peer;
                return (
                  <div
                    key={r.id}
                    onClick={() => onSelectRoom(r.id, r.token)}
                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-indigo-500/40 hover:bg-slate-900 cursor-pointer active:scale-99 transition group"
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {peer?.avatarUrl ? (
                        <img
                          src={peer.avatarUrl}
                          alt={peer.displayName}
                          className="w-11 h-11 rounded-full object-cover border border-slate-700"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-semibold text-sm">
                          {peer ? peer.displayName.charAt(0).toUpperCase() : <Users className="w-5 h-5" />}
                        </div>
                      )}
                      {peer && (
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${
                            peer.online ? 'bg-emerald-500' : 'bg-slate-500'
                          }`}
                        />
                      )}
                    </div>

                    {/* Room details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold truncate text-white">
                          {peer ? peer.displayName : 'Waiting for participant...'}
                        </span>
                        {r.unreadCount && r.unreadCount > 0 ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                            {r.unreadCount}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 mt-0.5">
                        <span className="truncate text-[11px]">
                          {peer ? formatLastSeen(peer.lastSeen, peer.online) : 'Solo in room'}
                        </span>
                        <span className="text-[10px] text-slate-500 group-hover:text-indigo-400 transition flex items-center gap-0.5">
                          Open <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Security Footer Badge */}
        <div className="py-2 px-3 rounded-xl bg-slate-900/40 border border-slate-900 text-slate-500 text-[11px] flex items-center justify-center gap-2 shrink-0 text-center">
          <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>Strict 2-person limit • Ephemeral Isolation • Persistent Server Sync</span>
        </div>
      </div>
    </div>
  );
};
