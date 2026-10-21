import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, RotateCcw, Send } from 'lucide-react';
import type { InboundResult } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { invalidateLiveData, usePublicSettings, useRefData } from '@/hooks/queries';
import { smsService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { formatTime, toE164 } from '@/lib/format';
import { smsSegments } from '@/lib/smsParser';
import { cn, sleep } from '@/lib/utils';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/forms';
import { Alert } from '@/components/ui/states';
import { PriorityBadge } from '@/components/ui/Badge';
import { PhoneFrame, type Bubble } from '@/components/sms/PhoneFrame';
import { Logo } from '@/components/layout/Logo';

const SAMPLES = [
  { label: 'Valid report', text: 'REPORT#Abdullahi#35#Rhamu#Cholera' },
  { label: 'Child, measles', text: 'REPORT#Hawa#3#Kutulo#Measles' },
  { label: 'Missing fields', text: 'REPORT#Abdullahi' },
  { label: 'Invalid age', text: 'REPORT#Abdullahi#abc#Rhamu#Cholera' },
  { label: 'Missing location', text: 'REPORT#Abdullahi#35##Cholera' },
  { label: 'Unknown location', text: 'REPORT#Asha#28#Nairobi#Malaria' },
];

interface SavedConversation {
  phone: string;
  bubbles: Bubble[];
  reportIds: string[];
  seenIds: string[];
}

/** The phone keeps its conversation across refreshes, like a real handset. */
function loadConversation(key: string): SavedConversation | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SavedConversation) : null;
  } catch {
    return null;
  }
}

export function SmsSimulatorPage({ publicMode = false }: { publicMode?: boolean }) {
  const storageKey = `msdss.sms-phone.${publicMode ? 'public' : 'app'}`;
  const [saved] = useState(() => loadConversation(storageKey));
  const { user } = useAuth();
  const ref = useRefData();
  const settings = usePublicSettings();
  const qc = useQueryClient();
  const [phone, setPhone] = useState(saved?.phone ?? '0799 123 456');
  const [text, setText] = useState('REPORT#Abdullahi#35#Rhamu#Cholera');
  const [bubbles, setBubbles] = useState<Bubble[]>(saved?.bubbles ?? []);
  // Reports this phone created, and SMS already shown, so later replies can be fetched once.
  const [reportIds, setReportIds] = useState<string[]>(saved?.reportIds ?? []);
  const [seenIds, setSeenIds] = useState<string[]>(saved?.seenIds ?? []);
  const [convPhone, setConvPhone] = useState<string | null>(saved?.phone ? toE164(saved.phone) : null);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<InboundResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const shortcode = settings.data?.smsShortcode ?? '22384';

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ phone, bubbles, reportIds, seenIds }));
    } catch {
      // Storage unavailable (private mode): the conversation just won't persist.
    }
  }, [storageKey, phone, bubbles, reportIds, seenIds]);

  // Check for later replies (verification, rejection, officer messages) every few seconds.
  const later = useQuery({
    queryKey: ['sms-phone', convPhone, reportIds],
    queryFn: () => smsService.conversation(convPhone!, reportIds),
    enabled: !!convPhone && reportIds.length > 0,
    refetchInterval: 5000,
  });
  useEffect(() => {
    const fresh = (later.data ?? []).filter((m) => !seenIds.includes(m.id));
    if (!fresh.length) return;
    setSeenIds((ids) => [...ids, ...fresh.map((m) => m.id)]);
    setBubbles((b) => [...b, ...fresh.map((m) => ({ id: m.id, side: 'received' as const, text: m.body, time: formatTime(m.at) }))]);
  }, [later.data, seenIds]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!toE164(phone)) {
      setPhoneError('Enter a valid Kenyan mobile number, e.g. 0712 345 678.');
      return;
    }
    if (!text.trim()) {
      setError('Type a message to send.');
      textRef.current?.focus();
      return;
    }
    setPhoneError(null);
    setError(null);
    setSending(true);
    setResult(null);
    // A different sender number starts a fresh conversation.
    const sender = toE164(phone);
    if (sender !== convPhone) {
      setBubbles([]);
      setReportIds([]);
      setSeenIds([]);
      setConvPhone(sender);
    }
    const sentAt = new Date().toISOString();
    setBubbles((b) => [...b, { id: `s${Date.now()}`, side: 'sent', text: text.trim(), time: formatTime(sentAt), meta: 'Sent' }]);
    setTyping(true);
    try {
      const res = await smsService.simulateInbound(phone, text.trim());
      setResult(res);
      await sleep(600); // brief typing indicator, like a real reply
      setTyping(false);
      setBubbles((b) => [
        ...b,
        {
          id: res.reply.id,
          side: 'received',
          text: res.reply.body,
          time: formatTime(res.reply.at),
          tone: res.report ? 'success' : 'error',
        },
      ]);
      setSeenIds((ids) => [...ids, res.reply.id]);
      if (res.report) {
        setReportIds((ids) => [...ids, res.report!.id]);
        setText('');
      }
      invalidateLiveData(qc);
    } catch (err) {
      setTyping(false);
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setBubbles([]);
    setReportIds([]);
    setSeenIds([]);
    setResult(null);
    setError(null);
  };

  const content = (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr]">
      <div>
        <PhoneFrame
          contact={`MSDSS · ${shortcode}`}
          subtitle="Disease reporting line"
          bubbles={bubbles}
          typing={typing}
          composer={
            <form onSubmit={send} className="flex items-end gap-2">
              <label htmlFor="sms-body" className="sr-only">
                SMS message
              </label>
              <textarea
                id="sms-body"
                ref={textRef}
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="REPORT#Name#Age#Location#Disease"
                className="block w-full resize-none rounded-2xl border-0 bg-slate-100 px-3.5 py-2 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600"
              />
              <button
                type="submit"
                disabled={sending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-50"
                aria-label="Send SMS"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          }
        />
        <p className="mt-3 text-center text-xs text-ink-muted">
          {text.length} characters · {smsSegments(text)} SMS · press Enter to send
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Send a report"
            description="Use this phone to send a suspected disease report."
          />
          <CardBody className="space-y-4">
            <Field label="Sender phone number" error={phoneError} hint="Any valid Kenyan mobile number.">
              {(id, d) => <Input id={id} aria-describedby={d} value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!phoneError} inputMode="tel" className="max-w-xs" />}
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Quick examples</p>
              <div className="flex flex-wrap gap-2">
                {SAMPLES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => {
                      setText(s.text);
                      textRef.current?.focus();
                    }}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition',
                      text === s.text ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-soft ring-slate-300 hover:bg-slate-50',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => send()} loading={sending} icon={<Send className="h-4 w-4" />}>
                Send SMS
              </Button>
              <Button variant="ghost" onClick={reset} disabled={sending || bubbles.length === 0} icon={<RotateCcw className="h-4 w-4" />}>
                Clear conversation
              </Button>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
          </CardBody>
        </Card>

        {!publicMode && result?.report && (
          <Card>
            <CardBody className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-ink-soft">Report created:</span>
              <span className="font-mono font-semibold text-ink">{result.report.id}</span>
              <PriorityBadge priority={result.report.priority} />
              <span className="text-sm text-ink-soft">
                {ref.diseaseName(result.report.diseaseId)} · {ref.villageName(result.report.villageId)}
              </span>
              {user && (
                <Link to={`/app/reports/${result.report.id}`} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                  Open report <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );

  if (publicMode)
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
            <Link to="/" aria-label="Mandera South Disease Surveillance home">
              <Logo />
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <PageHeader
            title="Report a suspected disease by SMS"
            description={
              <>
                Send <span className="font-mono font-semibold text-ink">REPORT#Name#Age#Location#Disease</span> to{' '}
                <span className="font-semibold text-ink">{shortcode}</span>. You will receive a Report ID, and a health officer will follow up.
              </>
            }
          />
          {content}
        </main>
      </div>
    );

  return (
    <>
      <PageHeader
        title="Test SMS"
        description="Send a report the way a resident would. It appears in the dashboard immediately."
      />
      {content}
    </>
  );
}

export function PublicSmsDemoPage() {
  return <SmsSimulatorPage publicMode />;
}
