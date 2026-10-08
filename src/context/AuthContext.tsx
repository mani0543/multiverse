import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types.js';
import { api } from '../services/api.js';
import { socketClient } from '../services/socket.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  loginWithToken: (token: string) => Promise<void>;
  registerUser: (displayName: string, avatarUrl?: string) => Promise<void>;
  updateProfile: (displayName: string, avatarUrl?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'duo_auth_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  });
  const [loading, setLoading] = useState(true);

  const initSession = useCallback(async (existingToken: string) => {
    try {
      api.setToken(existingToken);
      const { user } = await api.getMe();
      setUser(user);
      setToken(existingToken);
      localStorage.setItem(TOKEN_STORAGE_KEY, existingToken);
      socketClient.init(existingToken);
    } catch (err) {
      console.warn('Session verification failed, resetting token:', err);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      api.setToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (savedToken) {
      initSession(savedToken);
    } else {
      setLoading(false);
    }
  }, [initSession]);

  const loginWithToken = async (newToken: string) => {
    setLoading(true);
    try {
      const res = await api.login(newToken);
      setUser(res.user);
      setToken(res.token);
      api.setToken(res.token);
      localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
      socketClient.init(res.token);
    } finally {
      setLoading(false);
    }
  };

  const registerUser = async (displayName: string, avatarUrl?: string) => {
    setLoading(true);
    try {
      const res = await api.register(displayName, avatarUrl);
      setUser(res.user);
      setToken(res.token);
      api.setToken(res.token);
      localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
      socketClient.init(res.token);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (displayName: string, avatarUrl?: string) => {
    const res = await api.updateProfile(displayName, avatarUrl);
    setUser((prev) => (prev ? { ...prev, displayName: res.user.displayName, avatarUrl: res.user.avatarUrl } : res.user));
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    api.setToken(null);
    setToken(null);
    setUser(null);
    socketClient.disconnect();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        loginWithToken,
        registerUser,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
