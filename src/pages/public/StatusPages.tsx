import { Compass, ShieldAlert } from 'lucide-react';
import { useAuth, homeFor } from '@/context/AuthContext';
import { ButtonLink } from '@/components/ui/Button';

function StatusScreen({ code, title, message, icon: Icon }: { code: string; title: string; message: string; icon: typeof Compass }) {
  const { user } = useAuth();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-brand-700">{code}</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-ink-soft">{message}</p>
      <div className="mt-8 flex gap-3">
        <ButtonLink to={user ? homeFor(user.role) : '/'}>{user ? 'Go to dashboard' : 'Go to home page'}</ButtonLink>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return <StatusScreen code="404" title="Page not found" message="The page you are looking for does not exist or has been moved." icon={Compass} />;
}

export function ForbiddenPage() {
  return (
    <StatusScreen
      code="403"
      title="You don't have access to this page"
      message="This area is restricted to a different role. If you think this is a mistake, contact your system administrator."
      icon={ShieldAlert}
    />
  );
}
