import type { ChatRoom, Message, User, ReplyToPreview, AdminRoomOverview } from '../types.js';

class ApiService {
  private token: string | null = null;
  private adminToken: string | null = null;

  public setToken(token: string | null) {
    this.token = token;
  }

  public getToken(): string | null {
    return this.token;
  }

  public setAdminToken(token: string | null) {
    this.adminToken = token;
  }

  public getAdminToken(): string | null {
    return this.adminToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }

    return data as T;
  }

  private async adminRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.adminToken) {
      headers['Authorization'] = `Bearer ${this.adminToken}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Admin request failed with status ${res.status}`);
    }

    return data as T;
  }

  // --- Auth ---
  public async register(displayName: string, avatarUrl?: string): Promise<{ user: User; token: string }> {
    return this.request<{ user: User; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ displayName, avatarUrl }),
    });
  }

  public async login(token: string): Promise<{ user: User; token: string }> {
    return this.request<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  public async getMe(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/api/auth/me');
  }

  public async updateProfile(displayName: string, avatarUrl?: string): Promise<{ user: User }> {
    return this.request<{ user: User }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName, avatarUrl }),
    });
  }

  // --- Rooms ---
  public async createRoom(): Promise<{ room: ChatRoom }> {
    return this.request<{ room: ChatRoom }>('/api/rooms', {
      method: 'POST',
    });
  }

  public async getRooms(): Promise<{ rooms: ChatRoom[] }> {
    return this.request<{ rooms: ChatRoom[] }>('/api/rooms');
  }

  public async getRoom(roomId: string): Promise<{ room: ChatRoom; peer: ChatRoom['peer']; totalMembers: number }> {
    return this.request<{ room: ChatRoom; peer: ChatRoom['peer']; totalMembers: number }>(`/api/rooms/${roomId}`);
  }

  public async joinRoom(roomToken: string): Promise<{ room: ChatRoom; peer: ChatRoom['peer'] }> {
    return this.request<{ room: ChatRoom; peer: ChatRoom['peer'] }>('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ roomToken }),
    });
  }

  // --- Messages ---
  public async getMessages(
    roomId: string,
    limit = 40,
    before?: number
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.append('before', String(before));
    return this.request<{ messages: Message[]; hasMore: boolean }>(`/api/rooms/${roomId}/messages?${params.toString()}`);
  }

  public async sendMessage(
    roomId: string,
    text: string,
    clientMsgId?: string,
    replyTo?: ReplyToPreview | null
  ): Promise<{ message: Message }> {
    return this.request<{ message: Message }>(`/api/rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, clientMsgId, replyTo }),
    });
  }

  public async uploadAttachment(
    roomId: string,
    file: File,
    caption?: string,
    clientMsgId?: string,
    replyTo?: ReplyToPreview | null,
    onProgress?: (percent: number) => void
  ): Promise<{ message: Message }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/rooms/${roomId}/attachments`);

      if (this.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      }

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(res);
          } else {
            reject(new Error(res.error || `Upload failed (${xhr.status})`));
          }
        } catch {
          reject(new Error('Failed to parse upload response'));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during file upload'));
      };

      const formData = new FormData();
      formData.append('file', file);
      if (caption) formData.append('caption', caption);
      if (clientMsgId) formData.append('clientMsgId', clientMsgId);
      if (replyTo) formData.append('replyTo', JSON.stringify(replyTo));

      xhr.send(formData);
    });
  }

  public async deleteMessage(roomId: string, messageId: string): Promise<{ success: boolean; messageId: string }> {
    return this.request<{ success: boolean; messageId: string }>(`/api/rooms/${roomId}/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  public async markAsRead(roomId: string): Promise<{ readCount: number; messageIds: string[] }> {
    return this.request<{ readCount: number; messageIds: string[] }>(`/api/rooms/${roomId}/messages/read`, {
      method: 'PATCH',
    });
  }

  public async searchMessages(roomId: string, query: string): Promise<{ query: string; messages: Message[] }> {
    const params = new URLSearchParams({ q: query });
    return this.request<{ query: string; messages: Message[] }>(`/api/rooms/${roomId}/search?${params.toString()}`);
  }

  public async getSharedMedia(roomId: string): Promise<{ images: Message[]; files: Message[] }> {
    return this.request<{ images: Message[]; files: Message[] }>(`/api/rooms/${roomId}/shared-media`);
  }

  public getAttachmentUrl(roomId: string, storageKey: string, download = false): string {
    return `/api/rooms/${roomId}/attachments/${storageKey}${download ? '?download=true' : ''}`;
  }

  // --- Super Admin Endpoints ---
  public async adminLogin(password: string, username = 'admin'): Promise<{ success: boolean; token: string }> {
    const res = await this.adminRequest<{ success: boolean; token: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.adminToken = res.token;
    return res;
  }

  public async adminGetRooms(): Promise<{ rooms: AdminRoomOverview[]; total: number }> {
    return this.adminRequest<{ rooms: AdminRoomOverview[]; total: number }>('/api/admin/rooms');
  }

  public async adminGetRoomMessages(roomId: string): Promise<{ room: ChatRoom; messages: Message[] }> {
    return this.adminRequest<{ room: ChatRoom; messages: Message[] }>(`/api/admin/rooms/${roomId}/messages`);
  }

  public async adminDeleteMessage(roomId: string, messageId: string): Promise<{ success: boolean }> {
    return this.adminRequest<{ success: boolean }>(`/api/admin/rooms/${roomId}/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  public async adminDeleteRoom(roomId: string): Promise<{ success: boolean }> {
    return this.adminRequest<{ success: boolean }>(`/api/admin/rooms/${roomId}`, {
      method: 'DELETE',
    });
  }

  public async adminGetStats(): Promise<{ totalRooms: number; totalMessages: number; database: any; cloudinary: string }> {
    return this.adminRequest<{ totalRooms: number; totalMessages: number; database: any; cloudinary: string }>('/api/admin/stats');
  }
}

export const api = new ApiService();
