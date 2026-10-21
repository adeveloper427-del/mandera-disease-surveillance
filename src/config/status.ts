import {
  AlertOctagon,
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronsUp,
  Clock,
  Eye,
  Minus,
  Siren,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { AlertLevel, AlertStatus, InboundStatus, OutboundStatus, Priority, ReportStatus } from '@/types';

interface Style {
  label: string;
  icon: LucideIcon;
  className: string;
  dot: string;
  description: string;
}

/** Every status carries a label and an icon, so meaning never relies on color alone. */
export const STATUS: Record<ReportStatus, Style> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-500',
    description: 'Received and waiting for a health officer.',
  },
  under_review: {
    label: 'Under Review',
    icon: Eye,
    className: 'bg-sky-50 text-sky-800 ring-sky-600/20',
    dot: 'bg-sky-500',
    description: 'A health officer is investigating.',
  },
  verified: {
    label: 'Verified',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
    dot: 'bg-emerald-600',
    description: 'Confirmed by a health officer after follow-up.',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    className: 'bg-rose-50 text-rose-800 ring-rose-600/20',
    dot: 'bg-rose-600',
    description: 'Reviewed and not confirmed.',
  },
  escalated: {
    label: 'Escalated',
    icon: ChevronsUp,
    className: 'bg-violet-50 text-violet-800 ring-violet-600/20',
    dot: 'bg-violet-600',
    description: 'Referred to the county team for urgent action.',
  },
  closed: {
    label: 'Closed',
    icon: Archive,
    className: 'bg-slate-100 text-slate-700 ring-slate-500/20',
    dot: 'bg-slate-500',
    description: 'Follow-up complete; kept in history.',
  },
};

export const PRIORITY: Record<Priority, Style> = {
  low: {
    label: 'Low',
    icon: ArrowDown,
    className: 'bg-slate-50 text-slate-700 ring-slate-500/20',
    dot: 'bg-slate-400',
    description: 'Routine follow-up.',
  },
  medium: {
    label: 'Medium',
    icon: Minus,
    className: 'bg-sky-50 text-sky-800 ring-sky-600/20',
    dot: 'bg-sky-500',
    description: 'Review within 24 hours.',
  },
  high: {
    label: 'High',
    icon: ArrowUp,
    className: 'bg-orange-50 text-orange-800 ring-orange-600/25',
    dot: 'bg-orange-500',
    description: 'Review the same day.',
  },
  critical: {
    label: 'Critical',
    icon: AlertOctagon,
    className: 'bg-red-600 text-white ring-red-700',
    dot: 'bg-red-600',
    description: 'Immediate response required.',
  },
};

export const ALERT_LEVEL: Record<AlertLevel, Style> = {
  outbreak: {
    label: 'Potential outbreak',
    icon: Siren,
    className: 'bg-red-50 text-red-800 ring-red-600/25',
    dot: 'bg-red-600',
    description: 'Alert threshold reached. Requires verification.',
  },
  hotspot: {
    label: 'Potential hotspot',
    icon: AlertOctagon,
    className: 'bg-amber-50 text-amber-800 ring-amber-600/25',
    dot: 'bg-amber-500',
    description: 'Reports are clustering. Monitor and review.',
  },
};

export const ALERT_STATUS: Record<AlertStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-red-50 text-red-700 ring-red-600/20' },
  acknowledged: { label: 'Acknowledged', className: 'bg-sky-50 text-sky-800 ring-sky-600/20' },
  investigating: { label: 'Investigating', className: 'bg-violet-50 text-violet-800 ring-violet-600/20' },
  dismissed: { label: 'Dismissed', className: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
  resolved: { label: 'Resolved', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' },
};

export const SMS_STATUS: Record<InboundStatus | OutboundStatus, { label: string; className: string }> = {
  processed: { label: 'Processed', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' },
  invalid: { label: 'Invalid', className: 'bg-rose-50 text-rose-800 ring-rose-600/20' },
  duplicate: { label: 'Duplicate', className: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  sent: { label: 'Sent', className: 'bg-sky-50 text-sky-800 ring-sky-600/20' },
  delivered: { label: 'Delivered', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' },
  failed: { label: 'Failed', className: 'bg-rose-50 text-rose-800 ring-rose-600/20' },
};

/** Categorical chart palette (validated order; see dataviz guidance). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export const CHART = {
  verified: '#1baf7a',
  rejected: '#e34948',
  total: '#2a78d6',
  pending: '#eda100',
  grid: '#e1e0d9',
  axis: '#898781',
};
