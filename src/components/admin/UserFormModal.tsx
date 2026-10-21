import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound } from 'lucide-react';
import type { Role, User } from '@/types';
import { useRefData } from '@/hooks/queries';
import { userService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { toE164 } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select } from '@/components/ui/forms';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';

export function UserFormModal({ open, onClose, user, defaultRole = 'officer' }: { open: boolean; onClose: () => void; user?: User | null; defaultRole?: Role }) {
  const ref = useRefData();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', phone: '', title: '', role: defaultRole as Role, wardIds: [] as string[] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      user
        ? { name: user.name, email: user.email, phone: user.phone, title: user.title, role: user.role, wardIds: user.wardIds }
        : { name: '', email: '', phone: '', title: '', role: defaultRole, wardIds: [] },
    );
    setErrors({});
    setServerError(null);
    setTempPassword(null);
  }, [open, user, defaultRole]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, phone: toE164(form.phone) ?? form.phone, title: form.title || (form.role === 'admin' ? 'Administrator' : 'Health Officer') };
      if (user) return { user: await userService.update(user.id, payload), temporaryPassword: null };
      return userService.create(payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['officers'] });
      if (res.temporaryPassword) setTempPassword(res.temporaryPassword);
      else {
        toast.success('Account updated', `${res.user.name}'s details were saved.`);
        onClose();
      }
    },
    onError: (err) => setServerError(errorMessage(err)),
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = 'Enter the full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.phone && !toE164(form.phone)) e.phone = 'Enter a valid Kenyan mobile number.';
    if (form.role === 'officer' && form.wardIds.length === 0) e.wardIds = 'Assign at least one ward.';
    setErrors(e);
    setServerError(null);
    if (!Object.keys(e).length) save.mutate();
  };

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (tempPassword)
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Account created"
        description={`Share these sign-in details with ${form.name} through a secure channel.`}
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
            <p className="text-xs text-ink-muted">Email</p>
            <p className="font-mono text-sm text-ink">{form.email}</p>
            <p className="mt-3 text-xs text-ink-muted">Temporary password</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-lg font-semibold text-ink">{tempPassword}</p>
              <button
                type="button"
                className="rounded p-1 text-ink-muted hover:bg-slate-200"
                aria-label="Copy password"
                onClick={() => {
                  navigator.clipboard?.writeText(tempPassword).catch(() => undefined);
                  toast.info('Copied to clipboard');
                }}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
          <Alert tone="warning" icon={<KeyRound className="h-4 w-4" />}>
            The user should change this password after first sign-in. In production the backend will email an activation link instead.
          </Alert>
        </div>
      </Modal>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? `Edit ${user.name}` : form.role === 'admin' ? 'Add administrator' : 'Add health officer'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {user ? 'Save changes' : 'Create account'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            {(id, d) => <Input id={id} aria-describedby={d} value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />}
          </Field>
          <Field label="Email" required error={errors.email}>
            {(id, d) => <Input id={id} aria-describedby={d} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} />}
          </Field>
          <Field label="Phone" error={errors.phone} hint="For alert SMS">
            {(id, d) => <Input id={id} aria-describedby={d} value={form.phone} onChange={(e) => set('phone', e.target.value)} invalid={!!errors.phone} placeholder="0712 345 678" />}
          </Field>
          <Field label="Job title">
            {(id) => <Input id={id} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Public Health Officer" />}
          </Field>
          <Field label="Role" required>
            {(id) => (
              <Select id={id} value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
                <option value="officer">Health Officer</option>
                <option value="admin">Administrator</option>
              </Select>
            )}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">
            Assigned wards {form.role === 'officer' && <span className="text-rose-600">*</span>}
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ref.wards.map((w) => (
              <Checkbox
                key={w.id}
                label={w.name}
                checked={form.wardIds.includes(w.id)}
                onChange={(c) => set('wardIds', c ? [...form.wardIds, w.id] : form.wardIds.filter((x) => x !== w.id))}
              />
            ))}
          </div>
          {errors.wardIds && <p className="mt-1.5 text-xs font-medium text-rose-700">{errors.wardIds}</p>}
          {form.role === 'admin' && <p className="mt-1.5 text-xs text-ink-muted">Administrators can access all wards.</p>}
        </fieldset>
      </div>
    </Modal>
  );
}
