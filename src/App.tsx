import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration, useRouteError } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { RequireAuth } from '@/components/layout/guards';
import { LoadingBlock } from '@/components/ui/states';
import { LogoMark } from '@/components/layout/Logo';
import { NotFoundPage } from '@/pages/public/StatusPages';

const RELOAD_FLAG = 'msdss.reloaded-for-update';

/** A page file is missing because a newer version was deployed while this tab or app stayed open. */
const isStaleBuildError = (err: unknown) =>
  err instanceof Error && /dynamically imported module|Importing a module script failed|error loading dynamically imported|Loading chunk/i.test(err.message);

/** Reload once to pick up the new version; the flag stops a reload loop if the file is truly missing. */
function reloadForUpdate(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    // Storage unavailable: still try one reload.
  }
  window.location.reload();
  return true;
}

/** Lazy-load each page so the first load stays small. */
function page(loader: () => Promise<Record<string, unknown>>, name: string) {
  const Component = lazy(() =>
    loader()
      .then((m) => {
        try {
          sessionStorage.removeItem(RELOAD_FLAG);
        } catch {
          // ignore
        }
        return { default: m[name] as ComponentType };
      })
      .catch((err) => {
        // Keep the loader pending while the page reloads instead of flashing an error.
        if (isStaleBuildError(err) && reloadForUpdate()) return new Promise<never>(() => undefined);
        throw err;
      }),
  );
  return (
    <Suspense fallback={<LoadingBlock rows={6} label="Loading page" />}>
      <Component />
    </Suspense>
  );
}

/** Friendly fallback instead of React Router's technical error screen. */
function RouteError() {
  const error = useRouteError();
  const stale = isStaleBuildError(error);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <LogoMark className="h-12 w-12" />
      <h1 className="mt-6 text-xl font-semibold text-ink">{stale ? 'A new version is available' : 'Something went wrong'}</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        {stale ? 'The system was updated. Reload to continue with the latest version.' : 'Please reload the page. If the problem continues, contact your system administrator.'}
      </p>
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.removeItem(RELOAD_FLAG);
          } catch {
            // ignore
          }
          window.location.reload();
        }}
        className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Reload
      </button>
    </div>
  );
}

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      // Public
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: page(() => import('@/pages/public/LandingPage'), 'LandingPage') },
        ],
      },
      // Standalone resident page: no site header, sign-in or footer.
      { path: '/sms-demo', element: page(() => import('@/pages/demo/SmsSimulatorPage'), 'PublicSmsDemoPage') },
      { path: '/login', element: page(() => import('@/pages/public/LoginPage'), 'LoginPage') },
      { path: '/register', element: page(() => import('@/pages/public/RegisterPage'), 'RegisterPage') },
      { path: '/verify-email', element: page(() => import('@/pages/public/VerifyEmailPage'), 'VerifyEmailPage') },
      { path: '/forgot-password', element: page(() => import('@/pages/public/PasswordPages'), 'ForgotPasswordPage') },
      { path: '/reset-password', element: page(() => import('@/pages/public/PasswordPages'), 'ResetPasswordPage') },

      // Health officer workspace (administrators can access everything)
      {
        path: '/app',
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: page(() => import('@/pages/officer/DashboardPage'), 'DashboardPage') },
          { path: 'reports', element: page(() => import('@/pages/officer/ReportsPage'), 'ReportsPage') },
          { path: 'reports/:id', element: page(() => import('@/pages/officer/ReportDetailPage'), 'ReportDetailPage') },
          { path: 'diseases', element: page(() => import('@/pages/officer/DiseaseMonitoringPage'), 'DiseaseMonitoringPage') },
          { path: 'map', element: page(() => import('@/pages/officer/MapPage'), 'MapPage') },
          { path: 'alerts', element: page(() => import('@/pages/officer/AlertsPage'), 'AlertsPage') },
          { path: 'notifications', element: page(() => import('@/pages/officer/NotificationsPage'), 'NotificationsPage') },
          { path: 'analytics', element: page(() => import('@/pages/officer/AnalyticsPage'), 'AnalyticsPage') },
          { path: 'exports', element: page(() => import('@/pages/officer/ExportsPage'), 'ExportsPage') },
          { path: 'profile', element: page(() => import('@/pages/officer/ProfilePage'), 'ProfilePage') },
          {
            path: 'demo/simulator',
            element: <RequireAuth roles={['admin']}>{page(() => import('@/pages/demo/SmsSimulatorPage'), 'SmsSimulatorPage')}</RequireAuth>,
          },
          { path: 'demo/validation', element: <RequireAuth roles={['admin']}>{page(() => import('@/pages/demo/SmsValidationPage'), 'SmsValidationPage')}</RequireAuth> },
          { path: 'demo/responses', element: <RequireAuth roles={['admin']}>{page(() => import('@/pages/demo/SmsResponsePreviewPage'), 'SmsResponsePreviewPage')}</RequireAuth> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },

      // Administration (admin role only; health officers get a 403 page)
      {
        path: '/admin',
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          {
            element: (
              <RequireAuth roles={['admin']}>
                <Outlet />
              </RequireAuth>
            ),
            children: [
              { index: true, element: page(() => import('@/pages/admin/AdminDashboardPage'), 'AdminDashboardPage') },
              { path: 'users', element: page(() => import('@/pages/admin/UsersPage'), 'UsersPage') },
              { path: 'officers', element: page(() => import('@/pages/admin/OfficersPage'), 'OfficersPage') },
              { path: 'diseases', element: page(() => import('@/pages/admin/DiseasesPage'), 'DiseasesPage') },
              { path: 'locations', element: page(() => import('@/pages/admin/LocationsPage'), 'LocationsPage') },
              { path: 'sms', element: page(() => import('@/pages/admin/SmsManagementPage'), 'SmsManagementPage') },
              { path: 'templates', element: page(() => import('@/pages/admin/SmsTemplatesPage'), 'SmsTemplatesPage') },
              { path: 'notifications', element: page(() => import('@/pages/admin/NotificationSettingsPage'), 'NotificationSettingsPage') },
              { path: 'audit', element: page(() => import('@/pages/admin/AuditLogsPage'), 'AuditLogsPage') },
              { path: 'settings', element: page(() => import('@/pages/admin/SystemSettingsPage'), 'SystemSettingsPage') },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
      {
        element: <PublicLayout />,
        children: [{ path: '*', element: <NotFoundPage /> }],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
