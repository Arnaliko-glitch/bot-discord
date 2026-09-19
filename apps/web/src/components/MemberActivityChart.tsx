'use client';

import { useRef, useState } from 'react';
import { TrendingDown, TrendingUp, Users } from 'lucide-react';

export interface DailyMemberPoint {
  date: string; // "AAAA-MM-JJ"
  joins: number;
  leaves: number;
}

const PERIODS = [30, 60, 90] as const;
type Period = (typeof PERIODS)[number];

const WIDTH = 760;
const HEIGHT = 220;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 12 };
const POSITIVE_COLOR = '#57F287';
const NEGATIVE_COLOR = '#ED4245';
const NEUTRAL_COLOR = '#4b5563';

function formatShortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

function formatFullDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

// Variation nette (arrivées - départs) par jour — barres divergentes autour
// d'une ligne zéro : vert au-dessus (gain), rouge en dessous (perte), gris si
// nul. Même approche "SVG fait main + infobulle au survol" que XpCurveChart.
// `data` doit couvrir au moins la plus longue période proposée (90 jours) —
// le composant ne fait que découper les N derniers jours au survol du choix.
export function MemberActivityChart({ memberCount, data }: { memberCount: number; data: DailyMemberPoint[] }) {
  const [period, setPeriod] = useState<Period>(30);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const points = data.slice(-period);
  const netTotal = points.reduce((sum, d) => sum + d.joins - d.leaves, 0);

  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const zeroY = MARGIN.top + innerHeight / 2;

  const nets = points.map((d) => d.joins - d.leaves);
  const maxAbs = Math.max(1, ...nets.map((n) => Math.abs(n)));
  const halfHeight = innerHeight / 2 - 4; // 4px de marge pour ne jamais toucher les bords.

  const gap = points.length > 45 ? 1.5 : 3;
  const barWidth = Math.max(1, innerWidth / points.length - gap);

  function xFor(i: number) {
    return MARGIN.left + i * (innerWidth / points.length) + gap / 2;
  }

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relativeX = ((e.clientX - rect.left) / rect.width) * WIDTH - MARGIN.left;
    const i = Math.min(points.length - 1, Math.max(0, Math.floor(relativeX / (innerWidth / points.length))));
    setHoveredIndex(i);
  }

  // ~6 étiquettes réparties sur toute la période plutôt qu'une par jour,
  // sinon illisible au-delà d'une poignée de points.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  const hovered = hoveredIndex !== null ? points[hoveredIndex] : null;
  const hoveredNet = hovered ? hovered.joins - hovered.leaves : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Membre total</p>
            <p className="text-xl font-bold text-white">{memberCount.toLocaleString('fr-FR')}</p>
          </div>
        </div>

        <div className="card flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              netTotal >= 0 ? 'bg-[#57F287]/15 text-[#57F287]' : 'bg-[#ED4245]/15 text-[#ED4245]'
            }`}
          >
            {netTotal >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Variation ({period} jours)</p>
            <p className={`text-xl font-bold ${netTotal > 0 ? 'text-[#57F287]' : netTotal < 0 ? 'text-[#ED4245]' : 'text-white'}`}>
              {netTotal > 0 ? `+${netTotal}` : netTotal}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Arrivées et départs — {period} derniers jours</h2>
          <p className="text-xs text-gray-500">Variation nette par jour (arrivées moins départs) · Heure de Paris</p>
        </div>
        <div className="flex rounded-lg border border-white/10 p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPeriod(p);
                setHoveredIndex(null);
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                period === p ? 'bg-[var(--accent)] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {p}j
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative" onMouseMove={handleMove} onMouseLeave={() => setHoveredIndex(null)}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block w-full" aria-hidden="true">
          <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.15)" />

          {points.map((d, i) => {
            const net = d.joins - d.leaves;
            const barHeight = (Math.abs(net) / maxAbs) * halfHeight;
            const color = net > 0 ? POSITIVE_COLOR : net < 0 ? NEGATIVE_COLOR : NEUTRAL_COLOR;
            const y = net >= 0 ? zeroY - barHeight : zeroY;
            const h = Math.max(barHeight, net === 0 ? 2 : 0);
            return (
              <rect
                key={d.date}
                x={xFor(i)}
                y={y}
                width={barWidth}
                height={h}
                rx={Math.min(2, barWidth / 2)}
                fill={color}
                opacity={hoveredIndex === null || hoveredIndex === i ? 1 : 0.45}
              />
            );
          })}

          {points.map((d, i) =>
            i % labelStep === 0 ? (
              <text key={d.date} x={xFor(i) + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="#9ca3af">
                {formatShortDate(d.date)}
              </text>
            ) : null
          )}
        </svg>

        {hovered && hoveredIndex !== null && (
          <div
            className="pointer-events-none absolute rounded-lg bg-[#0f1115] px-3 py-2 text-xs shadow-xl"
            style={{
              left: `${((xFor(hoveredIndex) + barWidth / 2) / WIDTH) * 100}%`,
              top: `${(zeroY / HEIGHT) * 100}%`,
              transform:
                hoveredIndex > points.length * 0.75
                  ? 'translate(-100%, calc(-100% - 14px))'
                  : 'translate(-50%, calc(-100% - 14px))',
            }}
          >
            <p className="font-semibold text-white">{formatFullDate(hovered.date)}</p>
            <p className="text-gray-400">
              <span style={{ color: POSITIVE_COLOR }}>+{hovered.joins}</span>
              {' · '}
              <span style={{ color: NEGATIVE_COLOR }}>-{hovered.leaves}</span>
              {' · net '}
              <span
                className="font-semibold"
                style={{ color: hoveredNet > 0 ? POSITIVE_COLOR : hoveredNet < 0 ? NEGATIVE_COLOR : '#ffffff' }}
              >
                {hoveredNet > 0 ? `+${hoveredNet}` : hoveredNet}
              </span>
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
