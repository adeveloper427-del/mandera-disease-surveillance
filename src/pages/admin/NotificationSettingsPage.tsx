import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import type { NotificationRule } from '@/types';
import { useNotificationRules } from '@/hooks/queries';
import { notificationService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/forms';
import { ErrorState, LoadingBlock } from '@/components/ui/states';
import { TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { NOTIFICATION_ICON } from '@/components/layout/NotificationBell';

const RECIPIENTS: Record<NotificationRule['recipients'], string> = {
  all_officers: 'All officers & admins',
  ward_officers: 'Officers covering the ward',
  assigned_officer: 'Assigned officer only',
  admins: 'Administrators only',
};

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
  );
}

export function NotificationSettingsPage() {
  const rules = useNotificationRules();
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<NotificationRule[]>([]);

  useEffect(() => {
    if (rules.data) setDraft(rules.data);
  }, [rules.data]);

  const save = useMutation({
    mutationFn: () => notificationService.saveRules(draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'rules'] });
      toast.success('Notification settings saved');
    },
    onError: (e) => toast.error('Could not save', errorMessage(e)),
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(rules.data);
  const update = (type: NotificationRule['type'], patch: Partial<NotificationRule>) => setDraft((d) => d.map((r) => (r.type === type ? { ...r, ...patch } : r)));

  return (
    <>
      <PageHeader
        title="Notification settings"
        description="Choose who is notified about each event and through which channel. SMS and email delivery start once the gateway and mail service are connected."
        actions={
          <Button icon={<Save className="h-4 w-4" />} onClick={() => save.mutate()} disabled={!dirty} loading={save.isPending}>
            Save changes
          </Button>
        }
      />
      <Card>
        <CardHeader title="Notification rules" />
        {rules.isLoading ? (
          <LoadingBlock rows={6} />
        ) : rules.error ? (
          <ErrorState error={rules.error} onRetry={() => rules.refetch()} />
        ) : (
          <Table caption="Notification rules">
            <THead>
              <tr>
                <Th>Event</Th>
                <Th className="text-center">In-app</Th>
                <Th className="text-center">SMS</Th>
                <Th className="text-center">Email</Th>
                <Th>Recipients</Th>
              </tr>
            </THead>
            <TBody>
              {draft.map((r) => {
                const meta = NOTIFICATION_ICON[r.type];
                return (
                  <tr key={r.type}>
                    <Td className="whitespace-normal">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.className}`}>
                          <meta.icon className="h-4 w-4" aria-hidden />
                        </span>
                        <div>
                          <p className="font-medium text-ink">{r.label}</p>
                          <p className="text-xs text-ink-muted">{r.description}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-center">
                      <Check checked={r.inApp} onChange={(v) => update(r.type, { inApp: v })} label={`${r.label}: in-app`} />
                    </Td>
                    <Td className="text-center">
                      <Check checked={r.sms} onChange={(v) => update(r.type, { sms: v })} label={`${r.label}: SMS`} />
                    </Td>
                    <Td className="text-center">
                      <Check checked={r.email} onChange={(v) => update(r.type, { email: v })} label={`${r.label}: email`} />
                    </Td>
                    <Td>
                      <Select aria-label={`${r.label}: recipients`} className="min-w-[220px]" value={r.recipients} onChange={(e) => update(r.type, { recipients: e.target.value as NotificationRule['recipients'] })}>
                        {Object.entries(RECIPIENTS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
