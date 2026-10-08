import { WebSocket, WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { db, type User, type Message } from './db.ts';

interface ClientConnection {
  ws: WebSocket;
  user: User;
  roomId?: string;
  isAlive: boolean;
}

export class ChatSocketServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  // Map of userId -> Set of WebSockets
  private userSockets: Map<string, Set<WebSocket>> = new Map();
  // Map of roomId -> Set of userIds
  private roomUsers: Map<string, Set<string>> = new Map();
  // Map of `${roomId}:${userId}` -> NodeJS.Timeout
  private typingTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    // Heartbeat check every 30 seconds
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
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });
  }

  private handleConnection(ws: WebSocket) {
    ws.on('pong', () => {
      const conn = this.clients.get(ws);
      if (conn) conn.isAlive = true;
    });

    ws.on('message', async (data: Buffer | string) => {
      try {
        const payload = JSON.parse(data.toString());
        await this.handleMessage(ws, payload);
      } catch (err) {
        console.error('Invalid WS payload received:', err);
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.error('WS client error:', err);
      this.handleDisconnect(ws);
    });
  }

  private async handleMessage(ws: WebSocket, payload: any) {
    const { type } = payload;

    switch (type) {
      case 'auth': {
        const { token, roomId } = payload;
        if (!token) {
          ws.send(JSON.stringify({ type: 'error', message: 'Token required' }));
          return;
        }

        const user = await db.getUserByToken(token);
        if (!user) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid authentication session' }));
          return;
        }

        // Register client
        const conn: ClientConnection = {
          ws,
          user,
          roomId,
          isAlive: true,
        };
        this.clients.set(ws, conn);

        if (!this.userSockets.has(user.id)) {
          this.userSockets.set(user.id, new Set());
        }
        this.userSockets.get(user.id)!.add(ws);

        await db.updateUserLastSeen(user.id);

        if (roomId) {
          await this.handleJoinRoom(ws, user, roomId);
        }

        ws.send(
          JSON.stringify({
            type: 'auth:success',
            user: {
              id: user.id,
              display_name: user.display_name,
              avatar_url: user.avatar_url,
            },
          })
        );
        break;
      }

      case 'typing': {
        const conn = this.clients.get(ws);
        if (!conn || !conn.roomId) return;
        const { isTyping } = payload;
        this.handleTyping(conn.roomId, conn.user.id, !!isTyping);
        break;
      }

      case 'message:read': {
        const conn = this.clients.get(ws);
        if (!conn || !conn.roomId) return;
        const updatedIds = await db.markRead(conn.roomId, conn.user.id);
        if (updatedIds.length > 0) {
          await this.broadcastToRoom(conn.roomId, {
            type: 'messages:read',
            roomId: conn.roomId,
            readerId: conn.user.id,
            messageIds: updatedIds,
            readAt: Date.now(),
          });
        }
        break;
      }

      case 'ping': {
        const conn = this.clients.get(ws);
        if (conn) conn.isAlive = true;
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }
    }
  }

  private async handleJoinRoom(ws: WebSocket, user: User, roomId: string) {
    const room = await db.getRoomById(roomId);
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      return;
    }

    const member = await db.getMember(roomId, user.id);
    if (!member) {
      ws.send(JSON.stringify({ type: 'error', message: 'Not a member of this chat' }));
      return;
    }

    const conn = this.clients.get(ws);
    if (conn) {
      conn.roomId = roomId;
    }

    if (!this.roomUsers.has(roomId)) {
      this.roomUsers.set(roomId, new Set());
    }
    this.roomUsers.get(roomId)!.add(user.id);

    // Find peer in room
    const members = await db.getRoomMembers(roomId);
    const peerMember = members.find((m) => m.user_id !== user.id);
    let peerOnline = false;
    let peerLastSeen: number | undefined;

    if (peerMember) {
      const peerSockets = this.userSockets.get(peerMember.user_id);
      peerOnline = !!(peerSockets && peerSockets.size > 0);
      const peerUser = await db.getUserById(peerMember.user_id);
      peerLastSeen = peerUser?.last_seen;
    }

    // Inform current user of peer status
    ws.send(
      JSON.stringify({
        type: 'room:sync',
        roomId,
        peerOnline,
        peerLastSeen,
      })
    );

    // Broadcast to room that user is online
    await this.broadcastToRoom(
      roomId,
      {
        type: 'presence',
        roomId,
        userId: user.id,
        online: true,
      },
      ws
    );

    // Any messages previously sent to this user can now be marked delivered
    const deliveredIds = await db.markDelivered(roomId, user.id);
    if (deliveredIds.length > 0) {
      await this.broadcastToRoom(roomId, {
        type: 'messages:delivered',
        roomId,
        messageIds: deliveredIds,
        deliveredAt: Date.now(),
      });
    }
  }

  private handleTyping(roomId: string, userId: string, isTyping: boolean) {
    const key = `${roomId}:${userId}`;
    const existingTimer = this.typingTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.typingTimers.delete(key);
    }

    this.broadcastToRoom(roomId, {
      type: 'typing',
      roomId,
      userId,
      isTyping,
    });

    if (isTyping) {
      // Auto-clear typing after 3.5 seconds
      const timer = setTimeout(() => {
        this.typingTimers.delete(key);
        this.broadcastToRoom(roomId, {
          type: 'typing',
          roomId,
          userId,
          isTyping: false,
        });
      }, 3500);
      this.typingTimers.set(key, timer);
    }
  }

  private async handleDisconnect(ws: WebSocket) {
    const conn = this.clients.get(ws);
    if (!conn) return;

    this.clients.delete(ws);
    const userSockets = this.userSockets.get(conn.user.id);
    if (userSockets) {
      userSockets.delete(ws);
      if (userSockets.size === 0) {
        this.userSockets.delete(conn.user.id);
        await db.updateUserLastSeen(conn.user.id);

        // Notify rooms user was in
        if (conn.roomId) {
          const room = this.roomUsers.get(conn.roomId);
          if (room) {
            room.delete(conn.user.id);
          }
          await this.broadcastToRoom(conn.roomId, {
            type: 'presence',
            roomId: conn.roomId,
            userId: conn.user.id,
            online: false,
            lastSeen: Date.now(),
          });
          // Clear typing
          this.handleTyping(conn.roomId, conn.user.id, false);
        }
      }
    }
  }

  public async broadcastToRoom(roomId: string, message: any, excludeWs?: WebSocket) {
    const members = await db.getRoomMembers(roomId);
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

  public async notifyNewMessage(message: Message) {
    // Check if peer is online in the room to set delivered status
    const members = await db.getRoomMembers(message.room_id);
    const peerMember = members.find((m) => m.user_id !== message.sender_id);

    if (peerMember) {
      const peerSockets = this.userSockets.get(peerMember.user_id);
      if (peerSockets && peerSockets.size > 0) {
        // Peer is online!
        message.delivered_at = Date.now();
      }
    }

    await this.broadcastToRoom(message.room_id, {
      type: 'message:new',
      message,
    });
  }

  public isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return !!(sockets && sockets.size > 0);
  }
}
