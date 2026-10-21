import type { Disease, ParsedSms, ValidationIssue, Village } from '@/types';
import { normalize } from './text';

/**
 * Parses and validates a resident's SMS: KEYWORD#Name#Age#Location#Disease
 *
 * Pure function with no UI or storage dependencies, so the same rules can be
 * ported to the backend SMS processor unchanged.
 */
export const SMS_FORMAT = 'REPORT#Name#Age#Location#Disease';

export interface ParserContext {
  keyword: string;
  villages: Village[];
  diseases: Disease[];
}

export function findVillage(text: string, villages: Village[]): Village | undefined {
  const n = normalize(text);
  if (!n) return undefined;
  return villages.find((v) => v.active && [v.name, ...v.aliases].some((a) => normalize(a) === n));
}

export function findDisease(text: string, diseases: Disease[]): Disease | undefined {
  const n = normalize(text);
  if (!n) return undefined;
  return diseases.find((d) => d.active && [d.name, ...d.aliases].some((a) => normalize(a) === n));
}

export function parseSms(body: string, ctx: ParserContext): ParsedSms {
  const keyword = ctx.keyword.toUpperCase();
  const empty = { keyword: '', name: '', age: '', location: '', disease: '' };
  const fail = (issues: ValidationIssue[], fields = empty): ParsedSms => ({
    valid: false,
    fields,
    issues,
    villageId: null,
    diseaseId: null,
    age: null,
  });

  const text = body.trim();
  if (!text) {
    return fail([{ code: 'EMPTY', field: 'message', message: 'The message is empty.' }]);
  }

  let parts = text.split('#').map((p) => p.trim());
  // Tolerate one accidental trailing "#".
  if (parts.length === 6 && parts[5] === '') parts = parts.slice(0, 5);

  const fields = {
    keyword: parts[0] ?? '',
    name: parts[1] ?? '',
    age: parts[2] ?? '',
    location: parts[3] ?? '',
    disease: parts[4] ?? '',
  };

  if (fields.keyword.toUpperCase() !== keyword) {
    return fail(
      [{ code: 'BAD_KEYWORD', field: 'keyword', message: `The message must start with ${keyword}#.` }],
      fields,
    );
  }

  if (parts.length !== 5) {
    return fail(
      [
        {
          code: 'WRONG_FIELD_COUNT',
          field: 'message',
          message: `Expected 5 parts separated by # but found ${parts.length}.`,
        },
      ],
      fields,
    );
  }

  const issues: ValidationIssue[] = [];

  if (!fields.name) issues.push({ code: 'MISSING_NAME', field: 'name', message: 'Name is missing.' });
  else if (!/^[\p{L}][\p{L}\s.'-]{0,59}$/u.test(fields.name))
    issues.push({ code: 'INVALID_NAME', field: 'name', message: 'Name may only contain letters and spaces.' });

  let age: number | null = null;
  if (!fields.age) issues.push({ code: 'MISSING_AGE', field: 'age', message: 'Age is missing.' });
  else if (!/^\d{1,3}$/.test(fields.age) || Number(fields.age) > 120)
    issues.push({ code: 'INVALID_AGE', field: 'age', message: 'Age must be a number between 0 and 120.' });
  else age = Number(fields.age);

  let villageId: string | null = null;
  if (!fields.location) issues.push({ code: 'MISSING_LOCATION', field: 'location', message: 'Location is missing.' });
  else {
    const v = findVillage(fields.location, ctx.villages);
    if (!v)
      issues.push({
        code: 'UNKNOWN_LOCATION',
        field: 'location',
        message: `"${fields.location}" is not a registered village in this constituency.`,
      });
    else villageId = v.id;
  }

  let diseaseId: string | null = null;
  if (!fields.disease)
    issues.push({ code: 'MISSING_DISEASE', field: 'disease', message: 'Suspected disease is missing.' });
  else {
    const d = findDisease(fields.disease, ctx.diseases);
    if (!d)
      issues.push({
        code: 'UNKNOWN_DISEASE',
        field: 'disease',
        message: `"${fields.disease}" is not on the list of reportable diseases.`,
      });
    else diseaseId = d.id;
  }

  if (issues.length) return fail(issues, fields);
  return { valid: true, fields, issues: [], villageId, diseaseId, age };
}

/** Replace {{variable}} placeholders in an SMS template. */
export function renderTemplate(body: string, vars: Record<string, string | number | undefined>): string {
  return body
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => (vars[key] !== undefined ? String(vars[key]) : ''))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** SMS segments: 160 GSM-7 chars for one, 153 per segment when concatenated. */
export function smsSegments(text: string): number {
  if (text.length <= 160) return 1;
  return Math.ceil(text.length / 153);
}
