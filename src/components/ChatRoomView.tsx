import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import type { ChatRoom, ConnectionState, Message } from '../types.js';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../services/api.js';
import { socketClient } from '../services/socket.js';
import { sound } from '../utils/sound.js';
import { Header } from './Header.js';
import { MessageItem } from './MessageItem.js';
import { MessageComposer } from './MessageComposer.js';
import { InviteModal } from './InviteModal.js';
import { ImageViewerModal } from './ImageViewerModal.js';
import { SharedMediaModal } from './SharedMediaModal.js';
import { SearchOverlay } from './SearchOverlay.js';
import { SettingsModal } from './SettingsModal.js';
import { formatChatDividerDate } from '../utils/format.js';
import { Loader2, ShieldAlert } from 'lucide-react';

interface ChatRoomViewProps {
  roomId: string;
  roomToken: string;
  onBack: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const ChatRoomView: React.FC<ChatRoomViewProps> = ({
  roomId,
  roomToken,
  onBack,
  isDarkMode,
  onToggleTheme,
}) => {
  const { user } = useAuth();
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  // Modals state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [sharedMediaOpen, setSharedMediaOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  // Fullscreen Image Lightbox
  const [lightboxData, setLightboxData] = useState<{
    url: string;
    fileName?: string;
    downloadUrl?: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const shouldRestoreScrollRef = useRef(false);

  // 1. Fetch Room Info & Initial Messages
  const loadRoomData = useCallback(async () => {
    try {
      setLoading(true);
      setRoomError(null);

      const [roomRes, msgRes] = await Promise.all([
        api.getRoom(roomId),
        api.getMessages(roomId, 40),
      ]);

      setRoom({
        ...roomRes.room,
        peer: roomRes.peer,
        totalMembers: roomRes.totalMembers,
      });

      setMessages(msgRes.messages || []);
      setHasMore(msgRes.hasMore || false);

      // Join socket room
      socketClient.setRoom(roomId);

      // Mark unread messages as read
      api.markAsRead(roomId).catch(() => {});
      socketClient.sendReadReceipt();
    } catch (err: any) {
      console.error('Failed to load chatroom:', err);
      setRoomError(err.message || 'Chatroom not available or full.');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    loadRoomData();

    return () => {
      socketClient.setRoom(null);
    };
  }, [loadRoomData]);

  // If newly created and solo, auto show invite modal once
  useEffect(() => {
    if (room && !room.peer) {
      setInviteModalOpen(true);
    }
  }, [room?.peer]);

  // 2. Real-Time Socket Event Subscriptions
  useEffect(() => {
    const unsubState = socketClient.onStateChange((state) => {
      setConnectionState(state);
      // Re-fetch messages on reconnect to sync missed messages
      if (state === 'connected') {
        api.getMessages(roomId, 40).then((res) => {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newOnes = res.messages.filter((m) => !existingIds.has(m.id));
            return [...prev, ...newOnes].sort((a, b) => a.created_at - b.created_at);
          });
          api.markAsRead(roomId).catch(() => {});
        }).catch(() => {});
      }
    });

    const unsubMsg = socketClient.onMessage((newMsg) => {
      if (newMsg.room_id !== roomId) return;

      setMessages((prev) => {
        // Prevent duplicate if already added
        const exists = prev.some((m) => m.id === newMsg.id);
        if (exists) {
          return prev.map((m) => (m.id === newMsg.id ? newMsg : m));
        }
        return [...prev, newMsg];
      });

      if (newMsg.sender_id !== user?.id) {
        sound.playIncomingChime();
        // Mark as read immediately if window is visible
        if (document.visibilityState === 'visible') {
          api.markAsRead(roomId).catch(() => {});
          socketClient.sendReadReceipt();
        }
      }

      // Auto scroll to bottom
      scrollToBottom();
    });

    const unsubDelivered = socketClient.onDelivered((data) => {
      if (data.roomId !== roomId) return;
      setMessages((prev) =>
        prev.map((m) =>
          data.messageIds.includes(m.id) && !m.delivered_at
            ? { ...m, delivered_at: data.deliveredAt }
            : m
        )
      );
    });

    const unsubRead = socketClient.onRead((data) => {
      if (data.roomId !== roomId) return;
      setMessages((prev) =>
        prev.map((m) =>
          data.messageIds.includes(m.id)
            ? { ...m, delivered_at: m.delivered_at || data.readAt, read_at: data.readAt }
            : m
        )
      );
    });

    const unsubTyping = socketClient.onTyping((data) => {
      if (data.roomId === roomId && data.userId !== user?.id) {
        setIsPeerTyping(data.isTyping);
      }
    });

    const unsubPresence = socketClient.onPresence((data) => {
      if (data.roomId === roomId) {
        setRoom((prev) =>
          prev && prev.peer
            ? {
                ...prev,
                peer: {
                  ...prev.peer,
                  online: data.online,
                  lastSeen: data.lastSeen || prev.peer.lastSeen,
                },
              }
            : prev
        );
      }
    });

    const unsubPeerJoined = socketClient.onPeerJoined((data) => {
      if (data.roomId === roomId) {
        setRoom((prev) =>
          prev
            ? {
                ...prev,
                peer: {
                  id: data.user.id,
                  displayName: data.user.displayName,
                  avatarUrl: data.user.avatarUrl,
                  online: true,
                  lastSeen: Date.now(),
                },
                totalMembers: 2,
              }
            : prev
        );
      }
    });

    return () => {
      unsubState();
      unsubMsg();
      unsubDelivered();
      unsubRead();
      unsubTyping();
      unsubPresence();
      unsubPeerJoined();
    };
  }, [roomId, user?.id]);

  // Mark read when user focuses window
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && roomId) {
        api.markAsRead(roomId).catch(() => {});
        socketClient.sendReadReceipt();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [roomId]);

  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom(false);
    }
  }, [loading]);

  // 3. Infinite Scroll Upward (load older messages)
  const handleScroll = async () => {
    const el = scrollContainerRef.current;
    if (!el || loadingMore || !hasMore) return;

    if (el.scrollTop <= 60 && messages.length > 0) {
      setLoadingMore(true);
      const oldestTimestamp = messages[0].created_at;

      prevScrollHeightRef.current = el.scrollHeight;
      prevScrollTopRef.current = el.scrollTop;
      shouldRestoreScrollRef.current = true;

      try {
        const res = await api.getMessages(roomId, 40, oldestTimestamp);
        setMessages((prev) => [...res.messages, ...prev]);
        setHasMore(res.hasMore);
      } catch (err) {
        console.error('Failed to load older messages:', err);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  // Preserve scroll position when older messages are prepended
  useLayoutEffect(() => {
    if (shouldRestoreScrollRef.current && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      const heightDiff = el.scrollHeight - prevScrollHeightRef.current;
      el.scrollTop = prevScrollTopRef.current + heightDiff;
      shouldRestoreScrollRef.current = false;
    }
  }, [messages]);

  // Jump to specific message from search
  const handleJumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(messageId);
      setTimeout(() => setHighlightedMsgId(null), 3000);
    }
  };

  // 4. Send Message (Text) with Optimistic UI
  const handleSendMessage = async (text: string) => {
    if (!user) return;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const optimisticMessage: Message = {
      id: tempId,
      room_id: roomId,
      sender_id: user.id,
      message_type: 'text',
      text_content: text,
      created_at: Date.now(),
      updated_at: Date.now(),
      delivered_at: null,
      read_at: null,
      isPending: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    sound.playSentChime();
    scrollToBottom();

    try {
      const res = await api.sendMessage(roomId, text, tempId);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...res.message, isPending: false } : m))
      );
    } catch (err) {
      console.error('Failed to send text:', err);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, isPending: false, hasError: true } : m))
      );
    }
  };

  // 5. Send Attachment (Image or File)
  const handleSendAttachment = async (
    file: File,
    caption?: string,
    onProgress?: (percent: number) => void
  ) => {
    if (!user) return;
    const tempId = `temp_att_${Date.now()}`;
    const isImage = file.type.startsWith('image/');

    const optimisticMessage: Message = {
      id: tempId,
      room_id: roomId,
      sender_id: user.id,
      message_type: isImage ? 'image' : 'file',
      text_content: caption,
      created_at: Date.now(),
      updated_at: Date.now(),
      isPending: true,
      attachment: {
        id: `att_${tempId}`,
        message_id: tempId,
        room_id: roomId,
        uploaded_by: user.id,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        storage_key: '',
        created_at: Date.now(),
      },
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    scrollToBottom();

    try {
      const res = await api.uploadAttachment(roomId, file, caption, tempId, onProgress);
      sound.playSentChime();
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...res.message, isPending: false } : m))
      );
    } catch (err: any) {
      alert(err.message || 'File upload failed');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw err;
    }
  };

  if (roomError) {
    return (
      <div className="flex-1 w-full max-w-lg mx-auto flex flex-col items-center justify-center p-6 text-center text-slate-100 bg-slate-950">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-400 max-w-xs mb-6 leading-relaxed">{roomError}</p>
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition"
        >
          Return to Conversations
        </button>
      </div>
    );
  }

  if (loading || !room) {
    return (
      <div className="flex-1 w-full max-w-lg mx-auto flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-3">
        <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
        <span className="text-xs font-medium">Entering private room...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-lg mx-auto flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative shadow-2xl">
      {/* Header */}
      <Header
        room={room}
        connectionState={connectionState}
        isPeerTyping={isPeerTyping}
        onBack={onBack}
        onOpenInvite={() => setInviteModalOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSharedMedia={() => setSharedMediaOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onLeaveRoom={onBack}
      />

      {/* In-Chat Search Overlay */}
      <SearchOverlay
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        roomId={roomId}
        onJumpToMessage={handleJumpToMessage}
      />

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-1 py-3 flex flex-col gap-1 overscroll-contain"
      >
        {/* Loading older indicator */}
        {loadingMore && (
          <div className="w-full flex items-center justify-center py-2 text-xs text-slate-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Loading older messages...</span>
          </div>
        )}

        {/* Solo Room Invitation Banner */}
        {!room.peer && (
          <div className="mx-4 my-4 p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 text-center flex flex-col items-center gap-2">
            <span className="text-xs font-semibold text-indigo-300">
              You are the first participant in this room
            </span>
            <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
              Share the invitation link or QR code with one friend. Once they connect, the room is locked.
            </p>
            <button
              onClick={() => setInviteModalOpen(true)}
              className="mt-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition active:scale-95"
            >
              Share Private Invite
            </button>
          </div>
        )}

        {/* Message Items with Date Dividers */}
        {messages.map((msg, index) => {
          const isOwn = msg.sender_id === user?.id;
          const prevMsg = messages[index - 1];
          const isNewDay =
            !prevMsg ||
            new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();

          return (
            <React.Fragment key={msg.id}>
              {isNewDay && (
                <div className="w-full flex items-center justify-center my-3 select-none">
                  <span className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-medium">
                    {formatChatDividerDate(msg.created_at)}
                  </span>
                </div>
              )}

              <MessageItem
                message={msg}
                isOwn={isOwn}
                roomId={roomId}
                isHighlighted={highlightedMsgId === msg.id}
                onOpenImage={(url, fileName, downloadUrl) =>
                  setLightboxData({ url, fileName, downloadUrl })
                }
              />
            </React.Fragment>
          );
        })}

        <div ref={messagesEndRef} className="h-1 shrink-0" />
      </div>

      {/* Message Composer */}
      <MessageComposer
        onSendMessage={handleSendMessage}
        onSendAttachment={handleSendAttachment}
      />

      {/* Modals */}
      <InviteModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        roomToken={roomToken}
      />

      <SharedMediaModal
        isOpen={sharedMediaOpen}
        onClose={() => setSharedMediaOpen(false)}
        roomId={roomId}
        onSelectImage={(url, fileName, downloadUrl) => {
          setSharedMediaOpen(false);
          setLightboxData({ url, fileName, downloadUrl });
        }}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
      />

      {lightboxData && (
        <ImageViewerModal
          isOpen={true}
          onClose={() => setLightboxData(null)}
          imageUrl={lightboxData.url}
          fileName={lightboxData.fileName}
          downloadUrl={lightboxData.downloadUrl}
        />
      )}
    </div>
  );
};
