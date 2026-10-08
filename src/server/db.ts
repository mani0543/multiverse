import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';

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
  cloudinary_url?: string;
  cloudinary_public_id?: string;
}

export interface ReplyToPreview {
  id: string;
  sender_id: string;
  sender_name?: string;
  text_content?: string;
  message_type: 'text' | 'image' | 'file';
  file_name?: string;
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
  reply_to?: ReplyToPreview | null;
}

export interface AdminRoomOverview {
  room: {
    id: string;
    token: string;
    createdAt: number;
    updatedAt: number;
    status: string;
  };
  members: {
    id: string;
    userId: string;
    displayName: string;
    joinedAt: number;
    role: string;
  }[];
  messageCount: number;
  lastMessage?: {
    text?: string;
    type: string;
    createdAt: number;
    senderId: string;
  };
}

export interface IDatabaseStore {
  init(): Promise<void>;
  getStatus(): { type: 'mongodb' | 'file'; connected: boolean; details?: string; mongoStatus?: string; mongoNotice?: string };
  createUser(displayName: string, avatarUrl?: string): Promise<User>;
  getUserByToken(token: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  updateUserLastSeen(userId: string): Promise<void>;
  updateUserProfile(userId: string, displayName: string, avatarUrl?: string): Promise<User | undefined>;
  createRoom(creatorUserId: string): Promise<{ room: ChatRoom; member: RoomMember }>;
  getRoomById(roomId: string): Promise<ChatRoom | undefined>;
  getRoomByToken(roomToken: string): Promise<ChatRoom | undefined>;
  getRoomMembers(roomId: string): Promise<RoomMember[]>;
  getMember(roomId: string, userId: string): Promise<RoomMember | undefined>;
  getUserRooms(userId: string): Promise<{ room: ChatRoom; peer?: User; unreadCount: number }[]>;
  joinRoom(roomId: string, userId: string): Promise<{ success: boolean; member?: RoomMember; error?: string }>;
  createMessage(params: {
    id?: string;
    roomId: string;
    senderId: string;
    messageType: 'text' | 'image' | 'file';
    textContent?: string;
    attachment?: MessageAttachment;
    replyTo?: ReplyToPreview | null;
  }): Promise<Message>;
  getMessages(roomId: string, limit?: number, beforeTimestamp?: number): Promise<{ messages: Message[]; hasMore: boolean }>;
  getMessageById(messageId: string): Promise<Message | undefined>;
  deleteMessage(messageId: string, roomId: string): Promise<{ success: boolean; attachment?: MessageAttachment }>;
  markDelivered(roomId: string, recipientUserId: string): Promise<string[]>;
  markRead(roomId: string, readerUserId: string): Promise<string[]>;
  searchMessages(roomId: string, query: string): Promise<Message[]>;
  getSharedMedia(roomId: string): Promise<{ images: Message[]; files: Message[] }>;
  getAttachmentByStorageKey(storageKey: string): Promise<MessageAttachment | undefined>;
  saveAttachmentBlob(storageKey: string, buffer: Buffer): Promise<void>;
  getAttachmentBlob(storageKey: string): Promise<Buffer | null>;
  getAllRoomsForAdmin(): Promise<AdminRoomOverview[]>;
  deleteRoomForAdmin(roomId: string): Promise<boolean>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ==========================================
// 1. Local JSON File Store (Fallback)
// ==========================================
interface JsonSchema {
  users: Record<string, User>;
  chat_rooms: Record<string, ChatRoom>;
  room_members: Record<string, RoomMember>;
  messages: Record<string, Message>;
  attachments: Record<string, MessageAttachment>;
}

class JsonFileDbStore implements IDatabaseStore {
  private data: JsonSchema = {
    users: {},
    chat_rooms: {},
    room_members: {},
    messages: {},
    attachments: {},
  };
  private isSaving = false;
  private needsSave = false;

  async init(): Promise<void> {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        this.data.users = this.data.users || {};
        this.data.chat_rooms = this.data.chat_rooms || {};
        this.data.room_members = this.data.room_members || {};
        this.data.messages = this.data.messages || {};
        this.data.attachments = this.data.attachments || {};
      } catch (err) {
        console.error('Failed to parse database file, resetting:', err);
      }
    } else {
      this.persistSync();
    }
  }

  getStatus() {
    return {
      type: 'file' as const,
      connected: true,
      details: 'Using local persistent JSON database (./data/database.json)',
    };
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

  private save() {
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

  async createUser(displayName: string, avatarUrl?: string): Promise<User> {
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

  async getUserByToken(token: string): Promise<User | undefined> {
    return Object.values(this.data.users).find((u) => u.session_token === token);
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.data.users[id];
  }

  async updateUserLastSeen(userId: string): Promise<void> {
    if (this.data.users[userId]) {
      this.data.users[userId].last_seen = Date.now();
      this.data.users[userId].updated_at = Date.now();
      this.save();
    }
  }

  async updateUserProfile(userId: string, displayName: string, avatarUrl?: string): Promise<User | undefined> {
    const user = this.data.users[userId];
    if (!user) return undefined;
    user.display_name = displayName.trim() || user.display_name;
    if (avatarUrl !== undefined) user.avatar_url = avatarUrl;
    user.updated_at = Date.now();
    this.save();
    return user;
  }

  async createRoom(creatorUserId: string): Promise<{ room: ChatRoom; member: RoomMember }> {
    const roomId = `room_${crypto.randomUUID()}`;
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

  async getRoomById(roomId: string): Promise<ChatRoom | undefined> {
    return this.data.chat_rooms[roomId];
  }

  async getRoomByToken(roomToken: string): Promise<ChatRoom | undefined> {
    return Object.values(this.data.chat_rooms).find((r) => r.room_token === roomToken);
  }

  async getRoomMembers(roomId: string): Promise<RoomMember[]> {
    return Object.values(this.data.room_members).filter((m) => m.room_id === roomId);
  }

  async getMember(roomId: string, userId: string): Promise<RoomMember | undefined> {
    return Object.values(this.data.room_members).find(
      (m) => m.room_id === roomId && m.user_id === userId
    );
  }

  async getUserRooms(userId: string): Promise<{ room: ChatRoom; peer?: User; unreadCount: number }[]> {
    const userMembers = Object.values(this.data.room_members).filter((m) => m.user_id === userId);
    const results: { room: ChatRoom; peer?: User; unreadCount: number }[] = [];

    for (const mem of userMembers) {
      const room = this.data.chat_rooms[mem.room_id];
      if (!room || room.status !== 'active') continue;

      const members = await this.getRoomMembers(room.id);
      const peerMember = members.find((m) => m.user_id !== userId);
      const peer = peerMember ? await this.getUserById(peerMember.user_id) : undefined;

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

  async joinRoom(roomId: string, userId: string): Promise<{ success: boolean; member?: RoomMember; error?: string }> {
    const room = this.data.chat_rooms[roomId];
    if (!room || room.status !== 'active') {
      return { success: false, error: 'Chat room not found or closed.' };
    }

    const currentMembers = await this.getRoomMembers(roomId);
    const existingMember = currentMembers.find((m) => m.user_id === userId);
    if (existingMember) {
      return { success: true, member: existingMember };
    }

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

  async createMessage(params: {
    id?: string;
    roomId: string;
    senderId: string;
    messageType: 'text' | 'image' | 'file';
    textContent?: string;
    attachment?: MessageAttachment;
    replyTo?: ReplyToPreview | null;
  }): Promise<Message> {
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
      reply_to: params.replyTo || null,
    };

    this.data.messages[id] = message;

    if (params.attachment) {
      this.data.attachments[params.attachment.id] = params.attachment;
    }

    if (this.data.chat_rooms[params.roomId]) {
      this.data.chat_rooms[params.roomId].updated_at = now;
    }

    this.save();
    return message;
  }

  async getMessages(roomId: string, limit = 50, beforeTimestamp?: number): Promise<{ messages: Message[]; hasMore: boolean }> {
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

  async getMessageById(messageId: string): Promise<Message | undefined> {
    return this.data.messages[messageId];
  }

  async deleteMessage(messageId: string, roomId: string): Promise<{ success: boolean; attachment?: MessageAttachment }> {
    const msg = this.data.messages[messageId];
    if (!msg || msg.room_id !== roomId) {
      return { success: false };
    }
    const attachment = msg.attachment;
    if (attachment) {
      delete this.data.attachments[attachment.id];
    }
    delete this.data.messages[messageId];
    this.save();
    return { success: true, attachment };
  }

  async markDelivered(roomId: string, recipientUserId: string): Promise<string[]> {
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

  async markRead(roomId: string, readerUserId: string): Promise<string[]> {
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

    const member = await this.getMember(roomId, readerUserId);
    if (member && updatedIds.length > 0) {
      member.last_read_message_id = updatedIds[updatedIds.length - 1];
    }

    if (updatedIds.length > 0) {
      this.save();
    }
    return updatedIds;
  }

  async searchMessages(roomId: string, query: string): Promise<Message[]> {
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

  async getSharedMedia(roomId: string): Promise<{ images: Message[]; files: Message[] }> {
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

  async getAttachmentByStorageKey(storageKey: string): Promise<MessageAttachment | undefined> {
    return Object.values(this.data.attachments).find((a) => a.storage_key === storageKey);
  }

  async saveAttachmentBlob(_storageKey: string, _buffer: Buffer): Promise<void> {
    // In local mode, multer already saved to disk in UPLOADS_DIR
  }

  async getAttachmentBlob(storageKey: string): Promise<Buffer | null> {
    const filePath = path.join(UPLOADS_DIR, storageKey);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
    return null;
  }

  async getAllRoomsForAdmin(): Promise<AdminRoomOverview[]> {
    const overviews: AdminRoomOverview[] = [];
    for (const room of Object.values(this.data.chat_rooms)) {
      const members = Object.values(this.data.room_members)
        .filter((m) => m.room_id === room.id)
        .map((m) => {
          const u = this.data.users[m.user_id];
          return {
            id: m.id,
            userId: m.user_id,
            displayName: u?.display_name || 'Anonymous',
            joinedAt: m.joined_at,
            role: m.role,
          };
        });

      const msgs = Object.values(this.data.messages)
        .filter((msg) => msg.room_id === room.id)
        .sort((a, b) => b.created_at - a.created_at);

      const last = msgs[0];

      overviews.push({
        room: {
          id: room.id,
          token: room.room_token,
          createdAt: room.created_at,
          updatedAt: room.updated_at,
          status: room.status,
        },
        members,
        messageCount: msgs.length,
        lastMessage: last
          ? {
              text: last.text_content,
              type: last.message_type,
              createdAt: last.created_at,
              senderId: last.sender_id,
            }
          : undefined,
      });
    }

    return overviews.sort((a, b) => b.room.updatedAt - a.room.updatedAt);
  }

  async deleteRoomForAdmin(roomId: string): Promise<boolean> {
    delete this.data.chat_rooms[roomId];
    for (const [id, mem] of Object.entries(this.data.room_members)) {
      if (mem.room_id === roomId) delete this.data.room_members[id];
    }
    for (const [id, msg] of Object.entries(this.data.messages)) {
      if (msg.room_id === roomId) delete this.data.messages[id];
    }
    for (const [id, att] of Object.entries(this.data.attachments)) {
      if (att.room_id === roomId) delete this.data.attachments[id];
    }
    this.save();
    return true;
  }
}

// ==========================================
// 2. MongoDB Store Implementation
// ==========================================
class MongoDbStore implements IDatabaseStore {
  private uri: string;
  private client: MongoClient;
  private db!: Db;
  private isConnected = false;
  private connectionDetails = '';

  constructor(uri: string) {
    this.uri = uri;
    this.client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 30000,
      maxPoolSize: 20,
      minPoolSize: 2,
    });
  }

  async init(): Promise<void> {
    await this.client.connect();

    // Determine target database name (default to 'duo_chat' if 'test' or empty)
    let dbName = 'duo_chat';
    try {
      const parsed = new URL(this.uri.replace('mongodb+srv://', 'http://').replace('mongodb://', 'http://'));
      const pathDb = parsed.pathname.replace(/^\//, '').split('?')[0];
      if (pathDb && pathDb !== 'test') {
        dbName = pathDb;
      }
      this.connectionDetails = `Connected to MongoDB Atlas (${parsed.host}/${dbName})`;
    } catch {
      this.connectionDetails = 'Connected to MongoDB (duo_chat)';
    }

    this.db = this.client.db(dbName);
    this.isConnected = true;

    // Set up collections and indexes
    const usersCol = this.db.collection('users');
    const roomsCol = this.db.collection('chat_rooms');
    const membersCol = this.db.collection('room_members');
    const msgsCol = this.db.collection('messages');
    const attCol = this.db.collection('attachments');

    await Promise.all([
      usersCol.createIndex({ id: 1 }, { unique: true }),
      usersCol.createIndex({ session_token: 1 }, { unique: true }),
      roomsCol.createIndex({ id: 1 }, { unique: true }),
      roomsCol.createIndex({ room_token: 1 }, { unique: true }),
      membersCol.createIndex({ room_id: 1, user_id: 1 }, { unique: true }),
      membersCol.createIndex({ room_id: 1 }),
      membersCol.createIndex({ user_id: 1 }),
      msgsCol.createIndex({ id: 1 }, { unique: true }),
      msgsCol.createIndex({ room_id: 1, created_at: -1 }),
      attCol.createIndex({ storage_key: 1 }, { unique: true }),
      attCol.createIndex({ room_id: 1 }),
    ]).catch((err) => {
      console.warn('Index notice in MongoDB (safe to proceed):', err.message);
    });
  }

  getStatus() {
    return {
      type: 'mongodb' as const,
      connected: this.isConnected,
      details: this.connectionDetails,
    };
  }

  async createUser(displayName: string, avatarUrl?: string): Promise<User> {
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
    await this.db.collection<User>('users').insertOne({ ...user });
    return user;
  }

  async getUserByToken(token: string): Promise<User | undefined> {
    const doc = await this.db.collection<User>('users').findOne({ session_token: token });
    return doc || undefined;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const doc = await this.db.collection<User>('users').findOne({ id });
    return doc || undefined;
  }

  async updateUserLastSeen(userId: string): Promise<void> {
    const now = Date.now();
    await this.db.collection<User>('users').updateOne(
      { id: userId },
      { $set: { last_seen: now, updated_at: now } }
    );
  }

  async updateUserProfile(userId: string, displayName: string, avatarUrl?: string): Promise<User | undefined> {
    const update: any = {
      display_name: displayName.trim(),
      updated_at: Date.now(),
    };
    if (avatarUrl !== undefined) {
      update.avatar_url = avatarUrl;
    }
    const res = await this.db.collection<User>('users').findOneAndUpdate(
      { id: userId },
      { $set: update },
      { returnDocument: 'after' }
    );
    return res || undefined;
  }

  async createRoom(creatorUserId: string): Promise<{ room: ChatRoom; member: RoomMember }> {
    const roomId = `room_${crypto.randomUUID()}`;
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

    await this.db.collection<ChatRoom>('chat_rooms').insertOne({ ...room });
    await this.db.collection<RoomMember>('room_members').insertOne({ ...member });

    return { room, member };
  }

  async getRoomById(roomId: string): Promise<ChatRoom | undefined> {
    const doc = await this.db.collection<ChatRoom>('chat_rooms').findOne({ id: roomId });
    return doc || undefined;
  }

  async getRoomByToken(roomToken: string): Promise<ChatRoom | undefined> {
    const doc = await this.db.collection<ChatRoom>('chat_rooms').findOne({ room_token: roomToken });
    return doc || undefined;
  }

  async getRoomMembers(roomId: string): Promise<RoomMember[]> {
    return this.db.collection<RoomMember>('room_members').find({ room_id: roomId }).toArray();
  }

  async getMember(roomId: string, userId: string): Promise<RoomMember | undefined> {
    const doc = await this.db.collection<RoomMember>('room_members').findOne({ room_id: roomId, user_id: userId });
    return doc || undefined;
  }

  async getUserRooms(userId: string): Promise<{ room: ChatRoom; peer?: User; unreadCount: number }[]> {
    const userMembers = await this.db.collection<RoomMember>('room_members').find({ user_id: userId }).toArray();
    const results: { room: ChatRoom; peer?: User; unreadCount: number }[] = [];

    for (const mem of userMembers) {
      const room = await this.getRoomById(mem.room_id);
      if (!room || room.status !== 'active') continue;

      const members = await this.getRoomMembers(room.id);
      const peerMember = members.find((m) => m.user_id !== userId);
      const peer = peerMember ? await this.getUserById(peerMember.user_id) : undefined;

      const unreadCount = await this.db.collection<Message>('messages').countDocuments({
        room_id: room.id,
        sender_id: { $ne: userId },
        read_at: null,
      });

      results.push({ room, peer, unreadCount });
    }

    results.sort((a, b) => b.room.updated_at - a.room.updated_at);
    return results;
  }

  async joinRoom(roomId: string, userId: string): Promise<{ success: boolean; member?: RoomMember; error?: string }> {
    const room = await this.getRoomById(roomId);
    if (!room || room.status !== 'active') {
      return { success: false, error: 'Chat room not found or closed.' };
    }

    const currentMembers = await this.getRoomMembers(roomId);
    const existing = currentMembers.find((m) => m.user_id === userId);
    if (existing) {
      return { success: true, member: existing };
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

    try {
      await this.db.collection<RoomMember>('room_members').insertOne({ ...newMember });
      await this.db.collection<ChatRoom>('chat_rooms').updateOne(
        { id: roomId },
        { $set: { updated_at: Date.now() } }
      );
      return { success: true, member: newMember };
    } catch (err: any) {
      if (err.code === 11000) {
        const mem = await this.getMember(roomId, userId);
        return { success: true, member: mem };
      }
      return { success: false, error: 'Chat room is full.' };
    }
  }

  async createMessage(params: {
    id?: string;
    roomId: string;
    senderId: string;
    messageType: 'text' | 'image' | 'file';
    textContent?: string;
    attachment?: MessageAttachment;
    replyTo?: ReplyToPreview | null;
  }): Promise<Message> {
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
      reply_to: params.replyTo || null,
    };

    await this.db.collection<Message>('messages').insertOne({ ...message });

    if (params.attachment) {
      await this.db.collection<MessageAttachment>('attachments').insertOne({ ...params.attachment });
    }

    await this.db.collection<ChatRoom>('chat_rooms').updateOne(
      { id: params.roomId },
      { $set: { updated_at: now } }
    );

    return message;
  }

  async getMessages(roomId: string, limit = 50, beforeTimestamp?: number): Promise<{ messages: Message[]; hasMore: boolean }> {
    const query: any = { room_id: roomId };
    if (beforeTimestamp) {
      query.created_at = { $lt: beforeTimestamp };
    }

    const found = await this.db.collection<Message>('messages')
      .find(query)
      .sort({ created_at: -1 })
      .limit(limit + 1)
      .toArray();

    const hasMore = found.length > limit;
    const paginated = (hasMore ? found.slice(0, limit) : found).reverse();

    return { messages: paginated, hasMore };
  }

  async getMessageById(messageId: string): Promise<Message | undefined> {
    const doc = await this.db.collection<Message>('messages').findOne({ id: messageId });
    return doc || undefined;
  }

  async deleteMessage(messageId: string, roomId: string): Promise<{ success: boolean; attachment?: MessageAttachment }> {
    const msg = await this.db.collection<Message>('messages').findOne({ id: messageId, room_id: roomId });
    if (!msg) {
      return { success: false };
    }
    const attachment = msg.attachment;
    await this.db.collection<Message>('messages').deleteOne({ id: messageId, room_id: roomId });
    if (attachment) {
      await this.db.collection('attachments').deleteOne({ id: attachment.id });
      await this.db.collection('attachment_blobs').deleteOne({ storage_key: attachment.storage_key });
    }
    return { success: true, attachment };
  }

  async markDelivered(roomId: string, recipientUserId: string): Promise<string[]> {
    const now = Date.now();
    const query = {
      room_id: roomId,
      sender_id: { $ne: recipientUserId },
      delivered_at: null,
    };

    const undelivered = await this.db.collection<Message>('messages').find(query).toArray();
    if (undelivered.length === 0) return [];

    const ids = undelivered.map((m) => m.id);
    await this.db.collection<Message>('messages').updateMany(
      { id: { $in: ids } },
      { $set: { delivered_at: now, updated_at: now } }
    );

    return ids;
  }

  async markRead(roomId: string, readerUserId: string): Promise<string[]> {
    const now = Date.now();
    const query = {
      room_id: roomId,
      sender_id: { $ne: readerUserId },
      read_at: null,
    };

    const unread = await this.db.collection<Message>('messages').find(query).toArray();
    if (unread.length === 0) return [];

    const ids = unread.map((m) => m.id);
    await this.db.collection<Message>('messages').updateMany(
      { id: { $in: ids } },
      { $set: { delivered_at: now, read_at: now, updated_at: now } }
    );

    await this.db.collection<RoomMember>('room_members').updateOne(
      { room_id: roomId, user_id: readerUserId },
      { $set: { last_read_message_id: ids[ids.length - 1] } }
    );

    return ids;
  }

  async searchMessages(roomId: string, query: string): Promise<Message[]> {
    const lower = query.trim();
    if (!lower) return [];
    const regex = new RegExp(lower, 'i');

    return this.db.collection<Message>('messages')
      .find({
        room_id: roomId,
        $or: [{ text_content: regex }, { 'attachment.file_name': regex }],
      })
      .sort({ created_at: -1 })
      .toArray();
  }

  async getSharedMedia(roomId: string): Promise<{ images: Message[]; files: Message[] }> {
    const msgs = await this.db.collection<Message>('messages')
      .find({ room_id: roomId, attachment: { $exists: true } } as any)
      .sort({ created_at: -1 })
      .toArray();

    const images: Message[] = [];
    const files: Message[] = [];

    for (const msg of msgs) {
      if (msg.message_type === 'image' && msg.attachment) {
        images.push(msg);
      } else if (msg.message_type === 'file' && msg.attachment) {
        files.push(msg);
      }
    }

    return { images, files };
  }

  async getAttachmentByStorageKey(storageKey: string): Promise<MessageAttachment | undefined> {
    const doc = await this.db.collection<MessageAttachment>('attachments').findOne({ storage_key: storageKey });
    return doc || undefined;
  }

  async saveAttachmentBlob(storageKey: string, buffer: Buffer): Promise<void> {
    await this.db.collection('attachment_blobs').updateOne(
      { storage_key: storageKey },
      { $set: { storage_key: storageKey, data: buffer, created_at: Date.now() } },
      { upsert: true }
    );
  }

  async getAttachmentBlob(storageKey: string): Promise<Buffer | null> {
    // 1. Try local disk first
    const filePath = path.join(UPLOADS_DIR, storageKey);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }

    // 2. Fall back to MongoDB blob (persists across Render restarts!)
    const doc = await this.db.collection<{ storage_key: string; data: any }>('attachment_blobs').findOne({ storage_key: storageKey });
    if (doc && doc.data) {
      const buf = Buffer.isBuffer(doc.data) ? doc.data : doc.data.buffer ? Buffer.from(doc.data.buffer) : Buffer.from(doc.data);
      // Cache back to local disk
      try {
        fs.writeFileSync(filePath, buf);
      } catch {}
      return buf;
    }

    return null;
  }

  async getAllRoomsForAdmin(): Promise<AdminRoomOverview[]> {
    const rooms = await this.db.collection<ChatRoom>('chat_rooms').find({}).sort({ updated_at: -1 }).toArray();
    const overviews: AdminRoomOverview[] = [];

    for (const room of rooms) {
      const rawMembers = await this.db.collection<RoomMember>('room_members').find({ room_id: room.id }).toArray();
      const members = await Promise.all(
        rawMembers.map(async (m) => {
          const u = await this.getUserById(m.user_id);
          return {
            id: m.id,
            userId: m.user_id,
            displayName: u?.display_name || 'Anonymous',
            joinedAt: m.joined_at,
            role: m.role,
          };
        })
      );

      const messageCount = await this.db.collection('messages').countDocuments({ room_id: room.id });
      const last = await this.db.collection<Message>('messages')
        .find({ room_id: room.id })
        .sort({ created_at: -1 })
        .limit(1)
        .toArray();

      const lastMsg = last[0];

      overviews.push({
        room: {
          id: room.id,
          token: room.room_token,
          createdAt: room.created_at,
          updatedAt: room.updated_at,
          status: room.status,
        },
        members,
        messageCount,
        lastMessage: lastMsg
          ? {
              text: lastMsg.text_content,
              type: lastMsg.message_type,
              createdAt: lastMsg.created_at,
              senderId: lastMsg.sender_id,
            }
          : undefined,
      });
    }

    return overviews;
  }

  async deleteRoomForAdmin(roomId: string): Promise<boolean> {
    await this.db.collection('chat_rooms').deleteOne({ id: roomId });
    await this.db.collection('room_members').deleteMany({ room_id: roomId });
    await this.db.collection('messages').deleteMany({ room_id: roomId });
    await this.db.collection('attachments').deleteMany({ room_id: roomId });
    return true;
  }
}

// ==========================================
// 3. Database Factory with Auto Fallback & Auto Reconnect
// ==========================================
class DatabaseManager implements IDatabaseStore {
  private activeStore: IDatabaseStore;
  private isReady = false;
  private initPromise: Promise<void>;
  private lastMongoNotice: string | null = null;
  private reconnecting = false;

  constructor() {
    this.activeStore = new JsonFileDbStore();
    this.initPromise = this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    // Initialize file storage first so app is immediately responsive
    const fileStore = new JsonFileDbStore();
    await fileStore.init();
    this.activeStore = fileStore;
    this.isReady = true;

    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri && mongoUri.trim()) {
      await this.tryConnectMongo(mongoUri.trim(), true);
    } else {
      console.log('[Database] No MONGODB_URI detected. Using persistent file database (./data/database.json).');
      console.log('[Database] Note: To connect MongoDB on Render or production, set the MONGODB_URI environment variable.');
    }
  }

  private async tryConnectMongo(mongoUri: string, isInitial: boolean): Promise<boolean> {
    try {
      console.log('[Database] Attempting connection to MongoDB Atlas...');
      const mongoStore = new MongoDbStore(mongoUri);
      await mongoStore.init();
      this.activeStore = mongoStore;
      this.lastMongoNotice = null;
      console.log(`[Database] MongoDB connected successfully: ${mongoStore.getStatus().details}`);
      return true;
    } catch (err: any) {
      const errMsg = err.message || '';

      if (errMsg.includes('alert number 80') || errMsg.includes('tlsv1 alert internal error')) {
        this.lastMongoNotice = 'MongoDB Atlas SSL alert 80: IP whitelist rule propagating or 0.0.0.0/0 required in Atlas Network Access.';
        console.warn('[Database] MongoDB Atlas TLS notice: SSL alert 80.');
        console.warn('[Database] This occurs when your client IP is not yet active in MongoDB Atlas Network Access.');
        console.warn('[Database] If you just added 0.0.0.0/0, Atlas takes 1-2 minutes to deploy. The app will auto-reconnect.');
      } else {
        this.lastMongoNotice = `MongoDB connection waiting: ${errMsg}`;
        console.warn(`[Database] MongoDB connection attempt waiting (${errMsg}).`);
      }

      console.log('[Database] Running on persistent local storage while establishing MongoDB connection.');

      if (isInitial && !this.reconnecting) {
        this.startReconnectLoop(mongoUri);
      }
      return false;
    }
  }

  private startReconnectLoop(mongoUri: string) {
    this.reconnecting = true;
    let delay = 3000;

    const poll = async () => {
      const connected = await this.tryConnectMongo(mongoUri, false);
      if (connected) {
        this.reconnecting = false;
        return;
      }
      delay = Math.min(delay * 1.5, 20000);
      setTimeout(poll, delay);
    };

    setTimeout(poll, delay);
  }

  async init(): Promise<void> {
    await this.initPromise;
  }

  private async ensureReady(): Promise<IDatabaseStore> {
    if (!this.isReady) {
      await this.initPromise;
    }
    return this.activeStore;
  }

  getStatus() {
    const current = this.activeStore.getStatus();
    if (this.lastMongoNotice && current.type === 'file') {
      return {
        ...current,
        mongoStatus: 'reconnecting',
        mongoNotice: this.lastMongoNotice,
      };
    }
    return current;
  }

  async createUser(displayName: string, avatarUrl?: string): Promise<User> {
    const store = await this.ensureReady();
    return store.createUser(displayName, avatarUrl);
  }

  async getUserByToken(token: string): Promise<User | undefined> {
    const store = await this.ensureReady();
    return store.getUserByToken(token);
  }

  async getUserById(id: string): Promise<User | undefined> {
    const store = await this.ensureReady();
    return store.getUserById(id);
  }

  async updateUserLastSeen(userId: string): Promise<void> {
    const store = await this.ensureReady();
    return store.updateUserLastSeen(userId);
  }

  async updateUserProfile(userId: string, displayName: string, avatarUrl?: string): Promise<User | undefined> {
    const store = await this.ensureReady();
    return store.updateUserProfile(userId, displayName, avatarUrl);
  }

  async createRoom(creatorUserId: string): Promise<{ room: ChatRoom; member: RoomMember }> {
    const store = await this.ensureReady();
    return store.createRoom(creatorUserId);
  }

  async getRoomById(roomId: string): Promise<ChatRoom | undefined> {
    const store = await this.ensureReady();
    return store.getRoomById(roomId);
  }

  async getRoomByToken(roomToken: string): Promise<ChatRoom | undefined> {
    const store = await this.ensureReady();
    return store.getRoomByToken(roomToken);
  }

  async getRoomMembers(roomId: string): Promise<RoomMember[]> {
    const store = await this.ensureReady();
    return store.getRoomMembers(roomId);
  }

  async getMember(roomId: string, userId: string): Promise<RoomMember | undefined> {
    const store = await this.ensureReady();
    return store.getMember(roomId, userId);
  }

  async getUserRooms(userId: string): Promise<{ room: ChatRoom; peer?: User; unreadCount: number }[]> {
    const store = await this.ensureReady();
    return store.getUserRooms(userId);
  }

  async joinRoom(roomId: string, userId: string): Promise<{ success: boolean; member?: RoomMember; error?: string }> {
    const store = await this.ensureReady();
    return store.joinRoom(roomId, userId);
  }

  async createMessage(params: {
    id?: string;
    roomId: string;
    senderId: string;
    messageType: 'text' | 'image' | 'file';
    textContent?: string;
    attachment?: MessageAttachment;
    replyTo?: ReplyToPreview | null;
  }): Promise<Message> {
    const store = await this.ensureReady();
    return store.createMessage(params);
  }

  async getMessages(roomId: string, limit?: number, beforeTimestamp?: number): Promise<{ messages: Message[]; hasMore: boolean }> {
    const store = await this.ensureReady();
    return store.getMessages(roomId, limit, beforeTimestamp);
  }

  async getMessageById(messageId: string): Promise<Message | undefined> {
    const store = await this.ensureReady();
    return store.getMessageById(messageId);
  }

  async deleteMessage(messageId: string, roomId: string): Promise<{ success: boolean; attachment?: MessageAttachment }> {
    const store = await this.ensureReady();
    return store.deleteMessage(messageId, roomId);
  }

  async markDelivered(roomId: string, recipientUserId: string): Promise<string[]> {
    const store = await this.ensureReady();
    return store.markDelivered(roomId, recipientUserId);
  }

  async markRead(roomId: string, readerUserId: string): Promise<string[]> {
    const store = await this.ensureReady();
    return store.markRead(roomId, readerUserId);
  }

  async searchMessages(roomId: string, query: string): Promise<Message[]> {
    const store = await this.ensureReady();
    return store.searchMessages(roomId, query);
  }

  async getSharedMedia(roomId: string): Promise<{ images: Message[]; files: Message[] }> {
    const store = await this.ensureReady();
    return store.getSharedMedia(roomId);
  }

  async getAttachmentByStorageKey(storageKey: string): Promise<MessageAttachment | undefined> {
    const store = await this.ensureReady();
    return store.getAttachmentByStorageKey(storageKey);
  }

  async saveAttachmentBlob(storageKey: string, buffer: Buffer): Promise<void> {
    const store = await this.ensureReady();
    return store.saveAttachmentBlob(storageKey, buffer);
  }

  async getAttachmentBlob(storageKey: string): Promise<Buffer | null> {
    const store = await this.ensureReady();
    return store.getAttachmentBlob(storageKey);
  }

  async getAllRoomsForAdmin(): Promise<AdminRoomOverview[]> {
    const store = await this.ensureReady();
    return store.getAllRoomsForAdmin();
  }

  async deleteRoomForAdmin(roomId: string): Promise<boolean> {
    const store = await this.ensureReady();
    return store.deleteRoomForAdmin(roomId);
  }
}

export const db = new DatabaseManager();
export { UPLOADS_DIR };
