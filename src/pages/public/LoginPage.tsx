import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth, homeFor } from '@/context/AuthContext';
import { errorMessage } from '@/services/apiClient';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/forms';
import { Alert } from '@/components/ui/states';
import { AuthShell } from '@/components/layout/PublicLayout';

/**
 * One shared sign-in form for every role. The role comes from the account,
 * and the app routes the user to the right workspace after sign-in.
 */
export function LoginPage() {
  const { login, user, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={from ?? homeFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const u = await login(email.trim(), password);
      const allowed = from && (u.role === 'admin' || !from.startsWith('/admin'));
      navigate(allowed ? from! : homeFor(u.role), { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Use the account issued to you by the sub-county health office.">
      {sessionExpired && (
        <Alert tone="warning" className="mb-6">
          Your session expired. Please sign in again.
        </Alert>
      )}
      {formError && (
        <Alert tone="danger" className="mb-6">
          {formError}
          {/verify your email/i.test(formError) && (
            <Link to={`/verify-email?email=${encodeURIComponent(email.trim())}`} className="mt-1 block font-semibold underline">
              Enter verification code
            </Link>
          )}
        </Alert>
      )}
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Email address" error={errors.email}>
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              invalid={!!errors.email}
              placeholder="name@example.org"
            />
          )}
        </Field>
        <Field label="Password" error={errors.password}>
          {(id, d) => (
            <div className="relative">
              <Input
                id={id}
                aria-describedby={d}
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                invalid={!!errors.password}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-ink"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={loading} icon={<LogIn className="h-4 w-4" />}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        New health officer?{' '}
        <Link to="/register" className="font-medium text-brand-700 hover:underline">
          Request an account
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-ink-muted">
        Residents do not need an account. <Link to="/sms-demo" className="font-medium text-brand-700 hover:underline">Report by SMS</Link>.
      </p>
    </AuthShell>
  );
}
