import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, UserPlus } from 'lucide-react';
import { useLocations } from '@/hooks/queries';
import { authService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { toE164 } from '@/lib/format';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, Field, Input, PasswordInput } from '@/components/ui/forms';
import { Alert, Skeleton } from '@/components/ui/states';
import { AuthShell } from '@/components/layout/PublicLayout';
import { PasswordStrength, passwordIssues } from '@/components/PasswordStrength';

/**
 * Health officers request an account here. The account stays pending until an
 * administrator approves it; until then the officer cannot sign in.
 */
export function RegisterPage() {
  const locations = useLocations();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', title: '', password: '', confirm: '' });
  const [wardIds, setWardIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 3) next.name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!toE164(form.phone)) next.phone = 'Enter a valid Kenyan mobile number, e.g. 0712 345 678.';
    if (!wardIds.length) next.wards = 'Choose at least one ward you work in.';
    const issues = passwordIssues(form.password);
    if (issues.length) next.password = `Password needs ${issues.join(', ')}.`;
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const res = await authService.register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: toE164(form.phone)!,
        title: form.title.trim(),
        wardIds,
        password: form.password,
      });
      // Next step: enter the emailed verification code (skipped if Supabase has email confirmation off).
      if (!res.verified) navigate(`/verify-email?email=${encodeURIComponent(form.email.trim().toLowerCase())}`, { state: { devCode: res.devCode } });
      setDone(res.message);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (done)
    return (
      <AuthShell title="Request sent" subtitle="Thank you for registering.">
        <div className="space-y-6">
          <Alert tone="success" icon={<Clock className="h-4 w-4" />} title="Awaiting approval">
            {done}
          </Alert>
          <ButtonLink to="/login" variant="secondary" className="w-full" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to sign in
          </ButtonLink>
        </div>
      </AuthShell>
    );

  return (
    <AuthShell title="Request a health officer account" subtitle="Your request will be reviewed before you can sign in.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Full name" required error={errors.name}>
          {(id, d) => <Input id={id} aria-describedby={d} value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} autoComplete="name" />}
        </Field>
        <Field label="Work email" required error={errors.email}>
          {(id, d) => <Input id={id} aria-describedby={d} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} autoComplete="email" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number" required error={errors.phone}>
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={(e) => set('phone', e.target.value)} invalid={!!errors.phone} autoComplete="tel" />}
          </Field>
          <Field label="Job title">
            {(id) => <Input id={id} placeholder="Public Health Officer" value={form.title} onChange={(e) => set('title', e.target.value)} />}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">
            Wards you work in <span className="text-rose-600" aria-hidden>*</span>
          </legend>
          {locations.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {locations.data?.wards.map((w) => (
                <Checkbox key={w.id} label={w.name} checked={wardIds.includes(w.id)} onChange={(c) => setWardIds((ids) => (c ? [...ids, w.id] : ids.filter((x) => x !== w.id)))} />
              ))}
            </div>
          )}
          {errors.wards && <p className="mt-1.5 text-xs font-medium text-rose-700" role="alert">{errors.wards}</p>}
        </fieldset>
        <Field label="Password" required error={errors.password}>
          {(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} invalid={!!errors.password} />}
        </Field>
        <PasswordStrength password={form.password} />
        <Field label="Confirm password" required error={errors.confirm}>
          {(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="new-password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} invalid={!!errors.confirm} />}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading} icon={<UserPlus className="h-4 w-4" />}>
          Submit request
        </Button>
        <p className="text-center text-sm text-ink-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
