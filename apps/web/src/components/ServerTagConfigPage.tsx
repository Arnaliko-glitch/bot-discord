'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUnsavedChanges } from '@/lib/unsaved-changes-context';

export interface ServerTagConfigData {
  enabled: boolean;
  roleId: string | null;
}

const DEFAULT_CONFIG: ServerTagConfigData = { enabled: false, roleId: null };

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

// Donne automatiquement un rôle aux membres qui affichent le tag de ce
// serveur sur leur profil Discord, et le retire dès qu'ils le retirent —
// suivi en direct côté bot, rien à faire ici hormis choisir le rôle.
export function ServerTagConfigPage({
  guildId,
  initial,
}: {
  guildId: string;
  initial?: ServerTagConfigData;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<ServerTagConfigData>(initial ?? DEFAULT_CONFIG);
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(initial ?? DEFAULT_CONFIG));
  const [roles, setRoles] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`/api/guilds/${guildId}/roles`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setRoles)
      .catch(() => setRoles([]));
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

  function update<K extends keyof ServerTagConfigData>(key: K, value: ServerTagConfigData[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/guilds/${guildId}/server-tag`, {
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
        <h1 className="text-2xl font-bold text-white">Tag du serveur</h1>
        <p className="mt-1 text-sm text-gray-500">
          Attribue automatiquement un rôle aux membres qui affichent le tag de ce serveur sur leur profil Discord — le
          rôle est retiré dès qu&apos;ils le retirent.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Activer</h2>
            <p className="text-xs text-gray-500">Rien ne se passe tant que ce module est désactivé.</p>
          </div>
          <Toggle checked={config.enabled} onChange={(v) => update('enabled', v)} />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Rôle à attribuer
          </span>
          <select value={config.roleId ?? ''} onChange={(e) => update('roleId', e.target.value || null)} className="input">
            <option value="">Veuillez sélectionner un rôle</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id} style={r.color ? { color: r.color } : undefined}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="fixed bottom-0 left-64 right-0 flex items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--card)] px-8 py-4">
        {message && <p className="text-sm">{message}</p>}
        <button
          type="button"
          onClick={() => setConfig(JSON.parse(lastSaved))}
          disabled={!isDirty || saving}
          className="rounded-lg border border-white/10 bg-[#f5f0e6] px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Réinitialiser
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || saving || (config.enabled && !config.roleId)}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
