import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DatabaseZap, PlugZap, RotateCcw, Save } from 'lucide-react';
import type { SystemSettings } from '@/types';
import { useSettings } from '@/hooks/queries';
import { settingsService } from '@/services';
import { API_MODE, errorMessage } from '@/services/apiClient';
import { sleep } from '@/lib/utils';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Toggle } from '@/components/ui/forms';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Alert, ErrorState, LoadingBlock } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="space-y-5">{children}</CardBody>
    </Card>
  );
}

export function SystemSettingsPage() {
  const settings = useSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<SystemSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (s: SystemSettings) => settingsService.update(s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved');
    },
    onError: (e) => toast.error('Could not save settings', errorMessage(e)),
  });

  const reset = useMutation({
    mutationFn: settingsService.resetDemo,
    onSuccess: () => {
      qc.invalidateQueries();
      setConfirmReset(false);
      toast.success('Demo data reset', 'All reports, SMS and logs were restored to the original sample data.');
    },
    onError: (e) => toast.error('Reset failed', errorMessage(e)),
  });

  if (settings.isLoading || (!form && !settings.error))
    return (
      <Card>
        <LoadingBlock rows={8} />
      </Card>
    );
  if (settings.error || !form)
    return (
      <Card>
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      </Card>
    );

  const set = <K extends keyof SystemSettings>(k: K, v: SystemSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const dirty = JSON.stringify(form) !== JSON.stringify(settings.data);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.systemName.trim()) e.systemName = 'Required.';
    if (!/^[A-Z]{1,4}$/.test(form.reportIdPrefix)) e.reportIdPrefix = '1 to 4 capital letters.';
    if (!/^[A-Z]{3,12}$/.test(form.smsKeyword)) e.smsKeyword = '3 to 12 capital letters.';
    if (!/^\d{4,6}$/.test(form.smsShortcode)) e.smsShortcode = '4 to 6 digits.';
    if (form.sessionTimeoutMinutes < 5 || form.sessionTimeoutMinutes > 480) e.sessionTimeoutMinutes = 'Between 5 and 480 minutes.';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate(form);
  };

  const testGateway = async () => {
    setTesting(true);
    await sleep(1200);
    setTesting(false);
    toast.info('No SMS provider connected', 'Reports are received through the web reporting page until an SMS provider is connected.');
  };

  return (
    <>
      <PageHeader
        title="System settings"
        description="Configuration for SMS reporting, workflow and security."
        actions={
          <>
            <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} disabled={!dirty} onClick={() => setForm(settings.data!)}>
              Discard
            </Button>
            <Button icon={<Save className="h-4 w-4" />} disabled={!dirty} loading={save.isPending} onClick={submit}>
              Save settings
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="General" description="Identity of the system and SMS format">
          <Field label="System name" required error={errors.systemName}>
            {(id, d) => <Input id={id} aria-describedby={d} value={form.systemName} onChange={(e) => set('systemName', e.target.value)} invalid={!!errors.systemName} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Report ID prefix" error={errors.reportIdPrefix} hint="e.g. MS → MS001">
              {(id, d) => <Input id={id} aria-describedby={d} value={form.reportIdPrefix} onChange={(e) => set('reportIdPrefix', e.target.value.toUpperCase())} invalid={!!errors.reportIdPrefix} />}
            </Field>
            <Field label="SMS keyword" error={errors.smsKeyword} hint="First part of the SMS">
              {(id, d) => <Input id={id} aria-describedby={d} value={form.smsKeyword} onChange={(e) => set('smsKeyword', e.target.value.toUpperCase())} invalid={!!errors.smsKeyword} />}
            </Field>
            <Field label="Short code" error={errors.smsShortcode}>
              {(id, d) => <Input id={id} aria-describedby={d} value={form.smsShortcode} onChange={(e) => set('smsShortcode', e.target.value)} invalid={!!errors.smsShortcode} inputMode="numeric" />}
            </Field>
          </div>
          {form.smsKeyword !== settings.data?.smsKeyword && (
            <Alert tone="warning">Changing the keyword changes the SMS format residents must use. Update community materials before saving.</Alert>
          )}
        </Section>

        <Section title="Workflow & privacy" description="How reports are handled and displayed">
          <Toggle
            checked={form.autoAssign}
            onChange={(v) => set('autoAssign', v)}
            label="Auto-assign new reports"
            description="Assign each new report to the officer covering the ward with the fewest open reports."
          />
          <Toggle
            checked={form.maskPhoneNumbers}
            onChange={(v) => set('maskPhoneNumbers', v)}
            label="Mask phone numbers"
            description="Hide middle digits of reporter phone numbers. Revealing a number is recorded in the audit log."
          />
        </Section>

        <Section title="Security" description="Session and data retention policies">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Session timeout (minutes)" error={errors.sessionTimeoutMinutes} hint="Users are signed out after this period of inactivity">
              {(id, d) => <Input id={id} aria-describedby={d} type="number" min={5} max={480} value={form.sessionTimeoutMinutes} onChange={(e) => set('sessionTimeoutMinutes', Number(e.target.value))} invalid={!!errors.sessionTimeoutMinutes} />}
            </Field>
            <Field label="Data retention" hint="How long personal data in reports is kept">
              {(id, d) => (
                <Select id={id} aria-describedby={d} value={form.dataRetentionMonths} onChange={(e) => set('dataRetentionMonths', Number(e.target.value))}>
                  {[12, 24, 36, 60, 120].map((m) => (
                    <option key={m} value={m}>
                      {m / 12} year{m === 12 ? '' : 's'}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <p className="text-xs text-ink-muted">Password hashing, rate limiting and API authorization are enforced by the backend and are not configurable here.</p>
        </Section>

        <Section title="SMS gateway" description="Provider used to receive and send SMS">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider">
              {(id) => (
                <Select id={id} value={form.gateway.provider} onChange={(e) => set('gateway', { ...form.gateway, provider: e.target.value })}>
                  <option>Not connected</option>
                  <option>Africa's Talking</option>
                  <option>Twilio</option>
                  <option>Safaricom Bulk SMS</option>
                </Select>
              )}
            </Field>
            <Field label="Sender ID">
              {(id) => <Input id={id} value={form.gateway.senderId} onChange={(e) => set('gateway', { ...form.gateway, senderId: e.target.value })} maxLength={11} />}
            </Field>
          </div>
          <Field label="API key" hint="Secrets are stored on the server only and never sent to the browser.">
            {(id, d) => <Input id={id} aria-describedby={d} type="password" value={form.gateway.apiKeyConfigured ? '••••••••••••' : ''} placeholder="Configured on the server" disabled />}
          </Field>
          <Button variant="secondary" icon={<PlugZap className="h-4 w-4" />} onClick={testGateway} loading={testing}>
            Test connection
          </Button>
        </Section>

        {API_MODE === 'mock' && (
          <Card className="xl:col-span-2">
            <CardHeader title="Demonstration environment" description="Only available while the in-browser mock backend is used" />
            <CardBody className="grid gap-6 md:grid-cols-3">
              <Field label={`Simulated network delay: ${form.mock.latencyMs} ms`} hint="Shows loading states">
                {(id, d) => (
                  <input id={id} aria-describedby={d} type="range" min={0} max={2000} step={50} value={form.mock.latencyMs} onChange={(e) => set('mock', { ...form.mock, latencyMs: Number(e.target.value) })} className="w-full accent-brand-600" />
                )}
              </Field>
              <Field label={`Simulated failure rate: ${Math.round(form.mock.failureRate * 100)}%`} hint="Shows error states and retry buttons">
                {(id, d) => (
                  <input id={id} aria-describedby={d} type="range" min={0} max={0.5} step={0.05} value={form.mock.failureRate} onChange={(e) => set('mock', { ...form.mock, failureRate: Number(e.target.value) })} className="w-full accent-brand-600" />
                )}
              </Field>
              <div>
                <p className="text-sm font-medium text-ink">Reset demo data</p>
                <p className="mb-3 mt-1 text-xs text-ink-muted">Restore the original sample reports, SMS, alerts and logs. Accounts stay signed in.</p>
                <Button variant="danger" icon={<DatabaseZap className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>
                  Reset demo data
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => reset.mutate()}
        loading={reset.isPending}
        tone="danger"
        title="Reset all demo data?"
        confirmLabel="Reset data"
        message="Reports created in the simulator, status changes, users and settings will be replaced with the original sample data. This cannot be undone."
      />
    </>
  );
}
