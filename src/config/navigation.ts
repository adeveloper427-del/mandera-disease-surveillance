import {
  Activity,
  BarChart3,
  Bell,
  BellRing,
  ClipboardList,
  FileDown,
  FileText,
  History,
  LayoutDashboard,
  Map,
  MapPinned,
  MessageSquareText,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Siren,
  Smartphone,
  Stethoscope,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: 'alerts' | 'notifications' | 'pending' | 'approvals';
  /** Limit an item to some roles within a shared section. */
  roles?: Role[];
}

export interface NavSection {
  title: string;
  roles: Role[];
  items: NavItem[];
}

/** Role-based navigation: officers never see the Administration section. */
export const NAV: NavSection[] = [
  {
    title: 'Surveillance',
    roles: ['officer', 'admin'],
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/app/reports', label: 'Reports', icon: ClipboardList, badge: 'pending' },
      { to: '/app/alerts', label: 'Alerts & Hotspots', icon: Siren, badge: 'alerts' },
      { to: '/app/diseases', label: 'Disease Monitoring', icon: Activity },
      { to: '/app/map', label: 'Locations & Map', icon: Map },
      { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/app/exports', label: 'Reports & Exports', icon: FileDown },
      { to: '/app/notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
    ],
  },
  {
    title: 'SMS Tools',
    roles: ['admin'],
    items: [
      { to: '/app/demo/simulator', label: 'Test SMS', icon: Smartphone },
      { to: '/app/demo/validation', label: 'Message Checker', icon: ShieldCheck },
      { to: '/app/demo/responses', label: 'Reply Preview', icon: MessagesSquare },
    ],
  },
  {
    title: 'Administration',
    roles: ['admin'],
    items: [
      { to: '/admin', label: 'Admin Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/users', label: 'Users', icon: Users, badge: 'approvals' },
      { to: '/admin/officers', label: 'Health Officers', icon: UserCog },
      { to: '/admin/diseases', label: 'Diseases', icon: Stethoscope },
      { to: '/admin/locations', label: 'Locations', icon: MapPinned },
      { to: '/admin/sms', label: 'SMS Management', icon: MessageSquareText },
      { to: '/admin/templates', label: 'SMS Templates', icon: FileText },
      { to: '/admin/notifications', label: 'Notifications', icon: BellRing },
      { to: '/admin/audit', label: 'Audit Logs', icon: History },
      { to: '/admin/settings', label: 'System Settings', icon: Settings },
    ],
  },
];
