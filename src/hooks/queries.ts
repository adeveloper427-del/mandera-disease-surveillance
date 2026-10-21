/**
 * React Query hooks: caching, loading/error state and automatic refresh.
 * Pages use these hooks, never the services directly, so data stays in sync
 * everywhere (for example, the dashboard updates after a report is verified).
 */
import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Granularity, ReportAction, ReportQuery } from '@/types';
import {
  alertService,
  analyticsService,
  auditService,
  diseaseService,
  exportService,
  locationService,
  notificationService,
  reportService,
  settingsService,
  smsService,
  userService,
  type AnalyticsScope,
} from '@/services';
import { tokenStore } from '@/services/tokenStore';

/** Polling stands in for real-time push. Later, a WebSocket event can call invalidateLiveData instead. */
const LIVE_INTERVAL = 20_000;

export function invalidateLiveData(qc: QueryClient) {
  for (const key of ['reports', 'report', 'analytics', 'alerts', 'notifications', 'sms', 'officers', 'audit', 'exports']) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

// ---------- Reference data ----------
export const useDiseases = () => useQuery({ queryKey: ['diseases'], queryFn: diseaseService.list, staleTime: 60_000 });
export const useLocations = () => useQuery({ queryKey: ['locations'], queryFn: locationService.tree, staleTime: 60_000 });
// Officer list needs a session; public pages (landing, SMS demo) skip it.
export const useOfficers = () =>
  useQuery({ queryKey: ['officers'], queryFn: userService.officers, staleTime: 30_000, enabled: !!tokenStore.get() });
export const usePublicSettings = () => useQuery({ queryKey: ['settings', 'public'], queryFn: settingsService.public, staleTime: 60_000 });
export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: smsService.templates });

/** Name lookups for ids, built from cached reference data. */
export function useRefData() {
  const diseases = useDiseases();
  const locations = useLocations();
  const officers = useOfficers();
  return useMemo(() => {
    const dMap = new Map(diseases.data?.map((d) => [d.id, d]) ?? []);
    const vMap = new Map(locations.data?.villages.map((v) => [v.id, v]) ?? []);
    const wMap = new Map(locations.data?.wards.map((w) => [w.id, w]) ?? []);
    const oMap = new Map(officers.data?.map((o) => [o.user.id, o.user]) ?? []);
    return {
      ready: !!diseases.data && !!locations.data,
      diseases: diseases.data ?? [],
      villages: locations.data?.villages ?? [],
      wards: locations.data?.wards ?? [],
      officers: officers.data ?? [],
      diseaseName: (id: string) => dMap.get(id)?.name ?? '—',
      villageName: (id: string) => vMap.get(id)?.name ?? '—',
      wardName: (villageId: string) => wMap.get(vMap.get(villageId)?.wardId ?? '')?.name ?? '—',
      wardById: (id: string) => wMap.get(id)?.name ?? '—',
      officerName: (id: string | null) => (id ? oMap.get(id)?.name ?? 'Unknown officer' : 'Not assigned'),
    };
  }, [diseases.data, locations.data, officers.data]);
}

// ---------- Reports ----------
export const useReports = (q: ReportQuery) =>
  useQuery({ queryKey: ['reports', q], queryFn: () => reportService.list(q), placeholderData: keepPreviousData, refetchInterval: LIVE_INTERVAL });

export const useReport = (id: string) => useQuery({ queryKey: ['report', id], queryFn: () => reportService.get(id), retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2 });

export const useReportSms = (id: string) => useQuery({ queryKey: ['sms', 'report', id], queryFn: () => reportService.sms(id) });

export function useReportAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: ReportAction) => reportService.act(id, action),
    onSuccess: (report) => {
      qc.setQueryData(['report', id], report);
      invalidateLiveData(qc);
    },
  });
}

export function useSendReportSms(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { message: string }) => reportService.sendSms(id, v.message),
    onSuccess: () => invalidateLiveData(qc),
  });
}

// ---------- Analytics ----------
export const useSummary = () => useQuery({ queryKey: ['analytics', 'summary'], queryFn: analyticsService.summary, refetchInterval: LIVE_INTERVAL });
export const useTimeseries = (g: Granularity, scope: AnalyticsScope & { periods?: number } = {}) =>
  useQuery({ queryKey: ['analytics', 'ts', g, scope], queryFn: () => analyticsService.timeseries(g, scope), placeholderData: keepPreviousData });
export const useByDisease = (scope: AnalyticsScope = {}) =>
  useQuery({ queryKey: ['analytics', 'disease', scope], queryFn: () => analyticsService.byDisease(scope), placeholderData: keepPreviousData });
export const useByLocation = (level: 'village' | 'ward', scope: AnalyticsScope = {}) =>
  useQuery({ queryKey: ['analytics', 'location', level, scope], queryFn: () => analyticsService.byLocation(level, scope), placeholderData: keepPreviousData });
export const useMatrix = (scope: { days?: number; wardId?: string } = {}) =>
  useQuery({ queryKey: ['analytics', 'matrix', scope], queryFn: () => analyticsService.matrix(scope), placeholderData: keepPreviousData, refetchInterval: LIVE_INTERVAL });
export const usePerformance =(scope: AnalyticsScope = {}) =>
  useQuery({ queryKey: ['analytics', 'performance', scope], queryFn: () => analyticsService.performance(scope), placeholderData: keepPreviousData });
export const useAdminSummary = (enabled = true) =>
  useQuery({ queryKey: ['analytics', 'admin'], queryFn: analyticsService.adminSummary, refetchInterval: LIVE_INTERVAL, enabled });

// ---------- Alerts ----------
export const useAlerts = () => useQuery({ queryKey: ['alerts'], queryFn: alertService.list, refetchInterval: LIVE_INTERVAL });

// ---------- Notifications ----------
export const useNotifications = () =>
  useQuery({ queryKey: ['notifications'], queryFn: notificationService.list, refetchInterval: 15_000 });

export function useMarkNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | 'all') => (id === 'all' ? notificationService.markAllRead() : notificationService.markRead(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// ---------- Admin ----------
export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: userService.list });
export const useSettings = () => useQuery({ queryKey: ['settings', 'full'], queryFn: settingsService.get });
export const useNotificationRules = () => useQuery({ queryKey: ['settings', 'rules'], queryFn: notificationService.rules });
export const useSmsLog = (q: Parameters<typeof smsService.list>[0]) =>
  useQuery({ queryKey: ['sms', 'log', q], queryFn: () => smsService.list(q), placeholderData: keepPreviousData, refetchInterval: LIVE_INTERVAL });
export const useAuditLogs = (q: Parameters<typeof auditService.list>[0]) =>
  useQuery({ queryKey: ['audit', q], queryFn: () => auditService.list(q), placeholderData: keepPreviousData });
export const useExportHistory = () => useQuery({ queryKey: ['exports'], queryFn: exportService.history });
