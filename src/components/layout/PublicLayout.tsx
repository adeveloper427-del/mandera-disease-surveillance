import { Link, Outlet } from 'react-router-dom';
import { useAuth, homeFor } from '@/context/AuthContext';
import { ButtonLink } from '@/components/ui/Button';
import { Logo } from './Logo';

export function PublicLayout() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow">
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="MSDSS home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Public">
            <Link to="/sms-demo" className="hidden rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink sm:block">
              Report by SMS
            </Link>
            {user ? (
              <ButtonLink to={homeFor(user.role)} size="sm">
                Open dashboard
              </ButtonLink>
            ) : (
              <ButtonLink to="/login" size="sm">
                Sign in
              </ButtonLink>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

/** Centered card layout for login and password screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link to="/">
            <Logo light />
          </Link>
          <div className="max-w-md">
            <p className="text-sm font-medium uppercase tracking-wider text-brand-200">Community disease surveillance</p>
            <p className="mt-4 text-3xl font-semibold leading-tight">Faster community disease reporting for Mandera South Constituency.</p>
            <p className="mt-4 text-brand-100">
              Residents report suspected cases by SMS from any phone. Health officers review, verify and respond from this dashboard.
            </p>
            <div className="mt-8 rounded-xl bg-white/10 p-4 font-mono text-sm ring-1 ring-white/15">REPORT#Abdullahi#35#Rhamu#Cholera</div>
          </div>
        </div>
      </div>
      <div className="flex flex-col justify-center bg-white px-4 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
