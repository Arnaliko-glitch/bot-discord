'use client';

import { useState } from 'react';
import { Toggle, InputField, TextAreaField } from '@/components/ConfigForm';
import { xpProgress } from '@discord-bot-dashboard/shared';

interface XpConfig {
  enabled: boolean;
  xpMin: number;
  xpMax: number;
  cooldownSeconds: number;
  levelUpChannelId: string;
  levelUpMessage: string;
  announceLevelUp: boolean;
  stackRoles: boolean;
}

export function XpConfigPage({ guildId, config }: { guildId: string; config: XpConfig }) {
  const [data, setData] = useState(config);
  const [previewXp, setPreviewXp] = useState(450);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const progress = xpProgress(previewXp);
  const update = <K extends keyof XpConfig>(key: K, value: XpConfig[K]) => setData((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/guilds/${guildId}/xp`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setMessage(res.ok ? '✅ Enregistré' : '❌ Erreur');
    setSaving(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4">
        <Toggle label="Activer le système XP" checked={data.enabled} onChange={(v) => update('enabled', v)} />
        <div className="grid grid-cols-2 gap-4">
          <InputField label="XP min" value={data.xpMin} onChange={(v) => update('xpMin', Number(v))} type="number" />
          <InputField label="XP max" value={data.xpMax} onChange={(v) => update('xpMax', Number(v))} type="number" />
        </div>
        <InputField label="Cooldown (secondes)" value={data.cooldownSeconds} onChange={(v) => update('cooldownSeconds', Number(v))} type="number" />
        <InputField label="Salon annonces level-up (ID)" value={data.levelUpChannelId} onChange={(v) => update('levelUpChannelId', v)} />
        <TextAreaField label="Message level-up" value={data.levelUpMessage} onChange={(v) => update('levelUpMessage', v)} />
        <Toggle label="Annoncer les montées de niveau" checked={data.announceLevelUp} onChange={(v) => update('announceLevelUp', v)} />
        <Toggle label="Empiler les rôles par niveau" checked={data.stackRoles} onChange={(v) => update('stackRoles', v)} />
        <button onClick={save} className="btn-primary" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
        {message && <p className="text-sm">{message}</p>}
      </div>
      <div className="card">
        <h3 className="mb-4 font-semibold">Simulateur de niveau</h3>
        <InputField label="XP de test" value={previewXp} onChange={(v) => setPreviewXp(Number(v))} type="number" />
        <div className="mt-4">
          <div className="mb-2 flex justify-between text-sm">
            <span>Niveau {progress.level}</span>
            <span>{progress.current}/{progress.needed} XP</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-700">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
