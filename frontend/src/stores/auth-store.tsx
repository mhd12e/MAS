import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { API_BASE } from '@/config';

interface AuthState {
  token: string | null;
  loading: boolean;
  needsRegistration: boolean | null; // null = loading, true = first user, false = has account
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [loading, setLoading] = useState(true);
  const [needsRegistration, setNeedsRegistration] = useState<boolean | null>(null);

  // Check auth status on mount
  useEffect(() => {
    fetch(`${API_BASE}/auth/status`)
      .then((r) => r.json())
      .then((data) => {
        setNeedsRegistration(!data.hasAccount);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return err.message || 'Login failed';
      }
      const { token: t } = await res.json();
      localStorage.setItem('auth_token', t);
      setToken(t);
      return null;
    } catch {
      return 'Network error';
    }
  }, []);

  const register = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return err.message || 'Registration failed';
      }
      const { token: t } = await res.json();
      localStorage.setItem('auth_token', t);
      setToken(t);
      setNeedsRegistration(false);
      return null;
    } catch {
      return 'Network error';
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, loading, needsRegistration, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
