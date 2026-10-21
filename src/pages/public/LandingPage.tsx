import { ArrowRight, Smartphone } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { PhoneFrame } from '@/components/sms/PhoneFrame';
import { usePublicSettings } from '@/hooks/queries';

export function LandingPage() {
  const settings = usePublicSettings();
  const shortcode = settings.data?.smsShortcode ?? '22384';

  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden bg-gradient-to-b from-brand-50 to-white">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden />
            Mandera South Constituency · Mandera County
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">SMS-Based Disease Surveillance</h1>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">Report suspected disease in your community by SMS.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/sms-demo" size="lg" icon={<Smartphone className="h-5 w-5" />}>
              Report by SMS
            </ButtonLink>
            <ButtonLink to="/login" size="lg" variant="secondary">
              Health officer sign in <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
          <div className="mt-10 rounded-xl bg-white p-5 shadow-card ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">To report, SMS {shortcode} with</p>
            <p className="mt-2 break-all font-mono text-lg font-semibold text-brand-800">REPORT#Name#Age#Location#Disease</p>
            <p className="mt-1 text-sm text-ink-soft">
              Example: <span className="font-mono">REPORT#Abdullahi#35#Rhamu#Cholera</span>
            </p>
          </div>
        </div>
        <PhoneFrame
          compact
          contact={`MSDSS · ${shortcode}`}
          subtitle="Disease reporting line"
          bubbles={[
            { id: '1', side: 'sent', text: 'REPORT#Abdullahi#35#Rhamu#Cholera', time: '08:42' },
            { id: '2', side: 'received', tone: 'success', text: 'Your disease report has been received successfully. Report ID: MS001.', time: '08:42' },
            {
              id: '3',
              side: 'received',
              text: 'Your disease report MS001 has been verified. Please follow the guidance provided by your nearest health facility.',
              time: '11:15',
            },
          ]}
        />
      </div>
    </section>
  );
}
