import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Lock,
  X,
  Trash2,
  Eye,
  ArrowLeft,
  Database,
  Cloud,
  MessageSquare,
  Users,
  Search,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../services/api.js';
import type { AdminRoomOverview, Message } from '../types.js';
import { formatMessageTime } from '../utils/format.js';

interface AdminPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPortalModal: React.FC<AdminPortalModalProps> = ({ isOpen, onClose }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(api.getAdminToken());
  });
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  // Dashboard Data
  const [rooms, setRooms] = useState<AdminRoomOverview[]>([]);
  const [stats, setStats] = useState<{ totalRooms: number; totalMessages: number; database: any; cloudinary: string } | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [inspectedMessages, setInspectedMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const [roomsRes, statsRes] = await Promise.all([
        api.adminGetRooms(),
        api.adminGetStats(),
      ]);
      setRooms(roomsRes.rooms || []);
      setStats(statsRes);
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('403')) {
        setIsAuthenticated(false);
        api.setAdminToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      loadAdminData();
    }
  }, [isOpen, isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      await api.adminLogin(password.trim(), username.trim());
      setIsAuthenticated(true);
      setPassword('');
      loadAdminData();
    } catch (err: any) {
      setLoginError(err.message || 'Invalid super admin credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.setAdminToken(null);
    setIsAuthenticated(false);
    setSelectedRoomId(null);
  };

  const handleInspectRoom = async (roomId: string) => {
    setSelectedRoomId(roomId);
    setLoadingMessages(true);
    try {
      const res = await api.adminGetRoomMessages(roomId);
      setInspectedMessages(res.messages || []);
    } catch (err: any) {
      alert(err.message || 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleDeleteMessage = async (roomId: string, messageId: string) => {
    if (!confirm('Are you sure you want to permanently delete this message?')) return;
    try {
      await api.adminDeleteMessage(roomId, messageId);
      setInspectedMessages((prev) => prev.filter((m) => m.id !== messageId));
      setRooms((prev) =>
        prev.map((r) =>
          r.room.id === roomId ? { ...r, messageCount: Math.max(0, r.messageCount - 1) } : r
        )
      );
    } catch (err: any) {
      alert(err.message || 'Failed to delete message');
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to permanently terminate this private chatroom and all its data?')) return;
    try {
      await api.adminDeleteRoom(roomId);
      setRooms((prev) => prev.filter((r) => r.room.id !== roomId));
      if (selectedRoomId === roomId) {
        setSelectedRoomId(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete room');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in text-slate-100 font-sans">
      <div className="relative w-full max-w-4xl h-[90vh] rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-wide uppercase text-amber-400">
                  Super Admin Management
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  Restricted Access
                </span>
              </div>
              <p className="text-xs text-slate-400">Master moderation & room supervisor</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Log Out
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {!isAuthenticated ? (
          /* Login Form */
          <div className="flex-1 flex items-center justify-center p-6">
            <form
              onSubmit={handleLogin}
              className="w-full max-w-sm p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-4 shadow-xl"
            >
              <div className="text-center mb-1">
                <Lock className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <h4 className="font-semibold text-base text-white">Super Admin Authentication</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enter master security credentials to access management console.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Master Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {loginError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 text-center font-medium">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-98 transition text-sm font-semibold text-slate-950 mt-1 shadow-lg shadow-amber-600/20"
              >
                {loading ? 'Authenticating...' : 'Enter Admin Console'}
              </button>
            </form>
          </div>
        ) : selectedRoomId ? (
          /* Inspecting Room Messages */
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/60">
              <button
                onClick={() => setSelectedRoomId(null)}
                className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Rooms</span>
              </button>
              <span className="font-mono text-xs text-slate-400 truncate max-w-xs">
                Room: {selectedRoomId}
              </span>
              <button
                onClick={() => handleDeleteRoom(selectedRoomId)}
                className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-medium transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Room</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingMessages ? (
                <div className="text-center py-12 text-xs text-slate-500">Loading messages...</div>
              ) : inspectedMessages.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-500">No messages in this room yet.</div>
              ) : (
                inspectedMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-3 group hover:border-slate-700 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-mono text-amber-400 truncate">
                          Sender: {msg.sender_id.substring(0, 12)}...
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatMessageTime(msg.created_at)}
                        </span>
                        {msg.attachment?.cloudinary_url && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-sky-950 text-sky-400 border border-sky-800">
                            Cloudinary
                          </span>
                        )}
                      </div>

                      {msg.reply_to && (
                        <div className="mb-1.5 pl-2 border-l-2 border-indigo-400 text-[11px] text-slate-400">
                          Replying to {msg.reply_to.sender_name}: {msg.reply_to.text_content || 'Media'}
                        </div>
                      )}

                      {msg.attachment && (
                        <div className="mb-1 text-xs text-indigo-300 flex items-center gap-1.5">
                          <span>Attachment: {msg.attachment.file_name}</span>
                          <a
                            href={msg.attachment.cloudinary_url || api.getAttachmentUrl(selectedRoomId, msg.attachment.storage_key)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] underline text-sky-400"
                          >
                            Open
                          </a>
                        </div>
                      )}

                      <p className="text-xs text-slate-200 whitespace-pre-wrap">{msg.text_content}</p>
                    </div>

                    <button
                      onClick={() => handleDeleteMessage(selectedRoomId, msg.id)}
                      title="Delete this message"
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Rooms Overview Dashboard */
          <div className="flex-1 flex flex-col min-h-0 p-5 overflow-y-auto gap-5">
            {/* System Monitor Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  <span>Total Rooms</span>
                </div>
                <div className="text-xl font-bold text-white">{rooms.length}</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>Total Messages</span>
                </div>
                <div className="text-xl font-bold text-white">{stats?.totalMessages ?? 0}</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <Database className="w-4 h-4 text-amber-400" />
                  <span>Database</span>
                </div>
                <div className="text-xs font-semibold text-emerald-400 truncate">
                  {stats?.database?.type === 'mongodb' ? 'MongoDB Atlas' : 'Local JSON Store'}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <Cloud className="w-4 h-4 text-sky-400" />
                  <span>Cloudinary</span>
                </div>
                <div className="text-xs font-semibold text-white">
                  {stats?.cloudinary === 'active' ? (
                    <span className="text-emerald-400">Connected</span>
                  ) : (
                    <span className="text-slate-400">Local/Mongo</span>
                  )}
                </div>
              </div>
            </div>

            {/* Filter & Refresh Bar */}
            <div className="flex items-center justify-between gap-3 shrink-0">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filter by room ID, token or member name..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                onClick={loadAdminData}
                disabled={loading}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Rooms List */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                Active Private Rooms ({rooms.length})
              </div>

              {rooms.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 rounded-2xl bg-slate-950 border border-slate-900">
                  No chatrooms currently exist on this platform.
                </div>
              ) : (
                rooms
                  .filter((r) => {
                    if (!filterQuery.trim()) return true;
                    const q = filterQuery.toLowerCase();
                    return (
                      r.room.id.toLowerCase().includes(q) ||
                      r.room.token.toLowerCase().includes(q) ||
                      r.members.some((m) => m.displayName.toLowerCase().includes(q))
                    );
                  })
                  .map((r) => (
                    <div
                      key={r.room.id}
                      className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm text-white truncate">
                            {r.members.map((m) => m.displayName).join(' & ') || 'Solo Room'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono">
                            {r.members.length}/2 Members
                          </span>
                        </div>

                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                          <span className="font-mono text-[11px] text-slate-500">ID: {r.room.id}</span>
                          <span>•</span>
                          <span>Messages: {r.messageCount}</span>
                          {r.lastMessage?.text && (
                            <>
                              <span>•</span>
                              <span className="italic text-slate-400 truncate max-w-xs">
                                "{r.lastMessage.text}"
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleInspectRoom(r.room.id)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 hover:text-white text-indigo-300 text-xs font-medium transition flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect Chats</span>
                        </button>

                        <button
                          onClick={() => handleDeleteRoom(r.room.id)}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition"
                          title="Delete entire room"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
