'use client';

import { useState } from 'react';
import { WelcomePreview } from '@/components/WelcomePreview';
import { Toggle, InputField, TextAreaField } from '@/components/ConfigForm';

interface WelcomeConfig {
  enabled: boolean;
  channelId: string;
  goodbyeChannelId: string;
  welcomeMessage: string;
  goodbyeMessage: string;
  useEmbed: boolean;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  embedThumbnail: boolean;
  embedFooter: string;
  dmWelcome: boolean;
  goodbyeUseEmbed: boolean;
  goodbyeEmbedTitle: string;
  goodbyeEmbedDescription: string;
  goodbyeEmbedColor: string;
  goodbyeEmbedThumbnail: boolean;
  goodbyeEmbedFooter: string;
}

export function WelcomeConfigPage({ guildId, config }: { guildId: string; config: WelcomeConfig }) {
  const [data, setData] = useState(config);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/guilds/${guildId}/welcome`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setMessage(res.ok ? '✅ Enregistré' : '❌ Erreur');
    setSaving(false);
  }

  const update = <K extends keyof WelcomeConfig>(key: K, value: WelcomeConfig[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4">
        <Toggle label="Activer les messages de bienvenue" checked={data.enabled} onChange={(v) => update('enabled', v)} />
        <InputField label="Salon de bienvenue (ID)" value={data.channelId ?? ''} onChange={(v) => update('channelId', v)} placeholder="123456789012345678" />
        <InputField label="Salon d'au revoir (ID)" value={data.goodbyeChannelId ?? ''} onChange={(v) => update('goodbyeChannelId', v)} />
        <Toggle label="Utiliser un embed" checked={data.useEmbed} onChange={(v) => update('useEmbed', v)} />
        {data.useEmbed ? (
          <>
            <InputField label="Titre de l'embed" value={data.embedTitle ?? ''} onChange={(v) => update('embedTitle', v)} />
            <TextAreaField label="Description" value={data.embedDescription} onChange={(v) => update('embedDescription', v)} />
            <InputField label="Couleur" value={data.embedColor} onChange={(v) => update('embedColor', v)} type="color" />
            <InputField label="Pied de page" value={data.embedFooter ?? ''} onChange={(v) => update('embedFooter', v)} />
            <Toggle label="Miniature utilisateur" checked={data.embedThumbnail} onChange={(v) => update('embedThumbnail', v)} />
          </>
        ) : (
          <TextAreaField label="Message de bienvenue" value={data.welcomeMessage} onChange={(v) => update('welcomeMessage', v)} />
        )}
        <Toggle label="Utiliser un embed pour l'au revoir" checked={data.goodbyeUseEmbed} onChange={(v) => update('goodbyeUseEmbed', v)} />
        {data.goodbyeUseEmbed ? (
          <>
            <InputField label="Titre de l'embed d'au revoir" value={data.goodbyeEmbedTitle ?? ''} onChange={(v) => update('goodbyeEmbedTitle', v)} />
            <TextAreaField label="Description d'au revoir" value={data.goodbyeEmbedDescription} onChange={(v) => update('goodbyeEmbedDescription', v)} />
            <InputField label="Couleur d'au revoir" value={data.goodbyeEmbedColor} onChange={(v) => update('goodbyeEmbedColor', v)} type="color" />
            <InputField label="Pied de page d'au revoir" value={data.goodbyeEmbedFooter ?? ''} onChange={(v) => update('goodbyeEmbedFooter', v)} />
            <Toggle label="Miniature utilisateur (au revoir)" checked={data.goodbyeEmbedThumbnail} onChange={(v) => update('goodbyeEmbedThumbnail', v)} />
          </>
        ) : (
          <TextAreaField label="Message d'au revoir" value={data.goodbyeMessage} onChange={(v) => update('goodbyeMessage', v)} />
        )}
        <Toggle label="MP de bienvenue" checked={data.dmWelcome} onChange={(v) => update('dmWelcome', v)} />
        <button onClick={save} className="btn-primary" disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {message && <p className="text-sm">{message}</p>}
      </div>
      <WelcomePreview
        title={data.embedTitle}
        description={data.useEmbed ? data.embedDescription : data.welcomeMessage}
        color={data.embedColor}
        footer={data.embedFooter}
        thumbnail={data.embedThumbnail}
      />
    </div>
  );
}
