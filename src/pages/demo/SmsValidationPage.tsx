import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleDashed, FlaskConical, Play, X } from 'lucide-react';
import type { ParsedSms, ValidationCode } from '@/types';
import { useTemplates } from '@/hooks/queries';
import { useDebounce } from '@/hooks/useDebounce';
import { smsService } from '@/services';
import { renderReply } from '@/lib/smsReplies';
import { SMS_FORMAT } from '@/lib/smsParser';
import { cn } from '@/lib/utils';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/states';
import { TBody, THead, Table, Td, Th } from '@/components/ui/Table';

const CASES: { message: string; expect: 'valid' | ValidationCode; description: string }[] = [
  { message: 'REPORT#Abdullahi#35#Rhamu#Cholera', expect: 'valid', description: 'Standard valid report' },
  { message: 'report#Fatuma#4#elwak#awd', expect: 'valid', description: 'Lowercase keyword, alias names' },
  { message: 'REPORT#Abdullahi', expect: 'WRONG_FIELD_COUNT', description: 'Only name supplied' },
  { message: 'REPORT#Abdullahi#abc#Rhamu#Cholera', expect: 'INVALID_AGE', description: 'Age is not a number' },
  { message: 'REPORT#Abdullahi#35##Cholera', expect: 'MISSING_LOCATION', description: 'Location left empty' },
  { message: 'REPORT##30#Dimu#Typhoid', expect: 'MISSING_NAME', description: 'Name left empty' },
  { message: 'REPORT#Sadia#22#Rhamu#', expect: 'MISSING_DISEASE', description: 'Disease left empty' },
  { message: 'REPORT#Asha#28#Nairobi#Malaria', expect: 'UNKNOWN_LOCATION', description: 'Village outside the constituency' },
  { message: 'REPORT#Noor#40#Hareri#Flu', expect: 'UNKNOWN_DISEASE', description: 'Disease not on the reportable list' },
  { message: 'REPORT#Bashir#200#Garse#Measles', expect: 'INVALID_AGE', description: 'Age out of range' },
  { message: 'report cholera elwak', expect: 'BAD_KEYWORD', description: 'No # separators' },
  { message: '', expect: 'EMPTY', description: 'Empty message' },
];

const FIELD_LABELS = [
  { key: 'keyword', label: 'Keyword' },
  { key: 'name', label: 'Name' },
  { key: 'age', label: 'Age' },
  { key: 'location', label: 'Location' },
  { key: 'disease', label: 'Disease' },
] as const;

function Breakdown({ parsed }: { parsed: ParsedSms }) {
  const structural = parsed.issues.find((i) => ['EMPTY', 'BAD_KEYWORD', 'WRONG_FIELD_COUNT'].includes(i.code));
  return (
    <div className="grid gap-2 sm:grid-cols-5">
      {FIELD_LABELS.map((f) => {
        const issue = parsed.issues.find((i) => i.field === f.key);
        const ok = !issue && !structural;
        const value = parsed.fields[f.key];
        return (
          <div
            key={f.key}
            className={cn(
              'rounded-lg p-3 ring-1 ring-inset',
              ok ? 'bg-emerald-50/70 ring-emerald-200' : issue ? 'bg-rose-50 ring-rose-200' : 'bg-slate-50 ring-slate-200',
            )}
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {ok ? <Check className="h-3 w-3 text-emerald-700" aria-hidden /> : issue ? <X className="h-3 w-3 text-rose-700" aria-hidden /> : <CircleDashed className="h-3 w-3" aria-hidden />}
              {f.label}
              <span className="sr-only">{ok ? ' valid' : issue ? ' invalid' : ' not checked'}</span>
            </p>
            <p className="mt-1 truncate font-mono text-sm text-ink">{value || <span className="text-ink-muted">(empty)</span>}</p>
            {issue && <p className="mt-1 text-xs text-rose-800">{issue.message}</p>}
          </div>
        );
      })}
    </div>
  );
}

export function SmsValidationPage() {
  const [input, setInput] = useState('REPORT#Abdullahi#abc#Rhamu#Cholera');
  const debounced = useDebounce(input, 250);
  const templates = useTemplates();
  const live = useQuery({ queryKey: ['sms-validate', debounced], queryFn: () => smsService.validate(debounced) });
  const [results, setResults] = useState<Record<number, ParsedSms>>({});
  const [running, setRunning] = useState(false);

  const runAll = async () => {
    setRunning(true);
    setResults({});
    const out: Record<number, ParsedSms> = {};
    for (let i = 0; i < CASES.length; i++) {
      out[i] = await smsService.validate(CASES[i].message);
      setResults({ ...out });
    }
    setRunning(false);
  };

  useEffect(() => {
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passed = (i: number) => {
    const r = results[i];
    if (!r) return null;
    return CASES[i].expect === 'valid' ? r.valid : r.issues.some((x) => x.code === CASES[i].expect);
  };
  const done = Object.keys(results).length;
  const passCount = CASES.filter((_, i) => passed(i)).length;
  const reply = live.data && templates.data ? renderReply(live.data, templates.data, { reportId: 'MS0XX' }) : null;

  return (
    <>
      <PageHeader title="SMS validation" description={`How incoming messages are checked against the format ${SMS_FORMAT}, and the error messages residents receive.`} />

      <Card className="mb-6">
        <CardHeader title="Try a message" description="Validation runs as you type, using the same rules as the SMS processor" />
        <CardBody className="space-y-5">
          <div>
            <label htmlFor="validate-input" className="mb-1.5 block text-sm font-medium text-ink">
              SMS text
            </label>
            <input
              id="validate-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="block w-full rounded-lg border-0 bg-slate-900 px-4 py-3 font-mono text-sm text-emerald-300 ring-1 ring-slate-700 placeholder:text-slate-500 focus:ring-2 focus:ring-brand-500"
              placeholder="REPORT#Name#Age#Location#Disease"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          {live.data ? (
            <>
              <div className="flex items-center gap-2">
                {live.data.valid ? (
                  <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-600/20">
                    <Check className="h-3.5 w-3.5" aria-hidden /> Valid: a report would be created
                  </Badge>
                ) : (
                  <Badge className="bg-rose-50 text-rose-800 ring-rose-600/20">
                    <X className="h-3.5 w-3.5" aria-hidden /> Invalid: {live.data.issues.length} problem{live.data.issues.length === 1 ? '' : 's'}
                  </Badge>
                )}
                {live.isFetching && <Spinner />}
              </div>
              <Breakdown parsed={live.data} />
              {reply && (
                <div>
                  <p className="text-sm font-medium text-ink">Automatic reply to resident</p>
                  <p className="mt-1.5 text-xs text-ink-muted">Template: {reply.key}</p>
                  <p className={cn('mt-2 max-w-xl rounded-2xl rounded-bl-md px-4 py-3 text-sm', live.data.valid ? 'bg-slate-100 text-ink' : 'bg-rose-50 text-rose-900 ring-1 ring-rose-200')}>
                    {reply.body}
                  </p>
                </div>
              )}
            </>
          ) : (
            <Spinner label="Validating" />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Validation test cases"
          description={done === CASES.length ? `${passCount} of ${CASES.length} cases behave as expected` : 'Running…'}
          actions={
            <Button size="sm" variant="secondary" onClick={runAll} loading={running} icon={<Play className="h-3.5 w-3.5" />}>
              Run all tests
            </Button>
          }
        />
        <Table caption="Validation test cases">
          <THead>
            <tr>
              <Th>Message</Th>
              <Th>Scenario</Th>
              <Th>Expected</Th>
              <Th>Actual</Th>
              <Th>Result</Th>
            </tr>
          </THead>
          <TBody>
            {CASES.map((c, i) => {
              const r = results[i];
              const ok = passed(i);
              return (
                <tr key={i}>
                  <Td className="font-mono text-xs text-ink">
                    <button type="button" className="text-left hover:underline" onClick={() => setInput(c.message)} title="Load into the tester">
                      {c.message || <span className="italic text-ink-muted">(empty)</span>}
                    </button>
                  </Td>
                  <Td className="whitespace-normal">{c.description}</Td>
                  <Td className="font-mono text-xs">{c.expect === 'valid' ? 'VALID' : c.expect}</Td>
                  <Td className="whitespace-normal text-xs">{!r ? '…' : r.valid ? 'VALID' : r.issues.map((x) => x.message).join(' ')}</Td>
                  <Td>
                    {ok === null ? (
                      <Spinner />
                    ) : ok ? (
                      <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-600/20">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Pass
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-50 text-rose-800 ring-rose-600/20">
                        <X className="h-3.5 w-3.5" aria-hidden /> Fail
                      </Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </TBody>
        </Table>
        <p className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs text-ink-muted">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Dry run: these checks call the validator only and do not create reports or send SMS.
        </p>
      </Card>
    </>
  );
}
