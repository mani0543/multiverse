import React, { useState } from 'react';
import { X, Key, Copy, Check, Volume2, VolumeX, Moon, Sun, User as UserIcon, LogOut, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { sound } from '../utils/sound.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  onToggleTheme,
}) => {
  const { user, token, updateProfile, loginWithToken, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [keyCopied, setKeyCopied] = useState(false);
  const [importKey, setImportKey] = useState('');
  const [importError, setImportError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(sound.enabled);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  if (!isOpen) return null;

  const handleCopyKey = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setIsSavingProfile(true);
    try {
      await updateProfile(displayName.trim());
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleRestoreAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importKey.trim()) return;
    setImportError('');
    try {
      await loginWithToken(importKey.trim());
      setImportKey('');
      onClose();
    } catch (err: any) {
      setImportError(err.message || 'Invalid Session Key. Could not restore account.');
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    sound.enabled = next;
    setSoundEnabled(next);
    if (next) sound.playSentChime();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in text-slate-100">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold mb-4">Settings & Sync</h3>

        {/* Profile Section */}
        <form onSubmit={handleSaveProfile} className="mb-6 pb-6 border-b border-slate-800">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Your Profile
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter display name"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSavingProfile || displayName === user?.displayName}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition"
            >
              Save
            </button>
          </div>
        </form>

        {/* Multi-Device Secret Key Section */}
        <div className="mb-6 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-1.5">
            <Smartphone className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-semibold">Multi-Device Transfer Key</h4>
          </div>
          <p className="text-xs text-slate-400 mb-3 leading-relaxed">
            Changing phone or switching browser? Copy this session key. Entering it on another device instantly restores all your private rooms and messages.
          </p>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center gap-2 mb-4">
            <span className="font-mono text-xs text-slate-300 truncate flex-1 select-all">
              {token || 'Loading...'}
            </span>
            <button
              onClick={handleCopyKey}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition shrink-0"
            >
              {keyCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
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

          {/* Restore on this device */}
          <form onSubmit={handleRestoreAccount} className="space-y-2">
            <label className="text-xs text-slate-400 block font-medium">
              Restore existing account with key:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                placeholder="Paste session key here..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                type="submit"
                disabled={!importKey.trim()}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 rounded-xl transition shrink-0"
              >
                Restore
              </button>
            </div>
            {importError && <p className="text-xs text-red-400 mt-1">{importError}</p>}
          </form>
        </div>

        {/* Preferences */}
        <div className="space-y-3 mb-6">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Preferences
          </label>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-3">
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-indigo-400" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-500" />
              )}
              <div>
                <span className="text-sm font-medium block">Sound Effects</span>
                <span className="text-xs text-slate-400">Chime on new and sent messages</span>
              </div>
            </div>
            <button
              onClick={toggleSound}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition ${
                soundEnabled ? 'bg-indigo-600 justify-end' : 'bg-slate-800 justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-md"></div>
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-3">
              {isDarkMode ? (
                <Moon className="w-5 h-5 text-indigo-400" />
              ) : (
                <Sun className="w-5 h-5 text-amber-400" />
              )}
              <div>
                <span className="text-sm font-medium block">Theme</span>
                <span className="text-xs text-slate-400">{isDarkMode ? 'Dark Mode' : 'Light Mode'}</span>
              </div>
            </div>
            <button
              onClick={onToggleTheme}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
            >
              Toggle
            </button>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => {
            logout();
            onClose();
          }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium text-sm transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Reset Session On This Device</span>
        </button>
      </div>
    </div>
  );
};
