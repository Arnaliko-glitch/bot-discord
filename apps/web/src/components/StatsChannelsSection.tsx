'use client';

import { useEffect, useState } from 'react';

interface StatsChannelData {
  id: string;
  channelId: string;
  statType: string;
  channelType: string;
  format: string;
}

const STAT_TYPE_LABELS: Record<string, string> = {
  membersNoBots: 'Membres (sans bots)',
  membersTotal: 'Membres (total)',
};

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  voice: 'Salon vocal',
  text: 'Salon textuel',
};

// Popup de création/édition — le type de salon n'est modifiable qu'à la
// création (Discord ne permet pas de transformer un salon vocal en salon
// textuel après coup).
function StatsChannelModal({
  existing,
  error,
  onClose,
  onSubmit,
}: {
  existing: StatsChannelData | null;
  error: string;
  onClose: () => void;
  onSubmit: (data: { statType: string; channelType: string; format: string }) => void;
}) {
  const [statType, setStatType] = useState(existing?.statType ?? 'membersNoBots');
  const [channelType, setChannelType] = useState(existing?.channelType ?? 'voice');
  const [format, setFormat] = useState(existing?.format ?? 'Membres : {count}');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1d23] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">
          {existing ? 'Modifier le' : 'Créer un'} salon de statistiques
        </h3>

        {error && <p className="mb-3 text-xs text-[#ED4245]">{error}</p>}

        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Statistique ciblée
            </span>
            <select value={statType} onChange={(e) => setStatType(e.target.value)} className="input">
              {Object.entries(STAT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Type de salon</span>
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value)}
              disabled={!!existing}
              className="input disabled:cursor-not-allowed disabled:opacity-50"
            >
              {Object.entries(CHANNEL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {existing && (
              <p className="mt-1 text-xs text-gray-500">Le type d&apos;un salon existant ne peut pas être changé.</p>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Nom du salon</span>
            <input
              value={format}
              onChange={(e) => setFormat(e.target.value.slice(0, 100))}
              placeholder="Membres : {count}"
              className="input"
            />
            <p className="mt-1 text-xs text-gray-500">{'{count}'} est remplacé par la valeur de la statistique.</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-200">
            Annuler
          </button>
          <button
            type="button"
            disabled={!format.trim()}
            onClick={() => onSubmit({ statType, channelType, format: format.trim() })}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {existing ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// CRUD indépendant du reste de la page Logs (comme les récompenses de
// niveaux) — chaque salon est créé/modifié/supprimé instantanément, le bot
// se charge lui-même du nom du salon (voir packages/bot/src/modules/statsChannels.ts).
export function StatsChannelsSection({ guildId }: { guildId: string }) {
  const [channels, setChannels] = useState<StatsChannelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'new' | StatsChannelData | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/guilds/${guildId}/stats-channels`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setChannels)
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, [guildId]);

  async function submit(data: { statType: string; channelType: string; format: string }) {
    setError('');
    const editing = modal !== 'new' ? modal : null;
    const res = await fetch(
      editing ? `/api/guilds/${guildId}/stats-channels/${editing.id}` : `/api/guilds/${guildId}/stats-channels`,
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(result.error ?? 'Erreur lors de l’enregistrement');
      return;
    }
    setChannels((list) => {
      const withoutEditing = editing ? list.filter((c) => c.id !== editing.id) : list;
      return [...withoutEditing, result as StatsChannelData];
    });
    setModal(null);
  }

  async function remove(channel: StatsChannelData) {
    if (!window.confirm(`Supprimer le salon « ${STAT_TYPE_LABELS[channel.statType] ?? channel.statType} » ?`)) return;
    setBusyId(channel.id);
    const res = await fetch(`/api/guilds/${guildId}/stats-channels/${channel.id}`, { method: 'DELETE' });
    if (res.ok) setChannels((list) => list.filter((c) => c.id !== channel.id));
    setBusyId(null);
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Salons de statistiques</h2>
          <p className="text-xs text-gray-500">Configurez des salons de statistiques sur votre serveur.</p>
        </div>
        <button type="button" onClick={() => setModal('new')} className="btn-primary shrink-0 text-sm">
          Créer un salon
        </button>
      </div>

      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        Salons de statistiques
      </span>

      {loading ? (
        <p className="rounded-lg border border-dashed border-white/10 py-6 text-center text-sm text-gray-500">
          Chargement...
        </p>
      ) : channels.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 py-6 text-center text-sm text-gray-500">
          Vous n&apos;avez aucun salon de statistiques configuré sur le serveur.
        </p>
      ) : (
        <div className="space-y-2">
          {channels.map((channel) => (
            <div key={channel.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm text-white">{STAT_TYPE_LABELS[channel.statType] ?? channel.statType}</span>
                <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-xs text-gray-300">{channel.format}</span>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setModal(channel)} className="btn-secondary text-xs">
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => remove(channel)}
                  disabled={busyId === channel.id}
                  className="rounded-lg border border-[#ED4245]/40 px-3 py-1.5 text-xs font-medium text-[#ED4245] transition hover:bg-[#ED4245]/10 disabled:opacity-50"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <StatsChannelModal
          existing={modal === 'new' ? null : modal}
          error={error}
          onClose={() => {
            setModal(null);
            setError('');
          }}
          onSubmit={submit}
        />
      )}
    </div>
  );
}
