import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, OfficeSettings } from '../types';
import { apiRequest, setStoredToken, getStoredToken } from '../api/client';

interface AuthContextType {
  user: User | null;
  settings: OfficeSettings | null;
  loading: boolean;
  login: (employeeId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<OfficeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const data = await apiRequest<{ user: User; settings: OfficeSettings }>('/api/auth/me');
      setUser(data.user);
      setSettings(data.settings);
    } catch {
      // If token is invalid or expired, clear stored token
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = async (employeeId: string, password: string) => {
    try {
      const res = await apiRequest<{
        success: boolean;
        user: User;
        token: string;
        settings?: OfficeSettings;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ employee_id: employeeId, password }),
      });

      if (res.token) {
        setStoredToken(res.token);
      }
      if (res.user) {
        setUser(res.user);
      }
      if (res.settings) {
        setSettings(res.settings);
      }

      // Also trigger refreshMe in background to ensure all session state is synced
      refreshMe();

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, settings, loading, login, logout, refreshMe }}>
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
