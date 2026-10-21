import type { ParsedSms, SmsTemplate, SmsTemplateKey } from '@/types';
import { renderTemplate } from './smsParser';

/**
 * Chooses which auto-reply template applies to a parsed SMS and renders it.
 * Pure function: the backend SMS processor can reuse the same mapping.
 */
export function replyTemplateFor(parsed: ParsedSms): SmsTemplateKey {
  if (parsed.valid) return 'report_received';
  const codes = parsed.issues.map((i) => i.code);
  // Structural problems first: they make the other fields meaningless.
  if (codes.some((c) => ['EMPTY', 'BAD_KEYWORD', 'WRONG_FIELD_COUNT'].includes(c))) return 'invalid_format';
  if (codes.some((c) => ['MISSING_NAME', 'INVALID_NAME', 'MISSING_AGE', 'INVALID_AGE', 'MISSING_LOCATION', 'MISSING_DISEASE'].includes(c)))
    return 'invalid_format';
  if (codes.includes('UNKNOWN_LOCATION')) return 'unknown_location';
  return 'unknown_disease';
}

export function renderReply(
  parsed: ParsedSms,
  templates: SmsTemplate[],
  vars: { reportId?: string; disease?: string; location?: string } = {},
): { key: SmsTemplateKey; body: string } {
  const key = replyTemplateFor(parsed);
  const template = templates.find((t) => t.key === key);
  const structural = parsed.issues.some((i) => ['EMPTY', 'BAD_KEYWORD', 'WRONG_FIELD_COUNT'].includes(i.code));
  const fieldIssues = parsed.issues.filter((i) => !['UNKNOWN_LOCATION', 'UNKNOWN_DISEASE'].includes(i.code));
  const reason = structural ? '' : fieldIssues.map((i) => i.message).join(' ');
  const body = renderTemplate(template?.body ?? 'Invalid format. Use: REPORT#Name#Age#Location#Disease.', {
    reason,
    reportId: vars.reportId,
    name: parsed.fields.name,
    disease: vars.disease ?? parsed.fields.disease,
    location: vars.location ?? parsed.fields.location,
  });
  return { key, body };
}
