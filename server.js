// server.ts
import express from "express";
import multer2 from "multer";
import http from "node:http";
import path3 from "node:path";
import fs3 from "node:fs";

// src/server/db.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
var DATA_DIR = path.resolve(process.cwd(), "data");
var DB_FILE = path.join(DATA_DIR, "database.json");
var UPLOADS_DIR = path.join(DATA_DIR, "uploads");
var DatabaseStore = class {
  constructor() {
    this.data = {
      users: {},
      chat_rooms: {},
      room_members: {},
      messages: {},
      attachments: {}
    };
    this.isSaving = false;
    this.needsSave = false;
    this.init();
  }
  init() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        this.data = JSON.parse(raw);
        this.data.users = this.data.users || {};
        this.data.chat_rooms = this.data.chat_rooms || {};
        this.data.room_members = this.data.room_members || {};
        this.data.messages = this.data.messages || {};
        this.data.attachments = this.data.attachments || {};
      } catch (err) {
        console.error("Failed to read database file, initializing empty schema:", err);
      }
    } else {
      this.persistSync();
    }
  }
  persistSync() {
    try {
      const tempPath = `${DB_FILE}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), "utf-8");
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error("Failed to persist database:", err);
    }
  }
  save() {
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
  createUser(displayName, avatarUrl) {
    const id = `usr_${crypto.randomUUID()}`;
    const sessionToken = `tok_${crypto.randomBytes(32).toString("hex")}`;
    const now = Date.now();
    const user = {
      id,
      display_name: displayName.trim(),
      avatar_url: avatarUrl,
      session_token: sessionToken,
      created_at: now,
      updated_at: now,
      last_seen: now
    };
    this.data.users[id] = user;
    this.save();
    return user;
  }
  getUserByToken(token) {
    return Object.values(this.data.users).find((u) => u.session_token === token);
  }
  getUserById(id) {
    return this.data.users[id];
  }
  updateUserLastSeen(userId) {
    if (this.data.users[userId]) {
      this.data.users[userId].last_seen = Date.now();
      this.data.users[userId].updated_at = Date.now();
      this.save();
    }
  }
  updateUserProfile(userId, displayName, avatarUrl) {
    const user = this.data.users[userId];
    if (!user) return void 0;
    user.display_name = displayName.trim() || user.display_name;
    if (avatarUrl !== void 0) user.avatar_url = avatarUrl;
    user.updated_at = Date.now();
    this.save();
    return user;
  }
  // --- Chat Rooms ---
  createRoom(creatorUserId) {
    const roomId = `room_${crypto.randomUUID()}`;
    const roomToken = crypto.randomBytes(16).toString("hex");
    const now = Date.now();
    const room = {
      id: roomId,
      room_token: roomToken,
      created_by: creatorUserId,
      created_at: now,
      updated_at: now,
      status: "active"
    };
    const memberId = `mem_${crypto.randomUUID()}`;
    const member = {
      id: memberId,
      room_id: roomId,
      user_id: creatorUserId,
      joined_at: now,
      role: "creator"
    };
    this.data.chat_rooms[roomId] = room;
    this.data.room_members[memberId] = member;
    this.save();
    return { room, member };
  }
  getRoomById(roomId) {
    return this.data.chat_rooms[roomId];
  }
  getRoomByToken(roomToken) {
    return Object.values(this.data.chat_rooms).find((r) => r.room_token === roomToken);
  }
  getRoomMembers(roomId) {
    return Object.values(this.data.room_members).filter((m) => m.room_id === roomId);
  }
  getMember(roomId, userId) {
    return Object.values(this.data.room_members).find(
      (m) => m.room_id === roomId && m.user_id === userId
    );
  }
  getUserRooms(userId) {
    const userMembers = Object.values(this.data.room_members).filter((m) => m.user_id === userId);
    const results = [];
    for (const mem of userMembers) {
      const room = this.data.chat_rooms[mem.room_id];
      if (!room || room.status !== "active") continue;
      const members = this.getRoomMembers(room.id);
      const peerMember = members.find((m) => m.user_id !== userId);
      const peer = peerMember ? this.getUserById(peerMember.user_id) : void 0;
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
  joinRoom(roomId, userId) {
    const room = this.data.chat_rooms[roomId];
    if (!room || room.status !== "active") {
      return { success: false, error: "Chat room not found or closed." };
    }
    const currentMembers = this.getRoomMembers(roomId);
    const existingMember = currentMembers.find((m) => m.user_id === userId);
    if (existingMember) {
      return { success: true, member: existingMember };
    }
    if (currentMembers.length >= 2) {
      return { success: false, error: "Chat room is full." };
    }
    const memberId = `mem_${crypto.randomUUID()}`;
    const newMember = {
      id: memberId,
      room_id: roomId,
      user_id: userId,
      joined_at: Date.now(),
      role: "guest"
    };
    this.data.room_members[memberId] = newMember;
    room.updated_at = Date.now();
    this.save();
    return { success: true, member: newMember };
  }
  // --- Messages ---
  createMessage(params) {
    const id = params.id || `msg_${crypto.randomUUID()}`;
    const now = Date.now();
    const message = {
      id,
      room_id: params.roomId,
      sender_id: params.senderId,
      message_type: params.messageType,
      text_content: params.textContent,
      created_at: now,
      updated_at: now,
      delivered_at: null,
      read_at: null,
      attachment: params.attachment
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
  getMessages(roomId, limit = 50, beforeTimestamp) {
    const all = Object.values(this.data.messages).filter((m) => m.room_id === roomId).sort((a, b) => a.created_at - b.created_at);
    let filtered = all;
    if (beforeTimestamp) {
      filtered = all.filter((m) => m.created_at < beforeTimestamp);
    }
    const startIndex = Math.max(0, filtered.length - limit);
    const paginated = filtered.slice(startIndex);
    const hasMore = startIndex > 0;
    return { messages: paginated, hasMore };
  }
  getMessageById(messageId) {
    return this.data.messages[messageId];
  }
  markDelivered(roomId, recipientUserId) {
    const updatedIds = [];
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
  markRead(roomId, readerUserId) {
    const updatedIds = [];
    const now = Date.now();
    for (const msg of Object.values(this.data.messages)) {
      if (msg.room_id === roomId && msg.sender_id !== readerUserId && !msg.read_at) {
        if (!msg.delivered_at) msg.delivered_at = now;
        msg.read_at = now;
        msg.updated_at = now;
        updatedIds.push(msg.id);
      }
    }
    const member = this.getMember(roomId, readerUserId);
    if (member && updatedIds.length > 0) {
      member.last_read_message_id = updatedIds[updatedIds.length - 1];
    }
    if (updatedIds.length > 0) {
      this.save();
    }
    return updatedIds;
  }
  searchMessages(roomId, query) {
    const lower = query.toLowerCase().trim();
    if (!lower) return [];
    return Object.values(this.data.messages).filter(
      (m) => m.room_id === roomId && (m.text_content && m.text_content.toLowerCase().includes(lower) || m.attachment && m.attachment.file_name.toLowerCase().includes(lower))
    ).sort((a, b) => b.created_at - a.created_at);
  }
  getSharedMedia(roomId) {
    const roomMessages = Object.values(this.data.messages).filter((m) => m.room_id === roomId).sort((a, b) => b.created_at - a.created_at);
    const images = [];
    const files = [];
    for (const msg of roomMessages) {
      if (msg.message_type === "image" && msg.attachment) {
        images.push(msg);
      } else if (msg.message_type === "file" && msg.attachment) {
        files.push(msg);
      }
    }
    return { images, files };
  }
  getAttachmentByStorageKey(storageKey) {
    return Object.values(this.data.attachments).find((a) => a.storage_key === storageKey);
  }
};
var db = new DatabaseStore();

// src/server/storage.ts
import multer from "multer";
import path2 from "node:path";
import crypto2 from "node:crypto";
import fs2 from "node:fs";
if (!fs2.existsSync(UPLOADS_DIR)) {
  fs2.mkdirSync(UPLOADS_DIR, { recursive: true });
}
var MAX_FILE_SIZE = 25 * 1024 * 1024;
var storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, _file, cb) => {
    const storageKey = crypto2.randomBytes(24).toString("hex");
    cb(null, storageKey);
  }
});
var ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "audio/",
  "video/"
];
var DISALLOWED_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".bin",
  ".msi",
  ".com",
  ".vbs",
  ".js",
  ".mjs",
  ".php",
  ".phtml",
  ".cgi",
  ".py",
  ".rb",
  ".pl"
];
var uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (_req, file, cb) => {
    const ext = path2.extname(file.originalname).toLowerCase();
    if (DISALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error("Executable and script file uploads are forbidden for security."));
    }
    const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix));
    if (!isAllowed) {
      if (file.mimetype === "application/octet-stream") {
        return cb(null, true);
      }
      return cb(new Error(`File type ${file.mimetype} is not supported.`));
    }
    cb(null, true);
  }
});
function sanitizeFilename(originalName) {
  return path2.basename(originalName).replace(/[^a-zA-Z0-9._\- ()+]/g, "_");
}

// src/server/socket.ts
import { WebSocket, WebSocketServer } from "ws";
var ChatSocketServer = class {
  constructor(server2) {
    this.clients = /* @__PURE__ */ new Map();
    // Map of userId -> Set of WebSockets
    this.userSockets = /* @__PURE__ */ new Map();
    // Map of roomId -> Set of userIds
    this.roomUsers = /* @__PURE__ */ new Map();
    // Map of `${roomId}:${userId}` -> NodeJS.Timeout
    this.typingTimers = /* @__PURE__ */ new Map();
    this.wss = new WebSocketServer({ server: server2, path: "/ws" });
    this.wss.on("connection", (ws) => {
      this.handleConnection(ws);
    });
    const interval = setInterval(() => {
      for (const [ws, conn] of this.clients.entries()) {
        if (!conn.isAlive) {
          ws.terminate();
          this.handleDisconnect(ws);
          continue;
        }
        conn.isAlive = false;
        ws.ping();
      }
    }, 3e4);
    this.wss.on("close", () => {
      clearInterval(interval);
    });
  }
  handleConnection(ws) {
    ws.on("pong", () => {
      const conn = this.clients.get(ws);
      if (conn) conn.isAlive = true;
    });
    ws.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        this.handleMessage(ws, payload);
      } catch (err) {
        console.error("Invalid WS payload received:", err);
      }
    });
    ws.on("close", () => {
      this.handleDisconnect(ws);
    });
    ws.on("error", (err) => {
      console.error("WS client error:", err);
      this.handleDisconnect(ws);
    });
  }
  handleMessage(ws, payload) {
    const { type } = payload;
    switch (type) {
      case "auth": {
        const { token, roomId } = payload;
        if (!token) {
          ws.send(JSON.stringify({ type: "error", message: "Token required" }));
          return;
        }
        const user = db.getUserByToken(token);
        if (!user) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid authentication session" }));
          return;
        }
        const conn = {
          ws,
          user,
          roomId,
          isAlive: true
        };
        this.clients.set(ws, conn);
        if (!this.userSockets.has(user.id)) {
          this.userSockets.set(user.id, /* @__PURE__ */ new Set());
        }
        this.userSockets.get(user.id).add(ws);
        db.updateUserLastSeen(user.id);
        if (roomId) {
          this.handleJoinRoom(ws, user, roomId);
        }
        ws.send(
          JSON.stringify({
            type: "auth:success",
            user: {
              id: user.id,
              display_name: user.display_name,
              avatar_url: user.avatar_url
            }
          })
        );
        break;
      }
      case "typing": {
        const conn = this.clients.get(ws);
        if (!conn || !conn.roomId) return;
        const { isTyping } = payload;
        this.handleTyping(conn.roomId, conn.user.id, !!isTyping);
        break;
      }
      case "message:read": {
        const conn = this.clients.get(ws);
        if (!conn || !conn.roomId) return;
        const updatedIds = db.markRead(conn.roomId, conn.user.id);
        if (updatedIds.length > 0) {
          this.broadcastToRoom(conn.roomId, {
            type: "messages:read",
            roomId: conn.roomId,
            readerId: conn.user.id,
            messageIds: updatedIds,
            readAt: Date.now()
          });
        }
        break;
      }
      case "ping": {
        const conn = this.clients.get(ws);
        if (conn) conn.isAlive = true;
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      }
    }
  }
  handleJoinRoom(ws, user, roomId) {
    const room = db.getRoomById(roomId);
    if (!room) {
      ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
      return;
    }
    const member = db.getMember(roomId, user.id);
    if (!member) {
      ws.send(JSON.stringify({ type: "error", message: "Not a member of this chat" }));
      return;
    }
    const conn = this.clients.get(ws);
    if (conn) {
      conn.roomId = roomId;
    }
    if (!this.roomUsers.has(roomId)) {
      this.roomUsers.set(roomId, /* @__PURE__ */ new Set());
    }
    this.roomUsers.get(roomId).add(user.id);
    const members = db.getRoomMembers(roomId);
    const peerMember = members.find((m) => m.user_id !== user.id);
    let peerOnline = false;
    let peerLastSeen;
    if (peerMember) {
      const peerSockets = this.userSockets.get(peerMember.user_id);
      peerOnline = !!(peerSockets && peerSockets.size > 0);
      const peerUser = db.getUserById(peerMember.user_id);
      peerLastSeen = peerUser?.last_seen;
    }
    ws.send(
      JSON.stringify({
        type: "room:sync",
        roomId,
        peerOnline,
        peerLastSeen
      })
    );
    this.broadcastToRoom(
      roomId,
      {
        type: "presence",
        roomId,
        userId: user.id,
        online: true
      },
      ws
    );
    const deliveredIds = db.markDelivered(roomId, user.id);
    if (deliveredIds.length > 0) {
      this.broadcastToRoom(roomId, {
        type: "messages:delivered",
        roomId,
        messageIds: deliveredIds,
        deliveredAt: Date.now()
      });
    }
  }
  handleTyping(roomId, userId, isTyping) {
    const key = `${roomId}:${userId}`;
    const existingTimer = this.typingTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.typingTimers.delete(key);
    }
    this.broadcastToRoom(roomId, {
      type: "typing",
      roomId,
      userId,
      isTyping
    });
    if (isTyping) {
      const timer = setTimeout(() => {
        this.typingTimers.delete(key);
        this.broadcastToRoom(roomId, {
          type: "typing",
          roomId,
          userId,
          isTyping: false
        });
      }, 3500);
      this.typingTimers.set(key, timer);
    }
  }
  handleDisconnect(ws) {
    const conn = this.clients.get(ws);
    if (!conn) return;
    this.clients.delete(ws);
    const userSockets = this.userSockets.get(conn.user.id);
    if (userSockets) {
      userSockets.delete(ws);
      if (userSockets.size === 0) {
        this.userSockets.delete(conn.user.id);
        db.updateUserLastSeen(conn.user.id);
        if (conn.roomId) {
          const room = this.roomUsers.get(conn.roomId);
          if (room) {
            room.delete(conn.user.id);
          }
          this.broadcastToRoom(conn.roomId, {
            type: "presence",
            roomId: conn.roomId,
            userId: conn.user.id,
            online: false,
            lastSeen: Date.now()
          });
          this.handleTyping(conn.roomId, conn.user.id, false);
        }
      }
    }
  }
  broadcastToRoom(roomId, message, excludeWs) {
    const members = db.getRoomMembers(roomId);
    const payload = JSON.stringify(message);
    for (const mem of members) {
      const sockets = this.userSockets.get(mem.user_id);
      if (sockets) {
        for (const sock of sockets) {
          if (sock !== excludeWs && sock.readyState === WebSocket.OPEN) {
            sock.send(payload);
          }
        }
      }
    }
  }
  notifyNewMessage(message) {
    const members = db.getRoomMembers(message.room_id);
    const peerMember = members.find((m) => m.user_id !== message.sender_id);
    if (peerMember) {
      const peerSockets = this.userSockets.get(peerMember.user_id);
      if (peerSockets && peerSockets.size > 0) {
        message.delivered_at = Date.now();
        db.save();
      }
    }
    this.broadcastToRoom(message.room_id, {
      type: "message:new",
      message
    });
  }
  isUserOnline(userId) {
    const sockets = this.userSockets.get(userId);
    return !!(sockets && sockets.size > 0);
  }
};

// server.ts
var app = express();
var server = http.createServer(app);
var socketServer = new ChatSocketServer(server);
var isProduction = process.env.NODE_ENV === "production";
var PORT = Number(process.env.PORT) || 3e3;
app.use(express.json());
function getAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  const user = db.getUserByToken(token);
  if (user) {
    db.updateUserLastSeen(user.id);
  }
  return user || null;
}
function requireAuth(req, res, next) {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized: Invalid or expired session" });
    return;
  }
  req.user = user;
  next();
}
function requireRoomMember(req, res, next) {
  const user = req.user;
  const roomId = req.params.roomId || req.body.roomId;
  if (!roomId) {
    res.status(400).json({ error: "Room ID is required" });
    return;
  }
  const member = db.getMember(roomId, user.id);
  if (!member) {
    res.status(403).json({ error: "Access denied: You are not a participant in this room" });
    return;
  }
  req.roomMember = member;
  next();
}
app.post("/api/auth/register", (req, res) => {
  const { displayName, avatarUrl } = req.body;
  const name = typeof displayName === "string" && displayName.trim() ? displayName.trim() : "Anonymous";
  const user = db.createUser(name, avatarUrl);
  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at
    },
    token: user.session_token
  });
});
app.post("/api/auth/login", (req, res) => {
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: "Session token is required" });
    return;
  }
  const user = db.getUserByToken(token);
  if (!user) {
    res.status(404).json({ error: "Account or session not found" });
    return;
  }
  db.updateUserLastSeen(user.id);
  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at
    },
    token: user.session_token
  });
});
app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = req.user;
  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
      lastSeen: user.last_seen
    }
  });
});
app.patch("/api/auth/profile", requireAuth, (req, res) => {
  const user = req.user;
  const { displayName, avatarUrl } = req.body;
  const updated = db.updateUserProfile(user.id, displayName, avatarUrl);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    user: {
      id: updated.id,
      displayName: updated.display_name,
      avatarUrl: updated.avatar_url
    }
  });
});
app.post("/api/rooms", requireAuth, (req, res) => {
  const user = req.user;
  const { room, member } = db.createRoom(user.id);
  res.status(201).json({
    room: {
      id: room.id,
      token: room.room_token,
      createdBy: room.created_by,
      createdAt: room.created_at
    },
    member
  });
});
app.get("/api/rooms", requireAuth, (req, res) => {
  const user = req.user;
  const rooms = db.getUserRooms(user.id).map(({ room, peer, unreadCount }) => ({
    id: room.id,
    token: room.room_token,
    updatedAt: room.updated_at,
    unreadCount,
    peer: peer ? {
      id: peer.id,
      displayName: peer.display_name,
      avatarUrl: peer.avatar_url,
      online: socketServer.isUserOnline(peer.id),
      lastSeen: peer.last_seen
    } : null
  }));
  res.json({ rooms });
});
app.post("/api/rooms/join", requireAuth, (req, res) => {
  const user = req.user;
  const { roomToken } = req.body;
  if (!roomToken || typeof roomToken !== "string") {
    res.status(400).json({ error: "Room invitation code is required" });
    return;
  }
  const room = db.getRoomByToken(roomToken.trim());
  if (!room) {
    res.status(404).json({ error: "Private chatroom not found. Please verify your invitation link." });
    return;
  }
  const joinResult = db.joinRoom(room.id, user.id);
  if (!joinResult.success) {
    res.status(403).json({ error: joinResult.error || "Chat room is full." });
    return;
  }
  socketServer.broadcastToRoom(room.id, {
    type: "peer:joined",
    roomId: room.id,
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url
    }
  });
  const members = db.getRoomMembers(room.id);
  const peerMember = members.find((m) => m.user_id !== user.id);
  const peer = peerMember ? db.getUserById(peerMember.user_id) : void 0;
  res.json({
    room: {
      id: room.id,
      token: room.room_token,
      createdAt: room.created_at
    },
    peer: peer ? {
      id: peer.id,
      displayName: peer.display_name,
      avatarUrl: peer.avatar_url,
      online: socketServer.isUserOnline(peer.id),
      lastSeen: peer.last_seen
    } : null
  });
});
app.get("/api/rooms/:roomId", requireAuth, requireRoomMember, (req, res) => {
  const user = req.user;
  const roomId = req.params.roomId;
  const room = db.getRoomById(roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const members = db.getRoomMembers(roomId);
  const peerMember = members.find((m) => m.user_id !== user.id);
  const peer = peerMember ? db.getUserById(peerMember.user_id) : void 0;
  res.json({
    room: {
      id: room.id,
      token: room.room_token,
      createdAt: room.created_at,
      status: room.status
    },
    peer: peer ? {
      id: peer.id,
      displayName: peer.display_name,
      avatarUrl: peer.avatar_url,
      online: socketServer.isUserOnline(peer.id),
      lastSeen: peer.last_seen
    } : null,
    totalMembers: members.length
  });
});
app.get("/api/rooms/:roomId/messages", requireAuth, requireRoomMember, (req, res) => {
  const roomId = req.params.roomId;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
  const before = req.query.before ? Number(req.query.before) : void 0;
  const result = db.getMessages(roomId, limit, before);
  res.json(result);
});
app.post("/api/rooms/:roomId/messages", requireAuth, requireRoomMember, (req, res) => {
  const user = req.user;
  const roomId = req.params.roomId;
  const { text, clientMsgId } = req.body;
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "Message text cannot be empty" });
    return;
  }
  const message = db.createMessage({
    id: clientMsgId,
    roomId,
    senderId: user.id,
    messageType: "text",
    textContent: text.trim()
  });
  socketServer.notifyNewMessage(message);
  res.status(201).json({ message });
});
app.post(
  "/api/rooms/:roomId/attachments",
  requireAuth,
  requireRoomMember,
  uploadMiddleware.single("file"),
  (req, res) => {
    const user = req.user;
    const roomId = req.params.roomId;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No valid file was uploaded" });
      return;
    }
    const isImage = file.mimetype.startsWith("image/");
    const safeName = sanitizeFilename(file.originalname);
    const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const attachment = {
      id: attachmentId,
      message_id: "",
      room_id: roomId,
      uploaded_by: user.id,
      file_name: safeName,
      mime_type: file.mimetype,
      file_size: file.size,
      storage_key: file.filename,
      created_at: Date.now()
    };
    const message = db.createMessage({
      id: req.body.clientMsgId,
      roomId,
      senderId: user.id,
      messageType: isImage ? "image" : "file",
      textContent: req.body.caption ? String(req.body.caption).trim() : void 0,
      attachment
    });
    attachment.message_id = message.id;
    socketServer.notifyNewMessage(message);
    res.status(201).json({ message });
  }
);
app.get("/api/rooms/:roomId/attachments/:storageKey", requireAuth, requireRoomMember, (req, res) => {
  const { storageKey } = req.params;
  const attachment = db.getAttachmentByStorageKey(storageKey);
  if (!attachment) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }
  if (attachment.room_id !== req.params.roomId) {
    res.status(403).json({ error: "Access forbidden: unauthorized attachment access" });
    return;
  }
  const filePath = path3.join(UPLOADS_DIR, storageKey);
  if (!fs3.existsSync(filePath)) {
    res.status(404).json({ error: "File data missing on storage" });
    return;
  }
  res.setHeader("Content-Type", attachment.mime_type);
  res.setHeader("Content-Length", attachment.file_size);
  res.setHeader("Cache-Control", "private, max-age=86400");
  const download = req.query.download === "true";
  const encodedFilename = encodeURIComponent(attachment.file_name);
  if (download || !attachment.mime_type.startsWith("image/")) {
    res.setHeader("Content-Disposition", `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
  } else {
    res.setHeader("Content-Disposition", `inline; filename="${encodedFilename}"`);
  }
  const stream = fs3.createReadStream(filePath);
  stream.pipe(res);
});
app.patch("/api/rooms/:roomId/messages/read", requireAuth, requireRoomMember, (req, res) => {
  const user = req.user;
  const roomId = req.params.roomId;
  const updatedIds = db.markRead(roomId, user.id);
  if (updatedIds.length > 0) {
    socketServer.broadcastToRoom(roomId, {
      type: "messages:read",
      roomId,
      readerId: user.id,
      messageIds: updatedIds,
      readAt: Date.now()
    });
  }
  res.json({ readCount: updatedIds.length, messageIds: updatedIds });
});
app.get("/api/rooms/:roomId/search", requireAuth, requireRoomMember, (req, res) => {
  const roomId = req.params.roomId;
  const query = String(req.query.q || "");
  const messages = db.searchMessages(roomId, query);
  res.json({ query, messages });
});
app.get("/api/rooms/:roomId/shared-media", requireAuth, requireRoomMember, (req, res) => {
  const roomId = req.params.roomId;
  const media = db.getSharedMedia(roomId);
  res.json(media);
});
app.post("/api/rooms/:roomId/leave", requireAuth, requireRoomMember, (req, res) => {
  res.json({ success: true });
});
app.use((err, _req, res, _next) => {
  if (err instanceof multer2.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "File size exceeds maximum 25MB limit" });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }
  if (err) {
    res.status(400).json({ error: err.message || "An unexpected error occurred" });
    return;
  }
});
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path3.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path3.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Duo chat server listening on port ${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
