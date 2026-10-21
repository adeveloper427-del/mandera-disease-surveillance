import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save } from 'lucide-react';
import type { SmsTemplate } from '@/types';
import { useTemplates } from '@/hooks/queries';
import { smsService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { formatDateTime } from '@/lib/format';
import { renderTemplate, smsSegments } from '@/lib/smsParser';
import { cn } from '@/lib/utils';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea, Toggle } from '@/components/ui/forms';
import { Alert, ErrorState, LoadingBlock } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';

const SAMPLE = { reportId: 'MS001', name: 'Abdullahi', disease: 'Cholera', location: 'Rhamu', reason: 'Age must be a number between 0 and 120.', count: 15, hours: 24 };

function Editor({ template }: { template: SmsTemplate }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState(template.body);
  const [active, setActive] = useState(template.active);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBody(template.body);
    setActive(template.active);
  }, [template]);

  const save = useMutation({
    mutationFn: () => smsService.updateTemplate(template.key, { body: body.trim(), active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template saved', template.name);
    },
  });

  const unknownVars = [...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((v) => !template.variables.includes(v));
  const dirty = body !== template.body || active !== template.active;
  const preview = renderTemplate(body, SAMPLE);

  const insert = (v: string) => {
    const el = ta.current;
    const token = `{{${v}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <Card>
      <CardHeader
        title={template.name}
        description={template.description}
        actions={
          <Badge className={active ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' : 'bg-slate-100 text-slate-700 ring-slate-500/20'}>{active ? 'Active' : 'Disabled'}</Badge>
        }
      />
      <CardBody className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <label htmlFor={`tpl-${template.key}`} className="text-sm font-medium text-ink">
            Message text
          </label>
          <Textarea id={`tpl-${template.key}`} ref={ta} value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={459} invalid={!body.trim() || unknownVars.length > 0} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-muted">Insert variable:</span>
            {template.variables.map((v) => (
              <button key={v} type="button" onClick={() => insert(v)} className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-xs text-amber-900 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          {unknownVars.length > 0 && <Alert tone="danger">Unknown variable(s): {unknownVars.join(', ')}. They will be left blank.</Alert>}
          <Toggle checked={active} onChange={setActive} label="Send this message automatically" />
        </div>
        <div>
          <p className="text-sm font-medium text-ink">Preview</p>
          <p className="mt-1 text-xs text-ink-muted">
            {preview.length} characters · {smsSegments(preview)} SMS segment{smsSegments(preview) === 1 ? '' : 's'}
          </p>
          <div className="mt-3 rounded-2xl bg-slate-100 p-4">
            <p className={cn('max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm text-ink shadow-sm', !active && 'opacity-50')}>{preview || ' '}</p>
          </div>
          <p className="mt-3 text-[11px] text-ink-muted">Last updated {formatDateTime(template.updatedAt)}</p>
        </div>
      </CardBody>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
        {save.error && <span className="mr-auto text-sm text-rose-700">{errorMessage(save.error)}</span>}
        <Button
          variant="ghost"
          icon={<RotateCcw className="h-4 w-4" />}
          disabled={!dirty}
          onClick={() => {
            setBody(template.body);
            setActive(template.active);
          }}
        >
          Discard
        </Button>
        <Button icon={<Save className="h-4 w-4" />} onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || !body.trim()}>
          Save template
        </Button>
      </div>
    </Card>
  );
}

export function SmsTemplatesPage() {
  const templates = useTemplates();
  return (
    <>
      <PageHeader title="SMS templates" description="Automatic messages sent to residents and health officers. Variables in {{braces}} are filled in when each SMS is sent." />
      {templates.isLoading ? (
        <Card>
          <LoadingBlock rows={6} />
        </Card>
      ) : templates.error ? (
        <Card>
          <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
        </Card>
      ) : (
        <div className="space-y-6">
          {templates.data!.map((t) => (
            <Editor key={t.key} template={t} />
          ))}
        </div>
      )}
    </>
  );
}
