'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Poppins } from 'next/font/google';
import { ChannelSelect, type Channel } from '@/components/ChannelSelect';
import { EmojiPickerButton } from '@/components/EmojiPickerButton';
import { MentionTextarea, renderMentionText, type RoleOption } from '@/components/MentionTextarea';
import { RoleSelect } from '@/components/RoleSelect';
import type { GuildEmoji } from '@/lib/emoji-data';
import { useUnsavedChanges } from '@/lib/unsaved-changes-context';

export interface ServerTagConfigData {
  enabled: boolean;
  roleId: string | null;
  announceChannelId: string | null;
  announceMessage: string;
}

const DEFAULT_CONFIG: ServerTagConfigData = {
  enabled: false,
  roleId: null,
  announceChannelId: null,
  announceMessage: '{user}, voici votre récompense pour avoir mis le tag du serveur ! 🏷️',
};

const ACCENT_COLOR = '#ED4245';

// Même police que les cartes de récompense générées côté bot
// (packages/bot/src/utils/celebrationCard.ts) — pour que l'aperçu
// corresponde à l'image réellement envoyée sur Discord.
const cardFont = Poppins({ subsets: ['latin'], weight: '800' });

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

// Bulle Discord + carte "Félicitations !" façon récompense de niveau — même
// principe que RewardMessagePreview dans LevelsConfigPage.tsx, mais sans
// notion de niveau ici (juste le rôle obtenu en affichant le tag).
function AnnounceMessagePreview({
  botName,
  botAvatarUrl,
  now,
  avatarUrl,
  announceMessage,
  previewUsername,
  roleName,
  roles,
  channels,
}: {
  botName: string;
  botAvatarUrl: string | null;
  now: string;
  avatarUrl: string;
  announceMessage: string;
  previewUsername: string;
  roleName: string;
  roles: RoleOption[];
  channels: Channel[];
}) {
  const contentParts = announceMessage.split('{user}');

  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-center gap-2">
        {botAvatarUrl ? (
          <img src={botAvatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
            {botName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white">{botName}</span>
          <span className="rounded bg-[var(--accent)] px-1 py-0.5 text-[9px] font-medium text-white">APP</span>
          <span className="text-xs text-gray-500">{now}</span>
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm text-[#dcddde]">
        {contentParts.map((part, i) => (
          <span key={i}>
            {renderMentionText(part, roles, channels)}
            {i < contentParts.length - 1 && <span className="text-[#00a8fc]">@{previewUsername}</span>}
          </span>
        ))}
      </p>

      <div className="flex overflow-hidden rounded">
        <div className="w-1 shrink-0" style={{ backgroundColor: ACCENT_COLOR }} />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 bg-[#2b2d31] p-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={avatarUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full"
              style={{ boxShadow: `0 0 0 2px ${ACCENT_COLOR}` }}
            />
            <div className={`min-w-0 ${cardFont.className}`}>
              <p className="text-lg font-bold text-white">Félicitations !</p>
              <p className="text-sm text-[#dcddde]">vous recevez le rôle</p>
              <p className="truncate text-sm font-bold" style={{ color: ACCENT_COLOR }}>
                {roleName}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-2xl">🎉</span>
        </div>
      </div>
    </div>
  );
}

// Donne automatiquement un rôle aux membres qui affichent le tag de ce
// serveur sur leur profil Discord, et le retire dès qu'ils le retirent —
// suivi en direct côté bot, rien à faire ici hormis choisir le rôle et,
// en option, annoncer publiquement l'obtention du rôle.
export function ServerTagConfigPage({
  guildId,
  guildName,
  guildIconUrl,
  previewAvatarUrl,
  previewUsername,
  botName,
  botAvatarUrl,
  initial,
}: {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  previewAvatarUrl: string;
  previewUsername: string;
  botName: string;
  botAvatarUrl: string | null;
  initial?: ServerTagConfigData;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<ServerTagConfigData>(initial ?? DEFAULT_CONFIG);
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(initial ?? DEFAULT_CONFIG));
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    fetch(`/api/guilds/${guildId}/roles`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setRoles)
      .catch(() => setRoles([]));
    fetch(`/api/guilds/${guildId}/channels`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setChannels)
      .catch(() => setChannels([]))
      .finally(() => setChannelsLoading(false));
    fetch(`/api/guilds/${guildId}/emojis`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setGuildEmojis)
      .catch(() => setGuildEmojis([]));
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tag du serveur</h1>
          <p className="text-sm text-gray-500">
            Attribue automatiquement un rôle aux membres qui affichent le tag de ce serveur sur leur profil Discord — le
            rôle est retiré dès qu&apos;ils le retirent.
          </p>
        </div>
        <Toggle checked={config.enabled} onChange={(v) => update('enabled', v)} />
      </div>

      <div className="card space-y-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Rôle à attribuer
          </span>
          <RoleSelect
            label=""
            roles={roles}
            value={config.roleId ?? ''}
            onChange={(v) => update('roleId', v || null)}
            placeholder="Veuillez sélectionner un rôle"
          />
        </div>
      </div>

      <section className="space-y-4 border-t border-[var(--border)] pt-8">
        <div>
          <h2 className="font-semibold text-white">Annonce du rôle obtenu</h2>
          <p className="text-sm text-gray-500">
            Annonce publiquement l&apos;obtention du rôle quand un membre affiche le tag du serveur.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Salon d&apos;annonce
              </span>
              <ChannelSelect
                label=""
                channels={channels}
                value={config.announceChannelId ?? ''}
                onChange={(v) => update('announceChannelId', v || null)}
                loading={channelsLoading}
              />
              <p className="mt-1 text-xs text-gray-500">Laissez vide pour désactiver l&apos;annonce.</p>
            </div>

            {config.announceChannelId && (
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Message personnalisé
                </span>
                <div className="relative">
                  <MentionTextarea
                    value={config.announceMessage}
                    onChange={(v) => update('announceMessage', v)}
                    roles={roles}
                    channels={channels}
                    rows={4}
                    maxLength={1000}
                    className="input resize-none pr-9"
                  />
                  <div className="absolute right-2 top-2">
                    <EmojiPickerButton
                      guildName={guildName}
                      guildIconUrl={guildIconUrl}
                      guildEmojis={guildEmojis}
                      onPick={(e) => update('announceMessage', (config.announceMessage + e).slice(0, 1000))}
                    />
                  </div>
                </div>
                <p className="mt-1 text-right text-xs text-gray-500">{config.announceMessage.length} /1000</p>
              </div>
            )}
          </div>

          {config.announceChannelId && (
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Prévisualisation
              </span>
              <AnnounceMessagePreview
                botName={botName}
                botAvatarUrl={botAvatarUrl}
                now={now}
                avatarUrl={previewAvatarUrl}
                announceMessage={config.announceMessage}
                previewUsername={previewUsername}
                roleName={roles.find((r) => r.id === config.roleId)?.name ?? 'Nom du rôle'}
                roles={roles}
                channels={channels}
              />
            </div>
          )}
        </div>
      </section>

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
