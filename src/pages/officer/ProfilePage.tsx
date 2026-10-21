import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { KeyRound, Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRefData } from '@/hooks/queries';
import { authService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { formatDateTime, toE164 } from '@/lib/format';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/forms';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { PasswordStrength, passwordIssues } from '@/components/PasswordStrength';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const ref = useRefData();
  const toast = useToast();
  const location = useLocation();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [profileErrors, setProfileErrors] = useState<{ name?: string; phone?: string }>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwErrors, setPwErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (location.hash === '#password') document.getElementById('password')?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash]);

  if (!user) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof profileErrors = {};
    if (name.trim().length < 3) errs.name = 'Enter your full name.';
    if (phone && !toE164(phone)) errs.phone = 'Enter a valid Kenyan mobile number, e.g. 0712 345 678.';
    setProfileErrors(errs);
    if (Object.keys(errs).length) return;
    setSavingProfile(true);
    try {
      const u = await authService.updateProfile({ name: name.trim(), phone: toE164(phone) ?? phone });
      setUser(u);
      toast.success('Profile updated');
    } catch (err) {
      toast.error('Could not save profile', errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof pwErrors = {};
    if (!current) errs.current = 'Enter your current password.';
    const issues = passwordIssues(next);
    if (issues.length) errs.next = `Password needs ${issues.join(', ')}.`;
    if (next !== confirm) errs.confirm = 'Passwords do not match.';
    setPwErrors(errs);
    setPwError(null);
    if (Object.keys(errs).length) return;
    setSavingPw(true);
    try {
      await authService.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed', 'Use your new password next time you sign in.');
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <>
      <PageHeader title="My profile" description="Your account details and password." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardBody className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-2xl font-semibold text-white">
              {user.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')}
            </div>
            <p className="mt-4 text-lg font-semibold text-ink">{user.name}</p>
            <p className="text-sm text-ink-muted">{user.title}</p>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {user.role === 'admin' ? 'Administrator' : 'Health Officer'}
            </span>
            <dl className="mt-6 space-y-3 border-t border-slate-100 pt-4 text-left text-sm">
              <div>
                <dt className="text-xs text-ink-muted">Email</dt>
                <dd className="text-ink">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Assigned wards</dt>
                <dd className="text-ink">{user.wardIds.length ? user.wardIds.map(ref.wardById).join(', ') : 'All wards'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Last sign-in</dt>
                <dd className="text-ink">{formatDateTime(user.lastLoginAt)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Personal details" description="Your email and role are managed by the system administrator." />
            <CardBody>
              <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2" noValidate>
                <Field label="Full name" required error={profileErrors.name}>
                  {(id, d) => <Input id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} invalid={!!profileErrors.name} autoComplete="name" />}
                </Field>
                <Field label="Phone number" error={profileErrors.phone} hint="Used for alert SMS">
                  {(id, d) => <Input id={id} aria-describedby={d} value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!profileErrors.phone} autoComplete="tel" />}
                </Field>
                <Field label="Email address">{(id) => <Input id={id} value={user.email} disabled />}</Field>
                <Field label="Role">{(id) => <Input id={id} value={user.role === 'admin' ? 'Administrator' : 'Health Officer'} disabled />}</Field>
                <div className="sm:col-span-2">
                  <Button type="submit" loading={savingProfile} icon={<Save className="h-4 w-4" />}>
                    Save changes
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <div id="password" className="scroll-mt-24" />
            <CardHeader title="Change password" description="Choose a strong password you don't use anywhere else." />
            <CardBody>
              <form onSubmit={changePassword} className="max-w-md space-y-4" noValidate>
                {pwError && <Alert tone="danger">{pwError}</Alert>}
                <Field label="Current password" required error={pwErrors.current}>
                  {(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} invalid={!!pwErrors.current} />}
                </Field>
                <Field label="New password" required error={pwErrors.next}>
                  {(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} invalid={!!pwErrors.next} />}
                </Field>
                <PasswordStrength password={next} />
                <Field label="Confirm new password" required error={pwErrors.confirm}>
                  {(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!pwErrors.confirm} />}
                </Field>
                <Button type="submit" loading={savingPw} icon={<KeyRound className="h-4 w-4" />}>
                  Update password
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
