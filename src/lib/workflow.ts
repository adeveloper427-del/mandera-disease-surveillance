import type { ReportAction, ReportStatus } from '@/types';

/**
 * Verification workflow state machine, shared by the UI (to enable buttons)
 * and the mock backend (to enforce transitions). The real API must enforce
 * the same rules server-side.
 *
 * Pending -> Under Review -> Verified / Rejected -> Closed
 *            any open state -> Escalated
 */
const ALL: ReportStatus[] = ['pending', 'under_review', 'verified', 'rejected', 'escalated', 'closed'];

export const ALLOWED_FROM: Record<ReportAction['type'], ReportStatus[]> = {
  assign: ['pending', 'under_review', 'escalated', 'verified', 'rejected'],
  start_review: ['pending', 'escalated'],
  verify: ['under_review', 'escalated'],
  reject: ['under_review', 'escalated'],
  escalate: ['pending', 'under_review', 'verified'],
  close: ['verified', 'rejected', 'escalated'],
  remark: ALL,
  set_priority: ['pending', 'under_review', 'escalated', 'verified'],
};

export function canPerform(action: ReportAction['type'], status: ReportStatus) {
  return ALLOWED_FROM[action].includes(status);
}

export const ACTION_HINT: Record<ReportAction['type'], string> = {
  assign: 'Closed reports cannot be reassigned.',
  start_review: 'Only Pending or Escalated reports can move to Under Review.',
  verify: 'Start the review before verifying.',
  reject: 'Start the review before rejecting.',
  escalate: 'Only open or verified reports can be escalated.',
  close: 'Only decided or escalated reports can be closed.',
  remark: '',
  set_priority: 'Priority is locked once a report is rejected or closed.',
};
