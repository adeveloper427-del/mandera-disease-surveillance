import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { LogoMark } from './Logo';
import { ForbiddenPage } from '@/pages/public/StatusPages';

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50" role="status">
      <LogoMark className="h-12 w-12 animate-pulse" />
      <p className="text-sm text-ink-muted">Loading your workspace…</p>
    </div>
  );
}

/**
 * Client-side route guard. It only controls what is shown: the backend must
 * still check the role on every request (the mock backend does).
 */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <ForbiddenPage />;
  return <>{children}</>;
}
