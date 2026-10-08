import React, { useState } from 'react';
import { Shield, Sparkles, KeyRound, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

interface AuthModalProps {
  isOpen: boolean;
  onSuccess?: () => void;
  inviteContextText?: string;
}

const AVATAR_OPTIONS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
];

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onSuccess, inviteContextText }) => {
  const { registerUser, loginWithToken } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_OPTIONS[0]);
  const [isRestoreMode, setIsRestoreMode] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isRestoreMode) {
      if (!secretKey.trim()) {
        setError('Please enter your session key');
        return;
      }
      setLoading(true);
      try {
        await loginWithToken(secretKey.trim());
        if (onSuccess) onSuccess();
      } catch (err: any) {
        setError(err.message || 'Invalid session key. Account not found.');
      } finally {
        setLoading(false);
      }
    } else {
      const name = displayName.trim() || 'Anonymous';
      setLoading(true);
      try {
        await registerUser(name, selectedAvatar);
        if (onSuccess) onSuccess();
      } catch (err: any) {
        setError(err.message || 'Failed to start private chat session.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in text-slate-100">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-3 text-indigo-400">
            <Shield className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            {isRestoreMode ? 'Restore Account' : 'Welcome to Duo'}
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            {inviteContextText ||
              (isRestoreMode
                ? 'Enter your private session key to reconnect to your chats.'
                : 'Zero sign-up hassle. Choose a nickname to start private chatting.')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isRestoreMode ? (
            <>
              {/* Display Name Input */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Your Nickname
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Sam, Alex, Sky..."
                  maxLength={30}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition"
                />
              </div>

              {/* Avatar Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Choose Avatar
                </label>
                <div className="flex items-center justify-between gap-1">
                  {AVATAR_OPTIONS.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedAvatar(url)}
                      className={`relative w-10 h-10 rounded-full overflow-hidden border-2 transition active:scale-95 ${
                        selectedAvatar === url
                          ? 'border-indigo-500 scale-105 ring-2 ring-indigo-500/30'
                          : 'border-slate-700 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt="Avatar" className="w-full h-full object-cover" />
                      {selectedAvatar === url && (
                        <div className="absolute inset-0 bg-indigo-600/40 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Session Transfer Key
              </label>
              <textarea
                required
                rows={3}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="Paste your tok_... session key"
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-xs font-mono text-white placeholder:text-slate-600 outline-none resize-none transition"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-400 text-center font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 transition text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Connecting...</span>
            ) : isRestoreMode ? (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Restore & Continue</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Start Chatting</span>
              </>
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-5 pt-4 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={() => {
              setIsRestoreMode(!isRestoreMode);
              setError('');
            }}
            className="text-xs text-slate-400 hover:text-indigo-400 transition"
          >
            {isRestoreMode
              ? "Don't have a key? Create a new session"
              : 'Switching phones? Restore session with key'}
          </button>
        </div>
      </div>
    </div>
  );
};
