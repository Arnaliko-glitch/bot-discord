'use client';

import { useRef, useState } from 'react';

const WIDTH = 552;
const HEIGHT = 300;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 60 };
const CHART_LEVELS = 50; // Plage affichée dans l'aperçu, indépendante du "niveau maximum" réel.
const CURVE_COLOR = '#cd6e57';

// Formule d'xp cumulé nécessaire pour atteindre un niveau donné — même
// principe que la plupart des bots de niveaux (croissance quadratique pour
// le style "exponentiel", linéaire pour l'autre), pondérée par le
// multiplicateur choisi dans la popup. Le niveau 1 doit valoir pile 100 xp,
// d'où le (level - 1) : la formule est évaluée comme "xp pour passer du
// niveau n-1 au niveau n".
function xpForLevel(level: number, curveStyle: string, multiplier: number): number {
  const n = level - 1;
  const base = curveStyle === 'linear' ? 100 + 100 * n : 5 * n * n + 50 * n + 100;
  return Math.round(base * multiplier);
}

function formatXp(xp: number): string {
  if (xp >= 1000) return `${(xp / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k`;
  return String(xp);
}

const Y_MIN = 100; // xp du niveau 1 — toujours la première graduation.
const Y_STEP = 2000; // Paliers réguliers au-dessus du minimum (2k, 4k, 6k...).

// Courbe d'xp nécessaire par niveau avec curseur interactif au survol —
// reproduit le comportement (pas le code) de l'aperçu DraftBot : ligne
// verticale + point + infobulle "Niveau X / xp niveau (Total: xp cumulé)".
export function XpCurveChart({ curveStyle, multiplier }: { curveStyle: string; multiplier: number }) {
  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const points = Array.from({ length: CHART_LEVELS }, (_, i) => i + 1).map((level) => ({
    level,
    xp: xpForLevel(level, curveStyle, multiplier),
  }));
  const maxXp = points[points.length - 1].xp;
  // Dernier palier de 2000 qui dépasse le max réel — laisse la même marge
  // visuelle au-dessus de la courbe que dans l'aperçu de référence.
  const yTop = Math.ceil(maxXp / Y_STEP) * Y_STEP;
  const yTicks = [Y_MIN, ...Array.from({ length: yTop / Y_STEP }, (_, i) => (i + 1) * Y_STEP)];

  const xScale = (level: number) => ((level - 1) / (CHART_LEVELS - 1)) * innerWidth;
  const yScale = (xp: number) => innerHeight - ((xp - Y_MIN) / (yTop - Y_MIN)) * innerHeight;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.level)},${yScale(p.xp)}`).join('');

  const xTicks = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].filter((l) => l <= CHART_LEVELS);

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relativeX = ((e.clientX - rect.left) / rect.width) * WIDTH - MARGIN.left;
    const level = Math.min(CHART_LEVELS, Math.max(1, Math.round((relativeX / innerWidth) * (CHART_LEVELS - 1) + 1)));
    setHoveredLevel(level);
  }

  const hovered = hoveredLevel ? points.find((p) => p.level === hoveredLevel) : null;
  const totalXp = hovered ? points.slice(0, hovered.level).reduce((sum, p) => sum + p.xp, 0) : 0;

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block w-full" aria-hidden="true">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Grille horizontale + axe Y */}
          {yTicks.map((tick) => (
            <g key={tick} transform={`translate(0,${yScale(tick)})`}>
              <line x1={0} x2={innerWidth} stroke="rgba(255,255,255,0.08)" />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="#9ca3af">
                {formatXp(tick)}
              </text>
            </g>
          ))}

          {/* Axe X */}
          <line y1={innerHeight} y2={innerHeight} x2={innerWidth} stroke="rgba(255,255,255,0.2)" />
          {xTicks.map((tick) => (
            <text key={tick} x={xScale(tick)} y={innerHeight + 18} textAnchor="middle" fontSize={11} fill="#9ca3af">
              {tick}
            </text>
          ))}
          <text
            x={innerWidth / 2}
            y={innerHeight + 34}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill={CURVE_COLOR}
          >
            Niveau
          </text>
          <text
            x={-innerHeight / 2}
            y={-MARGIN.left + 14}
            transform="rotate(-90)"
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill={CURVE_COLOR}
          >
            Expérience
          </text>

          {/* Courbe */}
          <path d={linePath} fill="none" stroke={CURVE_COLOR} strokeWidth={3} />

          {/* Curseur au survol */}
          {hovered && (
            <>
              <line
                x1={xScale(hovered.level)}
                x2={xScale(hovered.level)}
                y1={0}
                y2={innerHeight}
                stroke="rgba(255,255,255,0.3)"
              />
              <circle cx={xScale(hovered.level)} cy={yScale(hovered.xp)} r={4} fill={CURVE_COLOR} />
            </>
          )}

          {/* Zone interactive transparente par-dessus tout le graphique */}
          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoveredLevel(null)}
          />
        </g>
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute rounded-lg bg-[#0f1115] px-3 py-2 text-xs shadow-xl"
          style={{
            left: `${(xScale(hovered.level) + MARGIN.left) / WIDTH * 100}%`,
            top: `${(yScale(hovered.xp) + MARGIN.top) / HEIGHT * 100}%`,
            // Près du bord droit, l'infobulle centrée déborderait du
            // graphique — on ancre alors son bord droit sur le point au lieu
            // de la centrer, pour qu'elle s'étende vers la gauche.
            transform:
              xScale(hovered.level) > innerWidth * 0.75
                ? 'translate(-100%, calc(-100% - 12px))'
                : 'translate(-50%, calc(-100% - 12px))',
          }}
        >
          <p className="font-semibold text-white">Niveau {hovered.level}</p>
          <p className="text-gray-400">
            {formatXp(hovered.xp)} xp (Total : {formatXp(totalXp)} xp)
          </p>
        </div>
      )}
    </div>
  );
}
