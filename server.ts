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
async function getAuthUser(req: express.Request): Promise<User | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  const user = await db.getUserByToken(token);
  if (user) {
    await db.updateUserLastSeen(user.id);
  }
  return user || null;
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
      return;
    }
    (req as any).user = user;
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Authentication error' });
  }
}

// Room member verification middleware
async function requireRoomMember(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const user: User = (req as any).user;
    const roomId = req.params.roomId || req.body.roomId;
    if (!roomId) {
      res.status(400).json({ error: 'Room ID is required' });
      return;
    }

    const member = await db.getMember(roomId, user.id);
    if (!member) {
      res.status(403).json({ error: 'Access denied: You are not a participant in this room' });
      return;
    }
    (req as any).roomMember = member;
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Authorization error' });
  }
}

// Health check endpoint for Render monitoring
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: db.getStatus(),
    timestamp: Date.now(),
  });
});

// ---------------- API Routes ----------------

// 1. Auth & Identity
app.post('/api/auth/register', async (req, res) => {
  try {
    const { displayName, avatarUrl } = req.body;
    const name = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : 'Anonymous';
    const user = await db.createUser(name, avatarUrl);
    res.json({
      user: {
        id: user.id,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
      },
      token: user.session_token,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to register account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Session token is required' });
      return;
    }
    const user = await db.getUserByToken(token);
    if (!user) {
      res.status(404).json({ error: 'Account or session not found' });
      return;
    }
    await db.updateUserLastSeen(user.id);
    res.json({
      user: {
        id: user.id,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
      },
      token: user.session_token,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
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

app.patch('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as User;
    const { displayName, avatarUrl } = req.body;
    const updated = await db.updateUserProfile(user.id, displayName, avatarUrl);
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Profile update failed' });
  }
});

// 2. Room Management
app.post('/api/rooms', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as User;
    const { room, member } = await db.createRoom(user.id);

    res.status(201).json({
      room: {
        id: room.id,
        token: room.room_token,
        createdBy: room.created_by,
        createdAt: room.created_at,
      },
      member,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create room' });
  }
});

app.get('/api/rooms', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as User;
    const userRooms = await db.getUserRooms(user.id);
    const rooms = userRooms.map(({ room, peer, unreadCount }) => ({
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list rooms' });
  }
});

// Join room by room token
app.post('/api/rooms/join', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as User;
    const { roomToken } = req.body;
    if (!roomToken || typeof roomToken !== 'string') {
      res.status(400).json({ error: 'Room invitation code is required' });
      return;
    }

    const room = await db.getRoomByToken(roomToken.trim());
    if (!room) {
      res.status(404).json({ error: 'Private chatroom not found. Please verify your invitation link.' });
      return;
    }

    // Strict two-person join logic on the server!
    const joinResult = await db.joinRoom(room.id, user.id);
    if (!joinResult.success) {
      res.status(403).json({ error: joinResult.error || 'Chat room is full.' });
      return;
    }

    // Notify any other member in the room via WS
    await socketServer.broadcastToRoom(room.id, {
      type: 'peer:joined',
      roomId: room.id,
      user: {
        id: user.id,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      },
    });

    const members = await db.getRoomMembers(room.id);
    const peerMember = members.find((m) => m.user_id !== user.id);
    const peer = peerMember ? await db.getUserById(peerMember.user_id) : undefined;

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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to join room' });
  }
});

app.get('/api/rooms/:roomId', requireAuth, requireRoomMember, async (req, res) => {
  try {
    const user = (req as any).user as User;
    const roomId = req.params.roomId;
    const room = await db.getRoomById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const members = await db.getRoomMembers(roomId);
    const peerMember = members.find((m) => m.user_id !== user.id);
    const peer = peerMember ? await db.getUserById(peerMember.user_id) : undefined;

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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get room' });
  }
});

// 3. Messages History & Pagination
app.get('/api/rooms/:roomId/messages', requireAuth, requireRoomMember, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const before = req.query.before ? Number(req.query.before) : undefined;

    const result = await db.getMessages(roomId, limit, before);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get messages' });
  }
});

// 4. Send Message (Text)
app.post('/api/rooms/:roomId/messages', requireAuth, requireRoomMember, async (req, res) => {
  try {
    const user = (req as any).user as User;
    const roomId = req.params.roomId;
    const { text, clientMsgId } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'Message text cannot be empty' });
      return;
    }

    // Idempotent creation with clientMsgId if provided
    const message = await db.createMessage({
      id: clientMsgId,
      roomId,
      senderId: user.id,
      messageType: 'text',
      textContent: text.trim(),
    });

    await socketServer.notifyNewMessage(message);

    res.status(201).json({ message });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to send message' });
  }
});

// 5. Upload Attachment (Image or File)
app.post(
  '/api/rooms/:roomId/attachments',
  requireAuth,
  requireRoomMember,
  uploadMiddleware.single('file'),
  async (req, res) => {
    try {
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

      const message = await db.createMessage({
        id: req.body.clientMsgId,
        roomId,
        senderId: user.id,
        messageType: isImage ? 'image' : 'file',
        textContent: req.body.caption ? String(req.body.caption).trim() : undefined,
        attachment,
      });

      attachment.message_id = message.id;

      // Save binary blob to persistent database store (e.g. MongoDB) to survive Render dyno restarts!
      try {
        const fileBuffer = fs.readFileSync(file.path);
        await db.saveAttachmentBlob(file.filename, fileBuffer);
      } catch (err) {
        console.warn('Note: Could not backup attachment blob to database:', err);
      }

      await socketServer.notifyNewMessage(message);

      res.status(201).json({ message });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to upload attachment' });
    }
  }
);

// 6. Access-Controlled Attachment Serving
app.get('/api/rooms/:roomId/attachments/:storageKey', requireAuth, requireRoomMember, async (req, res) => {
  try {
    const { storageKey } = req.params;
    const attachment = await db.getAttachmentByStorageKey(storageKey);

    if (!attachment) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    // Security check: Must belong to this room
    if (attachment.room_id !== req.params.roomId) {
      res.status(403).json({ error: 'Access forbidden: unauthorized attachment access' });
      return;
    }

    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Length', attachment.file_size);
    res.setHeader('Cache-Control', 'private, max-age=86400');

    const download = req.query.download === 'true';
    const encodedFilename = encodeURIComponent(attachment.file_name);
    if (download || !attachment.mime_type.startsWith('image/')) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${encodedFilename}"`);
    }

    // Try serving from disk
    const filePath = path.join(UPLOADS_DIR, storageKey);
    if (fs.existsSync(filePath)) {
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      return;
    }

    // If local file was deleted or container restarted on Render, load from MongoDB blob!
    const blob = await db.getAttachmentBlob(storageKey);
    if (blob) {
      res.send(blob);
      return;
    }

    res.status(404).json({ error: 'File data missing on storage' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve attachment' });
  }
});

// 7. Mark Messages as Read
app.patch('/api/rooms/:roomId/messages/read', requireAuth, requireRoomMember, async (req, res) => {
  try {
    const user = (req as any).user as User;
    const roomId = req.params.roomId;

    const updatedIds = await db.markRead(roomId, user.id);
    if (updatedIds.length > 0) {
      await socketServer.broadcastToRoom(roomId, {
        type: 'messages:read',
        roomId,
        readerId: user.id,
        messageIds: updatedIds,
        readAt: Date.now(),
      });
    }

    res.json({ readCount: updatedIds.length, messageIds: updatedIds });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update read status' });
  }
});

// 8. Search Messages in Room
app.get('/api/rooms/:roomId/search', requireAuth, requireRoomMember, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const query = String(req.query.q || '');
    const messages = await db.searchMessages(roomId, query);
    res.json({ query, messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to search messages' });
  }
});

// 9. Shared Media (Photos & Files)
app.get('/api/rooms/:roomId/shared-media', requireAuth, requireRoomMember, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const media = await db.getSharedMedia(roomId);
    res.json(media);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get shared media' });
  }
});

// 10. Leave Room
app.post('/api/rooms/:roomId/leave', requireAuth, requireRoomMember, (_req, res) => {
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

// Frontend Vite / Static Serving Setup
async function startServer() {
  await db.init();

  const distPath = path.resolve(process.cwd(), 'dist');
  const distIndexExists = fs.existsSync(path.join(distPath, 'index.html'));
  const serveStatic = isProduction || process.env.RENDER === 'true' || distIndexExists;

  if (!serveStatic) {
    console.log('[Server] Starting in development mode with Vite middlewares (allowing all hosts)');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[Server] Serving optimized production build from dist/');
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
