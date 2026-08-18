'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { levelForXp, levelProgress } from '@discord-bot-dashboard/shared';

const ACCENT = '#f0a020';

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
function LevelRing({ level, progress, size = 48 }: { level: number; progress: number; size?: number }) {
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
        stroke={ACCENT}
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
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);

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

  const list = searchResults ?? initialEntries;

  const selectedProgress = useMemo(() => {
    if (!selected) return null;
    return levelProgress(selected.xp, selected.level, curveStyle, curveMultiplier);
  }, [selected, curveStyle, curveMultiplier]);

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
        <div className="space-y-3">
          <div className="relative mb-2 lg:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher"
              className="input pl-9"
            />
          </div>

          {list.length === 0 && <p className="text-sm text-gray-500">Aucun membre à afficher.</p>}

          {list.map((entry) => (
            <button
              key={entry.userId}
              type="button"
              onClick={() => setSelected(entry)}
              className={`card flex w-full items-center gap-4 p-3 text-left transition hover:border-[var(--accent)] ${
                selected?.userId === entry.userId ? 'border-[var(--accent)]' : ''
              }`}
            >
              <div className="relative shrink-0">
                <img src={entry.avatarUrl} alt="" className="h-11 w-11 rounded-full" />
                <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#1a1d23] text-[10px] font-bold text-white ring-2 ring-[var(--background)]">
                  {entry.rank}
                </span>
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{entry.username}</span>
              <LevelRing level={entry.level} progress={entryProgress(entry, curveStyle, curveMultiplier)} />
            </button>
          ))}
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

          {selected && selectedProgress ? (
            <div className="card space-y-4 p-4">
              <div className="relative w-fit">
                <img src={selected.avatarUrl} alt="" className="h-16 w-16 rounded-full" />
                <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#1a1d23] text-xs font-bold text-white ring-2 ring-[var(--background)]">
                  {selected.rank}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-base font-bold text-white">{formatXp(selected.xp)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Total</p>
                </div>
                <div>
                  <p className="text-base font-bold text-white">{formatXp(selectedProgress.xpIntoLevel)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Actuel</p>
                </div>
                <div>
                  <p className="text-base font-bold text-white">{formatXp(selectedProgress.xpForNextLevel)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Prochain</p>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (selectedProgress.xpIntoLevel / Math.max(1, selectedProgress.xpForNextLevel)) * 100)}%`,
                    backgroundColor: ACCENT,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="card p-4 text-sm text-gray-500">Cliquez sur un membre pour voir son profil.</div>
          )}

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
