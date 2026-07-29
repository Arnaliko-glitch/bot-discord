'use client';

import { useState } from 'react';
import { Toggle, InputField, TextAreaField } from '@/components/ConfigForm';

interface TicketConfig {
  enabled: boolean;
  categoryId: string;
  supportRoleId: string;
  panelChannelId: string;
  panelMessage: string;
  ticketNameFormat: string;
  maxOpenPerUser: number;
  closeConfirmation: boolean;
  transcriptEnabled: boolean;
  transcriptChannelId: string;
  deleteOnClose: boolean;
  deleteDelaySeconds: number;
}

export function TicketConfigPage({ guildId, config }: { guildId: string; config: TicketConfig }) {
  const [data, setData] = useState(config);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof TicketConfig>(key: K, value: TicketConfig[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/guilds/${guildId}/tickets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setMessage(res.ok ? '✅ Enregistré' : '❌ Erreur');
    setSaving(false);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Toggle label="Activer le système de tickets" checked={data.enabled} onChange={(v) => update('enabled', v)} />
      <InputField label="Catégorie (ID)" value={data.categoryId} onChange={(v) => update('categoryId', v)} />
      <InputField label="Rôle support (ID)" value={data.supportRoleId} onChange={(v) => update('supportRoleId', v)} />
      <InputField label="Salon du panel (ID)" value={data.panelChannelId} onChange={(v) => update('panelChannelId', v)} />
      <TextAreaField label="Message du panel" value={data.panelMessage} onChange={(v) => update('panelMessage', v)} />
      <InputField label="Format du nom" value={data.ticketNameFormat} onChange={(v) => update('ticketNameFormat', v)} />
      <InputField label="Max tickets par utilisateur" value={data.maxOpenPerUser} onChange={(v) => update('maxOpenPerUser', Number(v))} type="number" />
      <Toggle label="Confirmation de fermeture" checked={data.closeConfirmation} onChange={(v) => update('closeConfirmation', v)} />
      <Toggle label="Transcripts activés" checked={data.transcriptEnabled} onChange={(v) => update('transcriptEnabled', v)} />
      {data.transcriptEnabled && (
        <InputField
          label="Salon d'archivage des transcripts (ID)"
          value={data.transcriptChannelId}
          onChange={(v) => update('transcriptChannelId', v)}
          placeholder="Par défaut : salon de logs"
        />
      )}
      <Toggle label="Supprimer le salon après fermeture" checked={data.deleteOnClose} onChange={(v) => update('deleteOnClose', v)} />
      {data.deleteOnClose && (
        <InputField
          label="Délai avant suppression (secondes)"
          value={data.deleteDelaySeconds}
          onChange={(v) => update('deleteDelaySeconds', Number(v))}
          type="number"
        />
      )}
      <button onClick={save} className="btn-primary" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
