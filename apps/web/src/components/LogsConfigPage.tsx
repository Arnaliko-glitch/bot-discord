'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChannelSelect, type Channel } from '@/components/ChannelSelect';
import { StatsChannelsSection } from '@/components/StatsChannelsSection';
import { useUnsavedChanges } from '@/lib/unsaved-changes-context';

export interface LogsConfigData {
  tagChannelId: string | null;
  tagLogAdded: boolean;
  tagLogRemoved: boolean;
}

const DEFAULT_CONFIG: LogsConfigData = {
  tagChannelId: null,
  tagLogAdded: true,
  tagLogRemoved: true,
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-[var(--accent)]' : 'bg-gray-600'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// Une seule catégorie de logs pour l'instant (tag du serveur) — pensé pour
// que d'autres catégories s'ajoutent plus tard sans changer la disposition :
// un salon par catégorie à gauche, le détail des événements à droite.
export function LogsConfigPage({
  guildId,
  initial,
}: {
  guildId: string;
  initial?: LogsConfigData;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<LogsConfigData>(initial ?? DEFAULT_CONFIG);
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(initial ?? DEFAULT_CONFIG));
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`/api/guilds/${guildId}/channels`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setChannels)
      .catch(() => setChannels([]))
      .finally(() => setChannelsLoading(false));
  }, [guildId]);

  const isDirty = JSON.stringify(config) !== lastSaved;

  const { setDirty } = useUnsavedChanges();
  useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  function update<K extends keyof LogsConfigData>(key: K, value: LogsConfigData[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/guilds/${guildId}/logs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      setLastSaved(JSON.stringify(config));
      setMessage('✅ Enregistré');
      router.refresh();
    } else {
      setMessage("❌ Erreur lors de l'enregistrement");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white">Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Choisissez dans quel salon envoyer les journaux d&apos;événements du bot, catégorie par catégorie.
        </p>
      </div>

      <StatsChannelsSection guildId={guildId} />

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-white">Salons de logs</h2>
          <div className="space-y-1.5">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Tag du serveur
            </span>
            <ChannelSelect
              label=""
              channels={channels}
              value={config.tagChannelId ?? ''}
              onChange={(v) => update('tagChannelId', v || null)}
              loading={channelsLoading}
            />
          </div>
        </div>

        <div className="card space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Tag du serveur</h2>
            <p className="text-xs text-gray-500">Événements à envoyer dans le salon choisi à gauche.</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-300">Ajoute le tag</span>
            <Toggle checked={config.tagLogAdded} onChange={(v) => update('tagLogAdded', v)} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-300">Supprime le tag</span>
            <Toggle checked={config.tagLogRemoved} onChange={(v) => update('tagLogRemoved', v)} />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-64 right-0 flex h-[72px] items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--card)] px-8">
        {message && <p className="text-sm">{message}</p>}
        <button
          type="button"
          onClick={() => setConfig(JSON.parse(lastSaved))}
          disabled={!isDirty || saving}
          className="rounded-lg border border-white/10 bg-[#f5f0e6] px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Réinitialiser
        </button>
        <button type="button" onClick={save} disabled={!isDirty || saving} className="btn-primary disabled:opacity-50">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
