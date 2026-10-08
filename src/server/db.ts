import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface User {
  id: string;
  display_name: string;
  avatar_url?: string;
  session_token: string;
  created_at: number;
  updated_at: number;
  last_seen: number;
}

export interface ChatRoom {
  id: string;
  room_token: string;
  created_by: string;
  created_at: number;
  updated_at: number;
  status: 'active' | 'closed';
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: number;
  last_read_message_id?: string;
  role: 'creator' | 'guest';
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
}

interface DatabaseSchema {
  users: Record<string, User>;
  chat_rooms: Record<string, ChatRoom>;
  room_members: Record<string, RoomMember>;
  messages: Record<string, Message>;
  attachments: Record<string, MessageAttachment>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

class DatabaseStore {
  private data: DatabaseSchema = {
    users: {},
    chat_rooms: {},
    room_members: {},
    messages: {},
    attachments: {},
  };
  private isSaving = false;
  private needsSave = false;

  constructor() {
    this.init();
  }

  private init() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        // Ensure all top level collections exist
        this.data.users = this.data.users || {};
        this.data.chat_rooms = this.data.chat_rooms || {};
        this.data.room_members = this.data.room_members || {};
        this.data.messages = this.data.messages || {};
        this.data.attachments = this.data.attachments || {};
      } catch (err) {
        console.error('Failed to read database file, initializing empty schema:', err);
      }
    } else {
      this.persistSync();
    }
  }

  private persistSync() {
    try {
      const tempPath = `${DB_FILE}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Failed to persist database:', err);
    }
  }

  public save() {
    if (this.isSaving) {
      this.needsSave = true;
      return;
    }
    this.isSaving = true;
    setTimeout(() => {
      this.persistSync();
      this.isSaving = false;
      if (this.needsSave) {
        this.needsSave = false;
        this.save();
      }
    }, 15);
  }

  // --- Users ---
  public createUser(displayName: string, avatarUrl?: string): User {
    const id = `usr_${crypto.randomUUID()}`;
    const sessionToken = `tok_${crypto.randomBytes(32).toString('hex')}`;
    const now = Date.now();
    const user: User = {
      id,
      display_name: displayName.trim(),
      avatar_url: avatarUrl,
      session_token: sessionToken,
      created_at: now,
      updated_at: now,
      last_seen: now,
    };
    this.data.users[id] = user;
    this.save();
    return user;
  }

  public getUserByToken(token: string): User | undefined {
    return Object.values(this.data.users).find((u) => u.session_token === token);
  }

  public getUserById(id: string): User | undefined {
    return this.data.users[id];
  }

  public updateUserLastSeen(userId: string): void {
    if (this.data.users[userId]) {
      this.data.users[userId].last_seen = Date.now();
      this.data.users[userId].updated_at = Date.now();
      this.save();
    }
  }

  public updateUserProfile(userId: string, displayName: string, avatarUrl?: string): User | undefined {
    const user = this.data.users[userId];
    if (!user) return undefined;
    user.display_name = displayName.trim() || user.display_name;
    if (avatarUrl !== undefined) user.avatar_url = avatarUrl;
    user.updated_at = Date.now();
    this.save();
    return user;
  }

  // --- Chat Rooms ---
  public createRoom(creatorUserId: string): { room: ChatRoom; member: RoomMember } {
    const roomId = `room_${crypto.randomUUID()}`;
    // Cryptographically strong random room token (unpredictable URL token)
    const roomToken = crypto.randomBytes(16).toString('hex');
    const now = Date.now();

    const room: ChatRoom = {
      id: roomId,
      room_token: roomToken,
      created_by: creatorUserId,
      created_at: now,
      updated_at: now,
      status: 'active',
    };

    const memberId = `mem_${crypto.randomUUID()}`;
    const member: RoomMember = {
      id: memberId,
      room_id: roomId,
      user_id: creatorUserId,
      joined_at: now,
      role: 'creator',
    };

    this.data.chat_rooms[roomId] = room;
    this.data.room_members[memberId] = member;
    this.save();

    return { room, member };
  }

  public getRoomById(roomId: string): ChatRoom | undefined {
    return this.data.chat_rooms[roomId];
  }

  public getRoomByToken(roomToken: string): ChatRoom | undefined {
    return Object.values(this.data.chat_rooms).find((r) => r.room_token === roomToken);
  }

  public getRoomMembers(roomId: string): RoomMember[] {
    return Object.values(this.data.room_members).filter((m) => m.room_id === roomId);
  }

  public getMember(roomId: string, userId: string): RoomMember | undefined {
    return Object.values(this.data.room_members).find(
      (m) => m.room_id === roomId && m.user_id === userId
    );
  }

  public getUserRooms(userId: string): { room: ChatRoom; peer?: User; unreadCount: number }[] {
    const userMembers = Object.values(this.data.room_members).filter((m) => m.user_id === userId);
    const results: { room: ChatRoom; peer?: User; unreadCount: number }[] = [];

    for (const mem of userMembers) {
      const room = this.data.chat_rooms[mem.room_id];
      if (!room || room.status !== 'active') continue;

      const members = this.getRoomMembers(room.id);
      const peerMember = members.find((m) => m.user_id !== userId);
      const peer = peerMember ? this.getUserById(peerMember.user_id) : undefined;

      // Count unread messages
      const roomMsgs = Object.values(this.data.messages).filter((msg) => msg.room_id === room.id);
      let unreadCount = 0;
      for (const msg of roomMsgs) {
        if (msg.sender_id !== userId && !msg.read_at) {
          unreadCount++;
        }
      }

      results.push({ room, peer, unreadCount });
    }

    results.sort((a, b) => b.room.updated_at - a.room.updated_at);
    return results;
  }

  /**
   * Enforces strict two-person maximum room occupancy in a safe atomic check.
   * If user is already a member, returns existing membership.
   * If exactly 2 other users exist, throws room full error.
   */
  public joinRoom(roomId: string, userId: string): { success: boolean; member?: RoomMember; error?: string } {
    const room = this.data.chat_rooms[roomId];
    if (!room || room.status !== 'active') {
      return { success: false, error: 'Chat room not found or closed.' };
    }

    const currentMembers = this.getRoomMembers(roomId);
    const existingMember = currentMembers.find((m) => m.user_id === userId);
    if (existingMember) {
      return { success: true, member: existingMember };
    }

    // STRICT TWO-PERSON CHECK
    if (currentMembers.length >= 2) {
      return { success: false, error: 'Chat room is full.' };
    }

    const memberId = `mem_${crypto.randomUUID()}`;
    const newMember: RoomMember = {
      id: memberId,
      room_id: roomId,
      user_id: userId,
      joined_at: Date.now(),
      role: 'guest',
    };

    this.data.room_members[memberId] = newMember;
    room.updated_at = Date.now();
    this.save();

    return { success: true, member: newMember };
  }

  // --- Messages ---
  public createMessage(params: {
    id?: string;
    roomId: string;
    senderId: string;
    messageType: 'text' | 'image' | 'file';
    textContent?: string;
    attachment?: MessageAttachment;
  }): Message {
    const id = params.id || `msg_${crypto.randomUUID()}`;
    const now = Date.now();

    const message: Message = {
      id,
      room_id: params.roomId,
      sender_id: params.senderId,
      message_type: params.messageType,
      text_content: params.textContent,
      created_at: now,
      updated_at: now,
      delivered_at: null,
      read_at: null,
      attachment: params.attachment,
    };

    this.data.messages[id] = message;

    if (params.attachment) {
      this.data.attachments[params.attachment.id] = params.attachment;
    }

    // Update room timestamp
    if (this.data.chat_rooms[params.roomId]) {
      this.data.chat_rooms[params.roomId].updated_at = now;
    }

    this.save();
    return message;
  }

  public getMessages(roomId: string, limit = 50, beforeTimestamp?: number): { messages: Message[]; hasMore: boolean } {
    const all = Object.values(this.data.messages)
      .filter((m) => m.room_id === roomId)
      .sort((a, b) => a.created_at - b.created_at);

    let filtered = all;
    if (beforeTimestamp) {
      filtered = all.filter((m) => m.created_at < beforeTimestamp);
    }

    const startIndex = Math.max(0, filtered.length - limit);
    const paginated = filtered.slice(startIndex);
    const hasMore = startIndex > 0;

    return { messages: paginated, hasMore };
  }

  public getMessageById(messageId: string): Message | undefined {
    return this.data.messages[messageId];
  }

  public markDelivered(roomId: string, recipientUserId: string): string[] {
    const updatedIds: string[] = [];
    const now = Date.now();
    for (const msg of Object.values(this.data.messages)) {
      if (msg.room_id === roomId && msg.sender_id !== recipientUserId && !msg.delivered_at) {
        msg.delivered_at = now;
        msg.updated_at = now;
        updatedIds.push(msg.id);
      }
    }
    if (updatedIds.length > 0) {
      this.save();
    }
    return updatedIds;
  }

  public markRead(roomId: string, readerUserId: string): string[] {
    const updatedIds: string[] = [];
    const now = Date.now();
    for (const msg of Object.values(this.data.messages)) {
      if (msg.room_id === roomId && msg.sender_id !== readerUserId && !msg.read_at) {
        if (!msg.delivered_at) msg.delivered_at = now;
        msg.read_at = now;
        msg.updated_at = now;
        updatedIds.push(msg.id);
      }
    }

    // Update member's last read
    const member = this.getMember(roomId, readerUserId);
    if (member && updatedIds.length > 0) {
      member.last_read_message_id = updatedIds[updatedIds.length - 1];
    }

    if (updatedIds.length > 0) {
      this.save();
    }
    return updatedIds;
  }

  public searchMessages(roomId: string, query: string): Message[] {
    const lower = query.toLowerCase().trim();
    if (!lower) return [];
    return Object.values(this.data.messages)
      .filter(
        (m) =>
          m.room_id === roomId &&
          ((m.text_content && m.text_content.toLowerCase().includes(lower)) ||
            (m.attachment && m.attachment.file_name.toLowerCase().includes(lower)))
      )
      .sort((a, b) => b.created_at - a.created_at);
  }

  public getSharedMedia(roomId: string): { images: Message[]; files: Message[] } {
    const roomMessages = Object.values(this.data.messages)
      .filter((m) => m.room_id === roomId)
      .sort((a, b) => b.created_at - a.created_at);

    const images: Message[] = [];
    const files: Message[] = [];

    for (const msg of roomMessages) {
      if (msg.message_type === 'image' && msg.attachment) {
        images.push(msg);
      } else if (msg.message_type === 'file' && msg.attachment) {
        files.push(msg);
      }
    }

    return { images, files };
  }

  public getAttachmentByStorageKey(storageKey: string): MessageAttachment | undefined {
    return Object.values(this.data.attachments).find((a) => a.storage_key === storageKey);
  }
}

export const db = new DatabaseStore();
export { UPLOADS_DIR };
