import type { ConnectionState, Message } from '../types.js';

type MessageCallback = (msg: Message) => void;
type DeliveredCallback = (data: { roomId: string; messageIds: string[]; deliveredAt: number }) => void;
type ReadCallback = (data: { roomId: string; messageIds: string[]; readerId: string; readAt: number }) => void;
type TypingCallback = (data: { roomId: string; userId: string; isTyping: boolean }) => void;
type PresenceCallback = (data: { roomId: string; userId?: string; online: boolean; lastSeen?: number }) => void;
type StateCallback = (state: ConnectionState) => void;
type PeerJoinedCallback = (data: { roomId: string; user: { id: string; displayName: string; avatarUrl?: string } }) => void;

class SocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private roomId: string | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectTimer: any = null;
  private pingInterval: any = null;

  // Listeners
  private messageListeners: Set<MessageCallback> = new Set();
  private deliveredListeners: Set<DeliveredCallback> = new Set();
  private readListeners: Set<ReadCallback> = new Set();
  private typingListeners: Set<TypingCallback> = new Set();
  private presenceListeners: Set<PresenceCallback> = new Set();
  private stateListeners: Set<StateCallback> = new Set();
  private peerJoinedListeners: Set<PeerJoinedCallback> = new Set();

  public init(token: string) {
    this.token = token;
    if (this.state === 'disconnected') {
      this.connect();
    }
  }

  public setRoom(roomId: string | null) {
    this.roomId = roomId;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.token) {
      // Re-authenticate / join new room
      this.send({
        type: 'auth',
        token: this.token,
        roomId: this.roomId,
      });
    }
  }

  public connect() {
    if (!this.token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.updateState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateState('connected');

        // Authenticate immediately
        this.send({
          type: 'auth',
          token: this.token,
          roomId: this.roomId,
        });

        // Start ping heartbeat
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          this.send({ type: 'ping' });
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handlePayload(payload);
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      this.ws.onclose = () => {
        this.cleanup();
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
        this.ws?.close();
      };
    } catch (err) {
      console.error('Failed to create WebSocket instance:', err);
      this.scheduleReconnect();
    }
  }

  private handlePayload(payload: any) {
    switch (payload.type) {
      case 'message:new':
        if (payload.message) {
          this.messageListeners.forEach((cb) => cb(payload.message));
        }
        break;

      case 'messages:delivered':
        this.deliveredListeners.forEach((cb) => cb(payload));
        break;

      case 'messages:read':
        this.readListeners.forEach((cb) => cb(payload));
        break;

      case 'typing':
        this.typingListeners.forEach((cb) => cb(payload));
        break;

      case 'presence':
        this.presenceListeners.forEach((cb) => cb(payload));
        break;

      case 'room:sync':
        this.presenceListeners.forEach((cb) =>
          cb({
            roomId: payload.roomId,
            online: payload.peerOnline,
            lastSeen: payload.peerLastSeen,
          })
        );
        break;

      case 'peer:joined':
        this.peerJoinedListeners.forEach((cb) => cb(payload));
        break;

      case 'pong':
        // Connection alive
        break;
    }
  }

  public sendTyping(isTyping: boolean) {
    if (!this.roomId) return;
    this.send({
      type: 'typing',
      roomId: this.roomId,
      isTyping,
    });
  }

  public sendReadReceipt() {
    if (!this.roomId) return;
    this.send({
      type: 'message:read',
      roomId: this.roomId,
    });
  }

  private send(obj: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private updateState(newState: ConnectionState) {
    this.state = newState;
    this.stateListeners.forEach((cb) => cb(newState));
  }

  private scheduleReconnect() {
    this.updateState('disconnected');
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Exponential backoff with jitter (max 10s)
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000) + Math.random() * 500;
      this.reconnectAttempts++;
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delay);
    }
  }

  private cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateState('disconnected');
  }

  // Listener registrations
  public onMessage(cb: MessageCallback) {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  public onDelivered(cb: DeliveredCallback) {
    this.deliveredListeners.add(cb);
    return () => this.deliveredListeners.delete(cb);
  }

  public onRead(cb: ReadCallback) {
    this.readListeners.add(cb);
    return () => this.readListeners.delete(cb);
  }

  public onTyping(cb: TypingCallback) {
    this.typingListeners.add(cb);
    return () => this.typingListeners.delete(cb);
  }

  public onPresence(cb: PresenceCallback) {
    this.presenceListeners.add(cb);
    return () => this.presenceListeners.delete(cb);
  }

  public onStateChange(cb: StateCallback) {
    this.stateListeners.add(cb);
    cb(this.state);
    return () => this.stateListeners.delete(cb);
  }

  public onPeerJoined(cb: PeerJoinedCallback) {
    this.peerJoinedListeners.add(cb);
    return () => this.peerJoinedListeners.delete(cb);
  }
}

export const socketClient = new SocketClient();
