import { colors } from '../app/ui.js';

/** Smooth a polyline into a Catmull-Rom→bezier path so the curve reads like the design. */
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return '';
  const first = points[0]!;
  let d = `M ${first[0]} ${first[1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function niceMax(value: number): number {
  if (value <= 0) return 8;
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / step) * step;
}

function fmt(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}K`.replace('.0K', 'K') : `${n}`;
}

/**
 * Responsive area chart — a smooth violet→pink curve over a faint grid, matching
 * the "Accounts Reached" panel in the reference design.
 */
export function AreaChart({
  data,
  xLabels,
  height = 220,
}: {
  data: number[];
  xLabels: string[];
  height?: number;
}) {
  const w = 640;
  const h = height;
  const top = 12;
  const bottom = h - 12;
  const max = niceMax(Math.max(1, ...data));
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const points = data.map((v, i) => [i * stepX, y(v)] as [number, number]);
  const line = smoothPath(points);
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {/* Y axis */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column-reverse',
          justifyContent: 'space-between',
          fontSize: 12,
          color: colors.textFaint,
          paddingBottom: 24,
        }}
      >
        {ticks.map((t) => (
          <span key={t}>{fmt(t)}</span>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height, display: 'block' }}
        >
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.pink} stopOpacity="0.35" />
              <stop offset="100%" stopColor={colors.pink} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="areaStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={colors.accent} />
              <stop offset="100%" stopColor={colors.pink} />
            </linearGradient>
          </defs>

          {/* horizontal grid lines */}
          {ticks.map((t) => (
            <line
              key={t}
              x1="0"
              x2={w}
              y1={y(t)}
              y2={y(t)}
              stroke={colors.border}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill="url(#areaFill)" />
          <path
            d={line}
            fill="none"
            stroke="url(#areaStroke)"
            strokeWidth="3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* X axis */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: colors.textFaint, marginTop: 8 }}>
          {xLabels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
