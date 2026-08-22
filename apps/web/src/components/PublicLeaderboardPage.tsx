'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { levelProgress } from '@discord-bot-dashboard/shared';

// Rouge = couleur principale du serveur, utilisée partout hors podium.
// Répétée en dur dans une classe Tailwind (group-hover:bg-[#ED424533] plus
// bas) car les valeurs arbitraires doivent être statiquement lisibles dans
// le code — à garder synchronisée si cette couleur change.
const ACCENT = '#ED4245';

// Nombre de lignes affichées à la fois — "Charger plus" en révèle une
// tranche de plus depuis la liste déjà en mémoire, sans requête réseau.
const PAGE_SIZE = 100;

// Contour de l'avatar (et couleur assortie du badge de rang, de l'anneau de
// niveau et du panneau de stats) : or/argent/bronze pour le podium, rouge
// pour le reste du classement.
const RANK_RING_COLORS: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
function avatarRingColor(rank: number): string {
  return RANK_RING_COLORS[rank] ?? ACCENT;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string;
  xp: number;
  level: number;
}

export interface RewardInfo {
  level: number;
  roleName: string;
  roleColor: string | null;
}

function formatXp(xp: number): string {
  if (xp >= 1000) return `${(xp / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k`;
  return String(xp);
}

// Anneau de progression avec le niveau au centre — même esprit que
// l'aperçu du dashboard (XpCurveChart), en version compacte pour une ligne
// de classement.
function LevelRing({
  level,
  progress,
  color = ACCENT,
  size = 48,
}: {
  level: number;
  progress: number;
  color?: string;
  size?: number;
}) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={size * 0.36} fontWeight={700} fill="#ffffff">
        {level}
      </text>
    </svg>
  );
}

function entryProgress(entry: LeaderboardEntry, curveStyle: string, curveMultiplier: number) {
  const { xpIntoLevel, xpForNextLevel } = levelProgress(entry.xp, entry.level, curveStyle, curveMultiplier);
  return xpForNextLevel > 0 ? xpIntoLevel / xpForNextLevel : 0;
}

export function PublicLeaderboardPage({
  guildId,
  guildName,
  guildIconUrl,
  initialEntries,
  rewards,
  curveStyle,
  curveMultiplier,
}: {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  initialEntries: LeaderboardEntry[];
  rewards: RewardInfo[];
  curveStyle: string;
  curveMultiplier: number;
}) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LeaderboardEntry[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/public/guilds/${guildId}/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((list: LeaderboardEntry[]) => {
          if (!cancelled) setSearchResults(list);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [guildId, query]);

  // Pas de recherche en cours : la liste complète est déjà en mémoire côté
  // client (voir leaderboard/[guildId]/page.tsx), "Charger plus" ne fait que
  // révéler la suite sans requête réseau. Pendant une recherche, l'API la
  // borne déjà à 20 résultats — pas de pagination à gérer dans ce cas.
  const list = searchResults ?? initialEntries.slice(0, visibleCount);
  const hasMore = !searchResults && visibleCount < initialEntries.length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        {guildIconUrl ? (
          <img src={guildIconUrl} alt="" className="h-12 w-12 rounded-full" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-lg font-bold text-white">
            {guildName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <h1 className="text-xl font-bold text-white">{guildName}</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          {/* Hors du conteneur space-y ci-dessous : même invisible (lg:hidden),
              cet élément resterait compté dans l'espacement entre lignes et
              décalerait la première ligne par rapport à la recherche de droite. */}
          <div className="relative mb-2 lg:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher"
              className="input pl-9"
            />
          </div>

          <div className="space-y-3">
            {list.length === 0 && <p className="text-sm text-gray-500">Aucun membre à afficher.</p>}

            {list.map((entry) => {
            const progress = levelProgress(entry.xp, entry.level, curveStyle, curveMultiplier);
            const ringColor = avatarRingColor(entry.rank);
            return (
              <div
                key={entry.userId}
                className="card group flex h-20 w-full items-center gap-4 p-3 transition hover:border-[var(--accent)]"
              >
                <div className="relative shrink-0">
                  <img
                    src={entry.avatarUrl}
                    alt=""
                    className="h-14 w-14 rounded-full bg-[#2b2d31] object-cover"
                    style={{ boxShadow: `0 0 0 3px ${ringColor}` }}
                  />
                  <span
                    className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-[var(--background)]"
                    style={{ backgroundColor: ringColor }}
                  >
                    {entry.rank}
                  </span>
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{entry.username}</span>
                {/* Un seul bloc : le fond coloré n'existe pas par défaut (juste
                    l'anneau, à nu) et apparaît au survol de la ligne pour
                    envelopper à la fois l'anneau et les stats qui se déplient
                    vers la gauche — pas deux éléments séparés flottants. */}
                <div className="flex shrink-0 items-center gap-4 rounded-full py-1 pl-1 pr-1 transition-all duration-300 ease-out group-hover:bg-[#ED424533] group-hover:pl-4">
                  <div className="max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:max-w-[280px] group-hover:opacity-100">
                    <div className="flex items-center gap-4 whitespace-nowrap">
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{formatXp(entry.xp)}</p>
                        <p className="text-[10px] uppercase tracking-wide text-white/70">Total</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{formatXp(progress.xpIntoLevel)}</p>
                        <p className="text-[10px] uppercase tracking-wide text-white/70">Actuel</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">
                          {formatXp(Math.max(0, progress.xpForNextLevel - progress.xpIntoLevel))}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-white/70">Prochain</p>
                      </div>
                    </div>
                  </div>
                  <LevelRing level={entry.level} progress={entryProgress(entry, curveStyle, curveMultiplier)} size={56} />
                </div>
              </div>
            );
          })}
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="btn-secondary mt-3 w-full text-sm"
            >
              Charger plus
            </button>
          )}
        </div>

        <div className="space-y-6">
          <div className="relative hidden lg:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher"
              className="input pl-9"
            />
          </div>

          {rewards.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-white">Récompenses</h2>
              {rewards.map((reward) => (
                <div key={reward.level} className="card flex items-center gap-3 p-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {reward.level}
                  </span>
                  <span className="truncate text-sm text-gray-200">
                    Rôle{' '}
                    <span style={reward.roleColor ? { color: reward.roleColor } : undefined}>{reward.roleName}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
