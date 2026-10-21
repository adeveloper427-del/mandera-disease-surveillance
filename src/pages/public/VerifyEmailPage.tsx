import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, MailCheck, RotateCw } from 'lucide-react';
import { authService } from '@/services';
import { API_MODE, errorMessage } from '@/services/apiClient';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/forms';
import { Alert, Spinner } from '@/components/ui/states';
import { AuthShell } from '@/components/layout/PublicLayout';

const RESEND_SECONDS = 60;

/** Officer enters the code Supabase emailed after registration. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const devCodeFromRegister = (location.state as { devCode?: string } | null)?.devCode ?? null;
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(devCodeFromRegister);
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(API_MODE === 'supabase' && window.location.hash.includes('access_token'));
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  // Countdown before the code can be resent.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // The email may also contain a link; if the officer clicked it, finish verification automatically.
  useEffect(() => {
    if (!checkingLink) return;
    const t = setTimeout(() => {
      authService
        .completeLinkVerification()
        .then((r) => r && setVerified(true))
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setCheckingLink(false));
    }, 800);
    return () => clearTimeout(t);
  }, [checkingLink]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter the email address you registered with.');
    if (!/^\d{6,10}$/.test(code.trim())) return setError('Enter the code from the email (numbers only).');
    setLoading(true);
    try {
      await authService.verifyEmail(email.trim().toLowerCase(), code.trim());
      setVerified(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter the email address you registered with.');
    try {
      const res = await authService.resendCode(email.trim().toLowerCase());
      if (res.devCode !== undefined) setDevCode(res.devCode ?? null);
      setInfo(`A new code has been sent to ${email.trim()}. Check your inbox and spam folder.`);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (checkingLink)
    return (
      <AuthShell title="Verifying your email">
        <Spinner label="Verifying" /> <span className="text-sm text-ink-soft">One moment…</span>
      </AuthShell>
    );

  if (verified)
    return (
      <AuthShell title="Email verified" subtitle="Thank you for confirming your email address.">
        <div className="space-y-6">
          <Alert tone="success" icon={<Clock className="h-4 w-4" />} title="Awaiting administrator approval">
            Your request has been sent to the administrator. You will be able to sign in once your account is approved.
          </Alert>
          <ButtonLink to="/login" variant="secondary" className="w-full" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to sign in
          </ButtonLink>
        </div>
      </AuthShell>
    );

  return (
    <AuthShell title="Verify your email" subtitle="We emailed you a verification code. Enter it below to confirm your email address.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        {info && <Alert tone="info">{info}</Alert>}
        {API_MODE === 'mock' && devCode && (
          <Alert tone="info" title="Demo mode">
            No email is sent in the offline demo. Your code is <strong className="font-mono">{devCode}</strong>.
          </Alert>
        )}
        <Field label="Email address">
          {(id) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Verification code" hint="Check your inbox and spam folder. The code expires after one hour.">
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="text-center font-mono text-2xl tracking-[0.5em]"
              placeholder="••••••"
            />
          )}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading} icon={<MailCheck className="h-4 w-4" />}>
          Verify email
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Link to="/login" className="font-medium text-ink-muted hover:text-ink">
            Back to sign in
          </Link>
          <button type="button" onClick={resend} disabled={cooldown > 0} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline disabled:text-ink-muted disabled:no-underline">
            <RotateCw className="h-3.5 w-3.5" aria-hidden />
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
