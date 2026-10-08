export interface User {
  id: string;
  displayName: string;
  avatarUrl?: string;
  createdAt?: number;
  lastSeen?: number;
}

export interface RoomMember {
  id: string;
  roomId: string;
  userId: string;
  joinedAt: number;
  role: 'creator' | 'guest';
}

export interface ChatRoom {
  id: string;
  token: string;
  createdBy?: string;
  createdAt: number;
  updatedAt?: number;
  unreadCount?: number;
  peer?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    online: boolean;
    lastSeen?: number;
  } | null;
  totalMembers?: number;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  room_id: string;
  uploaded_by: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_key: string;
  created_at: number;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  message_type: 'text' | 'image' | 'file';
  text_content?: string;
  created_at: number;
  updated_at: number;
  delivered_at?: number | null;
  read_at?: number | null;
  attachment?: MessageAttachment;
  // Local status for optimistic UI
  isPending?: boolean;
  hasError?: boolean;
}

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
