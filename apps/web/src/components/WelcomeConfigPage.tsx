'use client';
import { useState, useEffect } from 'react';
import { WelcomePreview } from '@/components/WelcomePreview';
import { Toggle, InputField } from '@/components/ConfigForm';
import { ChannelSelect, type Channel } from '@/components/ChannelSelect';
import { MessageEditor } from '@/components/MessageEditor';

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
}

export function WelcomeConfigPage({ guildId, config }: { guildId: string; config: WelcomeConfig }) {
  const [data, setData] = useState(config);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guilds/${guildId}/channels`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Channel[]) => {
        if (!cancelled) setChannels(list);
      })
      .catch(() => {
        if (!cancelled) setChannels([]);
      })
      .finally(() => {
        if (!cancelled) setChannelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

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

        <ChannelSelect
          label="Salon de bienvenue"
          channels={channels}
          value={data.channelId ?? ''}
          onChange={(v) => update('channelId', v)}
          loading={channelsLoading}
        />
        <ChannelSelect
          label="Salon d'au revoir"
          channels={channels}
          value={data.goodbyeChannelId ?? ''}
          onChange={(v) => update('goodbyeChannelId', v)}
          loading={channelsLoading}
        />

        <Toggle label="Utiliser un embed" checked={data.useEmbed} onChange={(v) => update('useEmbed', v)} />

        {data.useEmbed ? (
          <>
            <InputField label="Titre de l'embed" value={data.embedTitle ?? ''} onChange={(v) => update('embedTitle', v)} />
            <MessageEditor
              label="Description"
              value={data.embedDescription}
              onChange={(v) => update('embedDescription', v)}
              channels={channels}
            />
            <InputField label="Couleur" value={data.embedColor} onChange={(v) => update('embedColor', v)} type="color" />
            <MessageEditor
              label="Pied de page"
              value={data.embedFooter ?? ''}
              onChange={(v) => update('embedFooter', v)}
              channels={channels}
              rows={2}
            />
            <Toggle label="Miniature utilisateur" checked={data.embedThumbnail} onChange={(v) => update('embedThumbnail', v)} />
          </>
        ) : (
          <MessageEditor
            label="Message de bienvenue"
            value={data.welcomeMessage}
            onChange={(v) => update('welcomeMessage', v)}
            channels={channels}
          />
        )}

        <MessageEditor
          label="Message d'au revoir"
          value={data.goodbyeMessage}
          onChange={(v) => update('goodbyeMessage', v)}
          channels={channels}
        />

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
        channels={channels}
      />
    </div>
  );
}