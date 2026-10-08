import express from 'express';
import multer from 'multer';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { db, UPLOADS_DIR, type User } from './src/server/db.ts';
import { uploadMiddleware, sanitizeFilename } from './src/server/storage.ts';
import { ChatSocketServer } from './src/server/socket.ts';

const app = express();
const server = http.createServer(app);
const socketServer = new ChatSocketServer(server);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Auth helper middleware
function getAuthUser(req: express.Request): User | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  const user = db.getUserByToken(token);
  if (user) {
    db.updateUserLastSeen(user.id);
  }
  return user || null;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    return;
  }
  (req as any).user = user;
  next();
}

// Room member verification middleware
function requireRoomMember(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user: User = (req as any).user;
  const roomId = req.params.roomId || req.body.roomId;
  if (!roomId) {
    res.status(400).json({ error: 'Room ID is required' });
    return;
  }

  const member = db.getMember(roomId, user.id);
  if (!member) {
    res.status(403).json({ error: 'Access denied: You are not a participant in this room' });
    return;
  }
  (req as any).roomMember = member;
  next();
}

// ---------------- API Routes ----------------

// 1. Auth & Identity
app.post('/api/auth/register', (req, res) => {
  const { displayName, avatarUrl } = req.body;
  const name = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : 'Anonymous';
  const user = db.createUser(name, avatarUrl);
  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    },
    token: user.session_token,
  });
});

app.post('/api/auth/login', (req, res) => {
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: 'Session token is required' });
    return;
  }
  const user = db.getUserByToken(token);
  if (!user) {
    res.status(404).json({ error: 'Account or session not found' });
    return;
  }
  db.updateUserLastSeen(user.id);
  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    },
    token: user.session_token,
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
      lastSeen: user.last_seen,
    },
  });
});

app.patch('/api/auth/profile', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const { displayName, avatarUrl } = req.body;
  const updated = db.updateUserProfile(user.id, displayName, avatarUrl);
  if (!updated) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    user: {
      id: updated.id,
      displayName: updated.display_name,
      avatarUrl: updated.avatar_url,
    },
  });
});

// 2. Room Management
app.post('/api/rooms', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const { room, member } = db.createRoom(user.id);

  res.status(201).json({
    room: {
      id: room.id,
      token: room.room_token,
      createdBy: room.created_by,
      createdAt: room.created_at,
    },
    member,
  });
});

app.get('/api/rooms', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const rooms = db.getUserRooms(user.id).map(({ room, peer, unreadCount }) => ({
    id: room.id,
    token: room.room_token,
    updatedAt: room.updated_at,
    unreadCount,
    peer: peer
      ? {
          id: peer.id,
          displayName: peer.display_name,
          avatarUrl: peer.avatar_url,
          online: socketServer.isUserOnline(peer.id),
          lastSeen: peer.last_seen,
        }
      : null,
  }));

  res.json({ rooms });
});

// Join room by room token
app.post('/api/rooms/join', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const { roomToken } = req.body;
  if (!roomToken || typeof roomToken !== 'string') {
    res.status(400).json({ error: 'Room invitation code is required' });
    return;
  }

  const room = db.getRoomByToken(roomToken.trim());
  if (!room) {
    res.status(404).json({ error: 'Private chatroom not found. Please verify your invitation link.' });
    return;
  }

  // Strict two-person join logic on the server!
  const joinResult = db.joinRoom(room.id, user.id);
  if (!joinResult.success) {
    // 403 Chat room is full
    res.status(403).json({ error: joinResult.error || 'Chat room is full.' });
    return;
  }

  // Notify any other member in the room via WS
  socketServer.broadcastToRoom(room.id, {
    type: 'peer:joined',
    roomId: room.id,
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
    },
  });

  const members = db.getRoomMembers(room.id);
  const peerMember = members.find((m) => m.user_id !== user.id);
  const peer = peerMember ? db.getUserById(peerMember.user_id) : undefined;

  res.json({
    room: {
      id: room.id,
      token: room.room_token,
      createdAt: room.created_at,
    },
    peer: peer
      ? {
          id: peer.id,
          displayName: peer.display_name,
          avatarUrl: peer.avatar_url,
          online: socketServer.isUserOnline(peer.id),
          lastSeen: peer.last_seen,
        }
      : null,
  });
});

app.get('/api/rooms/:roomId', requireAuth, requireRoomMember, (req, res) => {
  const user = (req as any).user as User;
  const roomId = req.params.roomId;
  const room = db.getRoomById(roomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const members = db.getRoomMembers(roomId);
  const peerMember = members.find((m) => m.user_id !== user.id);
  const peer = peerMember ? db.getUserById(peerMember.user_id) : undefined;

  res.json({
    room: {
      id: room.id,
      token: room.room_token,
      createdAt: room.created_at,
      status: room.status,
    },
    peer: peer
      ? {
          id: peer.id,
          displayName: peer.display_name,
          avatarUrl: peer.avatar_url,
          online: socketServer.isUserOnline(peer.id),
          lastSeen: peer.last_seen,
        }
      : null,
    totalMembers: members.length,
  });
});

// 3. Messages History & Pagination
app.get('/api/rooms/:roomId/messages', requireAuth, requireRoomMember, (req, res) => {
  const roomId = req.params.roomId;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
  const before = req.query.before ? Number(req.query.before) : undefined;

  const result = db.getMessages(roomId, limit, before);
  res.json(result);
});

// 4. Send Message (Text)
app.post('/api/rooms/:roomId/messages', requireAuth, requireRoomMember, (req, res) => {
  const user = (req as any).user as User;
  const roomId = req.params.roomId;
  const { text, clientMsgId } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Message text cannot be empty' });
    return;
  }

  // Idempotent creation with clientMsgId if provided
  const message = db.createMessage({
    id: clientMsgId,
    roomId,
    senderId: user.id,
    messageType: 'text',
    textContent: text.trim(),
  });

  socketServer.notifyNewMessage(message);

  res.status(201).json({ message });
});

// 5. Upload Attachment (Image or File)
app.post(
  '/api/rooms/:roomId/attachments',
  requireAuth,
  requireRoomMember,
  uploadMiddleware.single('file'),
  (req, res) => {
    const user = (req as any).user as User;
    const roomId = req.params.roomId;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No valid file was uploaded' });
      return;
    }

    const isImage = file.mimetype.startsWith('image/');
    const safeName = sanitizeFilename(file.originalname);
    const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const attachment = {
      id: attachmentId,
      message_id: '',
      room_id: roomId,
      uploaded_by: user.id,
      file_name: safeName,
      mime_type: file.mimetype,
      file_size: file.size,
      storage_key: file.filename,
      created_at: Date.now(),
    };

    const message = db.createMessage({
      id: req.body.clientMsgId,
      roomId,
      senderId: user.id,
      messageType: isImage ? 'image' : 'file',
      textContent: req.body.caption ? String(req.body.caption).trim() : undefined,
      attachment,
    });

    attachment.message_id = message.id;
    socketServer.notifyNewMessage(message);

    res.status(201).json({ message });
  }
);

// 6. Access-Controlled Attachment Serving
app.get('/api/rooms/:roomId/attachments/:storageKey', requireAuth, requireRoomMember, (req, res) => {
  const { storageKey } = req.params;
  const attachment = db.getAttachmentByStorageKey(storageKey);

  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  // Security check: Must belong to this room
  if (attachment.room_id !== req.params.roomId) {
    res.status(403).json({ error: 'Access forbidden: unauthorized attachment access' });
    return;
  }

  const filePath = path.join(UPLOADS_DIR, storageKey);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File data missing on storage' });
    return;
  }

  res.setHeader('Content-Type', attachment.mime_type);
  res.setHeader('Content-Length', attachment.file_size);
  // Cache for member access
  res.setHeader('Cache-Control', 'private, max-age=86400');

  const download = req.query.download === 'true';
  const encodedFilename = encodeURIComponent(attachment.file_name);
  if (download || !attachment.mime_type.startsWith('image/')) {
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
  } else {
    res.setHeader('Content-Disposition', `inline; filename="${encodedFilename}"`);
  }

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// 7. Mark Messages as Read
app.patch('/api/rooms/:roomId/messages/read', requireAuth, requireRoomMember, (req, res) => {
  const user = (req as any).user as User;
  const roomId = req.params.roomId;

  const updatedIds = db.markRead(roomId, user.id);
  if (updatedIds.length > 0) {
    socketServer.broadcastToRoom(roomId, {
      type: 'messages:read',
      roomId,
      readerId: user.id,
      messageIds: updatedIds,
      readAt: Date.now(),
    });
  }

  res.json({ readCount: updatedIds.length, messageIds: updatedIds });
});

// 8. Search Messages in Room
app.get('/api/rooms/:roomId/search', requireAuth, requireRoomMember, (req, res) => {
  const roomId = req.params.roomId;
  const query = String(req.query.q || '');
  const messages = db.searchMessages(roomId, query);
  res.json({ query, messages });
});

// 9. Shared Media (Photos & Files)
app.get('/api/rooms/:roomId/shared-media', requireAuth, requireRoomMember, (req, res) => {
  const roomId = req.params.roomId;
  const media = db.getSharedMedia(roomId);
  res.json(media);
});

// 10. Leave Room
app.post('/api/rooms/:roomId/leave', requireAuth, requireRoomMember, (req, res) => {
  // Can close or mark left
  res.json({ success: true });
});

// Error handling for Multer and API
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File size exceeds maximum 25MB limit' });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }
  if (err) {
    res.status(400).json({ error: err.message || 'An unexpected error occurred' });
    return;
  }
});

// Frontend Vite Setup
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Duo chat server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
