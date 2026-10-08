import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { RoomLobby } from './components/RoomLobby.js';
import { ChatRoomView } from './components/ChatRoomView.js';
import { AuthModal } from './components/AuthModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { AdminPortalModal } from './components/AdminPortalModal.js';
import { api } from './services/api.js';
import { ShieldAlert, Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [activeRoom, setActiveRoom] = useState<{ id: string; token: string } | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('duo_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
  });

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem('duo_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Register PWA service worker
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration skipped:', err);
      });
    }
  }, []);

  // Check URL path for direct room invitation or secret super admin trigger (#admin, #superadmin, /admin)
  useEffect(() => {
    const checkPathForInvite = () => {
      const pathname = window.location.pathname;
      const hash = window.location.hash;

      if (hash === '#admin' || hash === '#superadmin' || pathname === '/admin') {
        setAdminOpen(true);
      }

      let token: string | null = null;
      if (pathname.startsWith('/chat/')) {
        token = pathname.replace('/chat/', '').split('/')[0].split('?')[0];
      } else if (hash.startsWith('#/chat/')) {
        token = hash.replace('#/chat/', '').split('/')[0].split('?')[0];
      }

      if (token && token.trim()) {
        setPendingInviteToken(token.trim());
      }
    };

    checkPathForInvite();
    window.addEventListener('popstate', checkPathForInvite);
    window.addEventListener('hashchange', checkPathForInvite);

    // Secret keyboard shortcut (Ctrl+Shift+A or Cmd+Shift+A)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        setAdminOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', checkPathForInvite);
      window.removeEventListener('hashchange', checkPathForInvite);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Attempt to join pending invite once authenticated
  const joinPendingInvite = useCallback(async (token: string) => {
    setJoiningInvite(true);
    setInviteError(null);
    try {
      const res = await api.joinRoom(token);
      setActiveRoom({ id: res.room.id, token: res.room.token });
      setPendingInviteToken(null);
      // Clean URL without reloading
      window.history.replaceState({}, '', '/');
    } catch (err: any) {
      console.error('Failed to join invitation:', err);
      setInviteError(err.message || 'Chatroom not found or already has 2 participants.');
    } finally {
      setJoiningInvite(false);
    }
  }, []);

  useEffect(() => {
    if (user && pendingInviteToken && !joiningInvite && !inviteError) {
      joinPendingInvite(pendingInviteToken);
    }
  }, [user, pendingInviteToken, joiningInvite, inviteError, joinPendingInvite]);

  const handleSelectRoom = (roomId: string, token: string) => {
    setActiveRoom({ id: roomId, token });
    window.history.pushState({}, '', `/chat/${token}`);
  };

  const handleBackToLobby = () => {
    setActiveRoom(null);
    setInviteError(null);
    setPendingInviteToken(null);
    window.history.pushState({}, '', '/');
  };

  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Not logged in: Show Auth modal
  if (!user) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center bg-slate-950 overflow-hidden">
        <AuthModal
          isOpen={true}
          inviteContextText={
            pendingInviteToken
              ? 'You have been invited to a private 2-person chat. Pick a nickname to join.'
              : undefined
          }
        />
        <AdminPortalModal
          isOpen={adminOpen}
          onClose={() => {
            setAdminOpen(false);
            if (window.location.hash.includes('admin')) {
              window.history.replaceState({}, '', '/');
            }
          }}
        />
      </div>
    );
  }

  // Joining invite loader / error state
  if (joiningInvite) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-300 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-sm font-medium">Validating private invitation...</span>
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold mb-2">Unable to Join Chat</h2>
        <p className="text-sm text-slate-400 max-w-xs mb-6 leading-relaxed">{inviteError}</p>
        <button
          onClick={handleBackToLobby}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition"
        >
          Go to Home
        </button>
      </div>
    );
  }

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      {activeRoom ? (
        <ChatRoomView
          roomId={activeRoom.id}
          roomToken={activeRoom.token}
          onBack={handleBackToLobby}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <RoomLobby
          onSelectRoom={handleSelectRoom}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
      />

      <AdminPortalModal
        isOpen={adminOpen}
        onClose={() => {
          setAdminOpen(false);
          if (window.location.hash.includes('admin')) {
            window.history.replaceState({}, '', '/');
          }
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
