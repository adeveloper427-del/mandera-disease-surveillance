import { describe, expect, it } from 'vitest';
import { parseSms, renderTemplate } from '@/lib/smsParser';
import { computePriority } from '@/lib/priority';
import { detectAlerts } from '@/lib/hotspot';
import { renderReply } from '@/lib/smsReplies';
import { canPerform } from '@/lib/workflow';
import { villages } from '@/data/locations';
import { diseases } from '@/data/diseases';
import { seedTemplates } from '@/data/config';
import type { Report } from '@/types';

const ctx = { keyword: 'REPORT', villages, diseases };

describe('SMS parser', () => {
  it('accepts the standard example', () => {
    const r = parseSms('REPORT#Abdullahi#35#Rhamu#Cholera', ctx);
    expect(r.valid).toBe(true);
    expect(r.villageId).toBe('v_rhamu');
    expect(r.diseaseId).toBe('d_cholera');
    expect(r.age).toBe(35);
  });

  it('accepts lowercase and aliases', () => {
    expect(parseSms('report#Fatuma#4#el wak#awd', ctx).valid).toBe(true);
  });

  it.each([
    ['REPORT#Abdullahi', 'WRONG_FIELD_COUNT'],
    ['REPORT#Abdullahi#abc#Rhamu#Cholera', 'INVALID_AGE'],
    ['REPORT#Abdullahi#35##Cholera', 'MISSING_LOCATION'],
    ['REPORT##30#Dimu#Typhoid', 'MISSING_NAME'],
    ['REPORT#Sadia#22#Rhamu#', 'MISSING_DISEASE'],
    ['REPORT#Asha#28#Nairobi#Malaria', 'UNKNOWN_LOCATION'],
    ['REPORT#Noor#40#Hareri#Flu', 'UNKNOWN_DISEASE'],
    ['REPORT#Bashir#200#Garse#Measles', 'INVALID_AGE'],
    ['report cholera elwak', 'BAD_KEYWORD'],
    ['', 'EMPTY'],
  ])('rejects %s with %s', (msg, code) => {
    const r = parseSms(msg, ctx);
    expect(r.valid).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain(code);
  });

  it('replies with the spec wording for a bad structure', () => {
    const reply = renderReply(parseSms('REPORT#Abdullahi', ctx), seedTemplates);
    expect(reply.body).toBe('Invalid format. Use: REPORT#Name#Age#Location#Disease.');
  });

  it('renders the confirmation template', () => {
    expect(renderTemplate(seedTemplates[0].body, { reportId: 'MS001' })).toBe(
      'Your disease report has been received successfully. Report ID: MS001.',
    );
  });
});

describe('priority rules', () => {
  const cholera = diseases.find((d) => d.id === 'd_cholera')!;
  it('uses base priority', () => {
    expect(computePriority({ disease: cholera, age: 30, recentSameVillageCount: 1 }).priority).toBe('high');
  });
  it('raises for vulnerable ages and clusters, capped at critical', () => {
    expect(computePriority({ disease: cholera, age: 2, recentSameVillageCount: 1 }).priority).toBe('critical');
    expect(computePriority({ disease: cholera, age: 2, recentSameVillageCount: 50 }).priority).toBe('critical');
  });
});

describe('hotspot detection', () => {
  const now = Date.now();
  const mk = (i: number, hoursAgo: number, status: Report['status'] = 'pending'): Report => ({
    id: `T${i}`, reporterName: 'X', age: 30, phone: '+254799000000', villageId: 'v_rhamu', diseaseId: 'd_cholera',
    rawMessage: '', receivedAt: new Date(now - hoursAgo * 3_600_000).toISOString(), source: 'sms', status, priority: 'high',
    priorityReasons: [], assignedOfficerId: null, remarks: [], outcome: null, decidedAt: null, decidedBy: null,
    updatedAt: '', history: [],
  });

  it('raises a potential outbreak at the threshold', () => {
    const reports = Array.from({ length: 10 }, (_, i) => mk(i, i));
    const [a] = detectAlerts(reports, diseases, {}, now);
    expect(a.level).toBe('outbreak');
    expect(a.count).toBe(10);
  });
  it('raises a hotspot at half the threshold and ignores old or rejected reports', () => {
    const reports = [...Array.from({ length: 5 }, (_, i) => mk(i, i)), mk(98, 30), mk(99, 1, 'rejected')];
    const [a] = detectAlerts(reports, diseases, {}, now);
    expect(a.level).toBe('hotspot');
    expect(a.count).toBe(5);
  });
});

describe('workflow', () => {
  it('requires review before a decision', () => {
    expect(canPerform('verify', 'pending')).toBe(false);
    expect(canPerform('verify', 'under_review')).toBe(true);
    expect(canPerform('close', 'pending')).toBe(false);
  });
});
