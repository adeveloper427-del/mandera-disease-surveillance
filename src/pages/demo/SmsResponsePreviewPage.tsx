import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import type { SmsTemplateKey } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { usePublicSettings, useTemplates } from '@/hooks/queries';
import { renderTemplate, smsSegments } from '@/lib/smsParser';
import { cn } from '@/lib/utils';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/forms';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { PhoneFrame, type Bubble } from '@/components/sms/PhoneFrame';

interface Scenario {
  key: SmsTemplateKey;
  label: string;
  incoming?: (v: Vars) => string;
  explanation: string;
  officer?: boolean;
}

interface Vars {
  reportId: string;
  name: string;
  location: string;
  disease: string;
}

const SCENARIOS: Scenario[] = [
  { key: 'report_received', label: 'Report received', incoming: (v) => `REPORT#${v.name}#35#${v.location}#${v.disease}`, explanation: 'Sent immediately after a valid report is stored.' },
  { key: 'invalid_format', label: 'Invalid format', incoming: (v) => `REPORT#${v.name}`, explanation: 'Sent when the structure is wrong or name/age is missing or invalid.' },
  { key: 'unknown_location', label: 'Unknown location', incoming: (v) => `REPORT#${v.name}#35#Nairobi#${v.disease}`, explanation: 'Sent when the village is not on the registered list.' },
  { key: 'unknown_disease', label: 'Unknown disease', incoming: (v) => `REPORT#${v.name}#35#${v.location}#Flu`, explanation: 'Sent when the disease is not on the reportable list.' },
  { key: 'report_verified', label: 'Report verified', explanation: 'Sent when a health officer verifies the report.' },
  { key: 'report_rejected', label: 'Report rejected', explanation: 'Sent when a health officer rejects the report.' },
  { key: 'alert_notification', label: 'Officer alert', explanation: 'Sent to health officers when a potential outbreak alert is raised.', officer: true },
];

export function SmsResponsePreviewPage() {
  const { user } = useAuth();
  const templates = useTemplates();
  const settings = usePublicSettings();
  const [active, setActive] = useState<SmsTemplateKey>('report_received');
  const [vars, setVars] = useState<Vars>({ reportId: 'MS001', name: 'Abdullahi', location: 'Rhamu', disease: 'Cholera' });

  const scenario = SCENARIOS.find((s) => s.key === active)!;
  const tpl = templates.data?.find((t) => t.key === active);
  const rendered = tpl
    ? renderTemplate(tpl.body, {
        ...vars,
        reason: active === 'invalid_format' ? '' : undefined,
        location: active === 'unknown_location' ? 'Nairobi' : vars.location,
        disease: active === 'unknown_disease' ? 'Flu' : vars.disease,
        count: 15,
        hours: 24,
      })
    : '';

  const bubbles: Bubble[] = [];
  if (scenario.key === 'report_verified' || scenario.key === 'report_rejected') {
    bubbles.push({ id: 'a', side: 'sent', text: `REPORT#${vars.name}#35#${vars.location}#${vars.disease}`, time: '08:42' });
    bubbles.push({ id: 'b', side: 'received', text: renderTemplate(templates.data?.find((t) => t.key === 'report_received')?.body ?? '', { ...vars }), time: '08:42', tone: 'success' });
  } else if (scenario.incoming) {
    bubbles.push({ id: 'a', side: 'sent', text: scenario.incoming(vars), time: '08:42' });
  }
  bubbles.push({
    id: 'r',
    side: 'received',
    text: rendered,
    time: scenario.key === 'report_verified' || scenario.key === 'report_rejected' ? '11:15' : '08:42',
    tone: ['invalid_format', 'unknown_location', 'unknown_disease'].includes(active) ? 'error' : active === 'report_received' ? 'success' : 'default',
  });

  return (
    <>
      <PageHeader title="SMS response preview" description="See every automatic SMS exactly as residents and officers will receive it, using the current templates." />
      {templates.error ? (
        <Card>
          <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,360px)]">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Scenario" />
              <CardBody>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Scenario">
                  {SCENARIOS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      role="radio"
                      aria-checked={active === s.key}
                      onClick={() => setActive(s.key)}
                      className={cn(
                        'rounded-lg p-3 text-left ring-1 ring-inset transition',
                        active === s.key ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:bg-slate-50',
                      )}
                    >
                      <span className="block text-sm font-medium text-ink">{s.label}</span>
                      <span className="block text-xs text-ink-muted">{s.explanation}</span>
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Sample values" description="Change these to see how variables are filled in" />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                {(['reportId', 'name', 'location', 'disease'] as const).map((k) => (
                  <Field key={k} label={{ reportId: 'Report ID', name: 'Name', location: 'Location', disease: 'Disease' }[k]}>
                    {(id) => <Input id={id} value={vars[k]} onChange={(e) => setVars((v) => ({ ...v, [k]: e.target.value }))} />}
                  </Field>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Template"
                description={tpl ? `${tpl.name} · ${rendered.length} characters · ${smsSegments(rendered)} SMS` : undefined}
                actions={
                  user?.role === 'admin' && (
                    <Link to="/admin/templates" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                      <Pencil className="h-3.5 w-3.5" /> Edit templates
                    </Link>
                  )
                }
              />
              <CardBody>
                {!tpl ? (
                  <Skeleton className="h-16" />
                ) : (
                  <p className="rounded-lg bg-slate-50 p-4 font-mono text-sm leading-relaxed text-ink ring-1 ring-inset ring-slate-200">
                    {tpl.body.split(/(\{\{\s*\w+\s*\}\})/g).map((part, i) =>
                      /^\{\{/.test(part) ? (
                        <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900">
                          {part}
                        </mark>
                      ) : (
                        <span key={i}>{part}</span>
                      ),
                    )}
                  </p>
                )}
                {tpl && !tpl.active && <p className="mt-2 text-xs font-medium text-rose-700">This template is disabled and will not be sent.</p>}
              </CardBody>
            </Card>
          </div>
          <div>
            <PhoneFrame
              contact={scenario.officer ? 'MSDSS Alerts' : `MSDSS · ${settings.data?.smsShortcode ?? '22384'}`}
              subtitle={scenario.officer ? 'Message to health officer' : 'Resident view'}
              bubbles={templates.isLoading ? [] : bubbles}
            />
          </div>
        </div>
      )}
    </>
  );
}
