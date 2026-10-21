import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Role, User } from '@/types';
import { authService } from '@/services';
import { onUnauthorized } from '@/services/apiClient';
import { tokenStore } from '@/services/tokenStore';
import { supabase } from '@/lib/supabase';

interface AuthState {
  user: User | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthState['status']>(tokenStore.get() ? 'loading' : 'anonymous');
  const [sessionExpired, setSessionExpired] = useState(false);

  // Restore the session on page load.
  useEffect(() => {
    if (!tokenStore.get()) return;
    authService
      .me()
      .then((u) => {
        setUser(u);
        setStatus('authenticated');
      })
      .catch(() => {
        tokenStore.clear();
        supabase?.auth.signOut().catch(() => undefined);
        setStatus('anonymous');
      });
  }, []);

  // Any 401 from the API signs the user out.
  useEffect(
    () =>
      onUnauthorized(() => {
        if (!tokenStore.get()) return;
        tokenStore.clear();
        supabase?.auth.signOut().catch(() => undefined);
        setUser(null);
        setStatus('anonymous');
        setSessionExpired(true);
        qc.clear();
      }),
    [qc],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await authService.login(email, password);
      tokenStore.set(session.token);
      qc.clear();
      setUser(session.user);
      setStatus('authenticated');
      setSessionExpired(false);
      return session.user;
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Sign out locally even if the server call fails.
    }
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
    qc.clear();
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      status,
      sessionExpired,
      login,
      logout,
      setUser,
      hasRole: (...roles) => !!user && roles.includes(user.role),
    }),
    [user, status, sessionExpired, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Where each role lands after signing in. */
export const homeFor = (role: Role) => (role === 'admin' ? '/admin' : '/app');
