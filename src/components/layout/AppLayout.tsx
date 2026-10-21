import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, FlaskConical, KeyRound, LogOut, Menu, Search, UserCircle, X } from 'lucide-react';
import { NAV, type NavItem } from '@/config/navigation';
import { useAuth } from '@/context/AuthContext';
import { useAdminSummary, useAlerts, useNotifications, useSummary } from '@/hooks/queries';
import { isOpenAlert } from '@/lib/hotspot';
import { cn } from '@/lib/utils';
import { API_MODE } from '@/services/apiClient';
import { Dropdown, MenuItem } from '@/components/ui/Tabs';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function useNavBadges(isAdmin: boolean) {
  const summary = useSummary();
  const adminSummary = useAdminSummary(isAdmin);
  const alerts = useAlerts();
  const notes = useNotifications();
  return {
    pending: summary.data?.byStatus.pending ?? 0,
    alerts: alerts.data?.filter(isOpenAlert).length ?? 0,
    notifications: notes.data?.unread ?? 0,
    approvals: adminSummary.data?.pendingApprovals ?? 0,
  };
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const badges = useNavBadges(user?.role === 'admin');
  const sections = NAV.filter((s) => user && s.roles.includes(user.role));

  const badgeFor = (item: NavItem) => {
    if (!item.badge) return null;
    const n = badges[item.badge];
    if (!n) return null;
    return (
      <span
        className={cn(
          'ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold',
          item.badge === 'alerts' || item.badge === 'approvals' ? 'bg-red-500 text-white' : 'bg-white/15 text-white',
        )}
        aria-label={`${n} ${item.badge}`}
      >
        {n}
      </span>
    );
  };

  return (
    <div className="flex h-full flex-col bg-brand-900 text-brand-50">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Logo light />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-2" aria-label="Main navigation">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-brand-300">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.filter((item) => !item.roles || (user && item.roles.includes(user.role))).map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                        isActive ? 'bg-white/10 text-white' : 'text-brand-100 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                    {badgeFor(item)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4 text-[11px] leading-relaxed text-brand-200">
        Reports are <strong className="text-white">suspected</strong> cases until verified by a health officer. This system does not diagnose.
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    if (/^[a-z]{1,4}\d{2,}$/i.test(term)) navigate(`/app/reports/${term.toUpperCase()}`);
    else navigate(`/app/reports?search=${encodeURIComponent(term)}`);
    setQ('');
  };
  return (
    <form onSubmit={submit} className="relative hidden w-full max-w-md md:block" role="search">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Quick search: report ID or keyword"
        placeholder="Search report ID, reporter, phone or village…"
        className="h-10 w-full rounded-lg border-0 bg-slate-100 pl-9 pr-3 text-sm text-ink placeholder:text-slate-500 focus:bg-white focus:ring-2 focus:ring-brand-600"
      />
    </form>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  if (!user) return null;
  return (
    <div className="min-h-screen bg-slate-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow">
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-fade-in">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-brand-100 hover:bg-white/10"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-ink-soft hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            {API_MODE === 'mock' && (
              <span
                className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20 sm:inline-flex"
                title="All data is fictional demonstration data served by the in-browser mock backend."
              >
                <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Demo data
              </span>
            )}
            <NotificationBell />
            <Dropdown
              label="Account"
              trigger={({ toggle, open }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                    {initials(user.name)}
                  </span>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-sm font-medium text-ink">{user.name}</span>
                    <span className="block text-[11px] text-ink-muted">{user.role === 'admin' ? 'Administrator' : 'Health Officer'}</span>
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden />
                </button>
              )}
            >
              {(close) => (
                <div className="py-1">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                    <p className="truncate text-xs text-ink-muted">{user.email}</p>
                  </div>
                  <MenuItem icon={<UserCircle className="h-4 w-4" />} onClick={() => { close(); navigate('/app/profile'); }}>
                    My profile
                  </MenuItem>
                  <MenuItem icon={<KeyRound className="h-4 w-4" />} onClick={() => { close(); navigate('/app/profile#password'); }}>
                    Change password
                  </MenuItem>
                  <div className="my-1 border-t border-slate-100" />
                  <MenuItem
                    danger
                    icon={<LogOut className="h-4 w-4" />}
                    onClick={async () => {
                      close();
                      await logout();
                      navigate('/login', { replace: true });
                    }}
                  >
                    Sign out
                  </MenuItem>
                </div>
              )}
            </Dropdown>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
