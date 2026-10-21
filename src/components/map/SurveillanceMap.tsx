import { useMemo, type KeyboardEvent } from 'react';
import type { Village, Ward } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Map provider boundary.
 *
 * This schematic SVG map draws villages from their real latitude/longitude, so
 * a tile-based provider (Leaflet + OpenStreetMap, Mapbox, Google Maps) can
 * replace it later by implementing the same props. Pages never depend on how
 * the map is drawn.
 */
export type MarkerSeverity = 'outbreak' | 'hotspot' | 'active' | 'none';

export interface MapMarker {
  village: Village;
  count: number;
  severity: MarkerSeverity;
}

export interface SurveillanceMapProps {
  wards: Ward[];
  markers: MapMarker[];
  selectedId?: string | null;
  onSelect?: (villageId: string) => void;
  height?: number;
}

export const SEVERITY_STYLE: Record<MarkerSeverity, { fill: string; label: string; description: string }> = {
  outbreak: { fill: '#d03b3b', label: 'Potential outbreak', description: 'Alert threshold reached, requires verification' },
  hotspot: { fill: '#ec835a', label: 'Potential hotspot', description: 'Reports clustering, monitor and review' },
  active: { fill: '#2a78d6', label: 'Reports received', description: 'Suspected reports in period' },
  none: { fill: '#c3c2b7', label: 'No reports', description: 'No reports in period' },
};

type Pt = [number, number];

function hull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function SurveillanceMap({ wards, markers, selectedId, onSelect, height = 560 }: SurveillanceMapProps) {
  const W = 640;
  const { project, H } = useMemo(() => {
    const lats = markers.map((m) => m.village.lat);
    const lngs = markers.map((m) => m.village.lng);
    const pad = 0.09;
    const minLat = Math.min(...lats) - pad;
    const maxLat = Math.max(...lats) + pad;
    const minLng = Math.min(...lngs) - pad;
    const maxLng = Math.max(...lngs) + pad;
    const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const spanX = (maxLng - minLng) * kx;
    const spanY = maxLat - minLat;
    const h = Math.round((W * spanY) / spanX);
    return {
      H: h,
      project: (lat: number, lng: number): Pt => [((lng - minLng) * kx * W) / spanX, ((maxLat - lat) * h) / spanY],
    };
  }, [markers]);

  if (!markers.length) return null;
  const all = markers.map((m) => project(m.village.lat, m.village.lng));
  const outline = hull(all);
  const maxCount = Math.max(1, ...markers.map((m) => m.count));
  const radius = (n: number) => (n === 0 ? 6 : 8 + Math.sqrt(n / maxCount) * 20);

  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(id);
    }
  };

  return (
    <svg viewBox={`-40 -40 ${W + 80} ${H + 80}`} className="w-full" style={{ maxHeight: height }} role="group" aria-label="Map of Mandera South villages with report counts">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e1e0d9" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect x={-40} y={-40} width={W + 80} height={H + 80} fill="url(#grid)" rx={12} />

      {/* Constituency boundary (approximate) */}
      <polygon
        points={outline.map((p) => p.join(',')).join(' ')}
        fill="#eef6f5"
        stroke="#acd6d1"
        strokeWidth={110}
        strokeLinejoin="round"
        opacity={0.9}
      />
      <polygon points={outline.map((p) => p.join(',')).join(' ')} fill="#eef6f5" stroke="none" />

      {/* Ward areas */}
      {wards.map((w) => {
        const pts = markers.filter((m) => m.village.wardId === w.id).map((m) => project(m.village.lat, m.village.lng));
        if (!pts.length) return null;
        const h = hull(pts);
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        // Put the label above or below the ward, whichever is further from other villages.
        const candidates = [Math.min(...pts.map((p) => p[1])) - 34, Math.max(...pts.map((p) => p[1])) + 40];
        const clearance = (y: number) => Math.min(...all.map(([px, py]) => Math.hypot((px - cx) / 2.5, py - y)));
        const cy = clearance(candidates[0]) >= clearance(candidates[1]) ? candidates[0] : candidates[1];
        return (
          <g key={w.id}>
            <polygon
              points={h.map((p) => p.join(',')).join(' ')}
              fill="#d5ebe8"
              stroke="#d5ebe8"
              strokeWidth={56}
              strokeLinejoin="round"
              opacity={0.75}
            />
            <text x={cx} y={cy} textAnchor="middle" className="fill-brand-800" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', paintOrder: 'stroke', stroke: '#eef6f5', strokeWidth: 4 }}>
              {w.name}
            </text>
          </g>
        );
      })}

      {/* Village markers (smaller drawn last so they stay clickable) */}
      {[...markers]
        .sort((a, b) => b.count - a.count)
        .map((m) => {
          const [x, y] = project(m.village.lat, m.village.lng);
          const r = radius(m.count);
          const style = SEVERITY_STYLE[m.severity];
          const selected = selectedId === m.village.id;
          return (
            <g
              key={m.village.id}
              transform={`translate(${x},${y})`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${m.village.name}: ${m.count} reports, ${style.label}`}
              onClick={() => onSelect?.(m.village.id)}
              onKeyDown={(e) => onKey(e, m.village.id)}
              className="cursor-pointer outline-none [&:focus-visible>circle.ring]:stroke-brand-700"
            >
              {m.severity === 'outbreak' && (
                <circle r={r} fill={style.fill} opacity={0.35} className="animate-pulse-ring" style={{ transformOrigin: 'center', transformBox: 'fill-box' }} />
              )}
              <circle className="ring" r={r + 3} fill="none" stroke={selected ? '#1d554f' : 'transparent'} strokeWidth={3} />
              <circle r={r} fill={style.fill} fillOpacity={m.severity === 'none' ? 0.7 : 0.88} stroke="#fff" strokeWidth={2} />
              {m.count > 0 && (
                <text textAnchor="middle" dy="0.35em" fill="#fff" style={{ fontSize: r > 14 ? 12 : 10, fontWeight: 700 }}>
                  {m.count}
                </text>
              )}
              <text
                y={r + 14}
                textAnchor="middle"
                className={cn(selected ? 'fill-ink' : 'fill-ink-soft')}
                style={{ fontSize: 11, fontWeight: selected ? 700 : 500, paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}
              >
                {m.village.name}
              </text>
            </g>
          );
        })}

      {/* North arrow */}
      <g transform={`translate(${W + 10}, -10)`} aria-hidden>
        <path d="M0 -14 L7 6 L0 2 L-7 6 Z" fill="#475553" />
        <text y={20} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700 }} className="fill-ink-soft">
          N
        </text>
      </g>
    </svg>
  );
}

export function MapLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-soft" aria-label="Map legend">
      {(Object.keys(SEVERITY_STYLE) as MarkerSeverity[]).map((k) => (
        <li key={k} className="flex items-center gap-2" title={SEVERITY_STYLE[k].description}>
          <span className="relative flex h-3.5 w-3.5 items-center justify-center">
            {k === 'outbreak' && <span className="absolute inset-0 animate-pulse-ring rounded-full" style={{ background: SEVERITY_STYLE[k].fill }} />}
            <span className="relative h-3.5 w-3.5 rounded-full ring-2 ring-white" style={{ background: SEVERITY_STYLE[k].fill }} />
          </span>
          {SEVERITY_STYLE[k].label}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span className="flex items-end gap-0.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          <span className="h-3 w-3 rounded-full bg-slate-400" />
          <span className="h-4 w-4 rounded-full bg-slate-400" />
        </span>
        Circle size = number of reports
      </li>
    </ul>
  );
}
