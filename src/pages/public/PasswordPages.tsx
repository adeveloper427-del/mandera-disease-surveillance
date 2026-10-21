import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { authService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { API_MODE } from '@/services/apiClient';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/forms';
import { Alert } from '@/components/ui/states';
import { AuthShell } from '@/components/layout/PublicLayout';
import { PasswordStrength, passwordIssues } from '@/components/PasswordStrength';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; devResetToken: string | null } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      setResult(await authService.forgotPassword(email.trim()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="Enter your account email and we'll send you a link to choose a new password.">
      {result ? (
        <div className="space-y-6">
          <Alert tone="success" icon={<Mail className="h-4 w-4" />} title="Check your email">
            {result.message}
          </Alert>
          {API_MODE === 'mock' && result.devResetToken && (
            <Alert tone="info" title="Demo mode">
              No email is sent in the prototype.{' '}
              <Link to={`/reset-password?token=${result.devResetToken}`} className="font-semibold underline">
                Open the reset link
              </Link>
            </Alert>
          )}
          <ButtonLink to="/login" variant="secondary" className="w-full" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to sign in
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label="Email address" error={error}>
            {(id, d) => (
              <Input id={id} aria-describedby={d} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} />
            )}
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Send reset link
          </Button>
          <Link to="/login" className="flex items-center justify-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const issues = passwordIssues(password);
    if (issues.length) next.password = `Password needs ${issues.join(', ')}.`;
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    setFormError(null);
    try {
      await authService.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Supabase puts its recovery session in the URL hash instead of a ?token parameter.
  if (!token && API_MODE !== 'supabase')
    return (
      <AuthShell title="Invalid reset link">
        <Alert tone="danger">This password reset link is missing its token. Request a new link.</Alert>
        <ButtonLink to="/forgot-password" className="mt-6 w-full">
          Request a new link
        </ButtonLink>
      </AuthShell>
    );

  return (
    <AuthShell title="Choose a new password" subtitle="Use a password you don't use for any other service.">
      {done ? (
        <div className="space-y-6">
          <Alert tone="success" icon={<CheckCircle2 className="h-4 w-4" />} title="Password updated">
            You can now sign in with your new password.
          </Alert>
          <Button className="w-full" onClick={() => navigate('/login')}>
            Go to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="New password" error={errors.password}>
            {(id, d) => (
              <PasswordInput id={id} aria-describedby={d} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} />
            )}
          </Field>
          <PasswordStrength password={password} />
          <Field label="Confirm new password" error={errors.confirm}>
            {(id, d) => (
              <PasswordInput id={id} aria-describedby={d} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!errors.confirm} />
            )}
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
