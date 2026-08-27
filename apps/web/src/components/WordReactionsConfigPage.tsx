'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import type { Channel } from '@/components/ChannelSelect';
import { EmojiPickerButton } from '@/components/EmojiPickerButton';
import { MultiEntitySelect, type SelectableEntity } from '@/components/MultiEntitySelect';
import type { GuildEmoji } from '@/lib/emoji-data';
import { useUnsavedChanges } from '@/lib/unsaved-changes-context';

export interface WordReactionConfigData {
  enabled: boolean;
  roleMode: string;
  roleIds: string[];
  channelMode: string;
  channelIds: string[];
}

interface WordReactionTriggerData {
  id: string;
  phrase: string;
  emojis: string[];
}

const DEFAULT_CONFIG: WordReactionConfigData = {
  enabled: false,
  roleMode: 'allow',
  roleIds: [],
  channelMode: 'allow',
  channelIds: [],
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

// Même rendu que le glyphe emoji du composeur de rôles-réactions — image de
// l'emoji personnalisé, ou le caractère unicode tel quel.
function EmojiGlyph({ emoji }: { emoji: string }) {
  const match = /^<(a?):(\w+):(\d+)>$/.exec(emoji);
  if (match) {
    const [, animated, name, id] = match;
    return <img src={`https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=32`} alt={name} className="h-5 w-5" />;
  }
  return <span className="text-lg leading-none">{emoji}</span>;
}

// Popup de création/édition d'un déclencheur — phrase + une ou plusieurs
// réactions emoji, ajoutées une par une via le sélecteur.
function TriggerModal({
  existing,
  error,
  guildName,
  guildIconUrl,
  guildEmojis,
  onClose,
  onSubmit,
}: {
  existing: WordReactionTriggerData | null;
  error: string;
  guildName: string;
  guildIconUrl: string | null;
  guildEmojis: GuildEmoji[];
  onClose: () => void;
  onSubmit: (data: { phrase: string; emojis: string[] }) => void;
}) {
  const [phrase, setPhrase] = useState(existing?.phrase ?? '');
  const [emojis, setEmojis] = useState<string[]>(existing?.emojis ?? []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1d23] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">
          {existing ? 'Modifier le' : 'Créer un'} déclencheur
        </h3>

        {error && <p className="mb-3 text-xs text-[#ED4245]">{error}</p>}

        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Phrase commençant par
            </span>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value.slice(0, 100))}
              placeholder="Veuillez entrer un début de phrase..."
              className="input"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Réactions à ajouter
            </span>
            <div className="input flex flex-wrap items-center gap-1.5 py-1.5">
              <EmojiPickerButton
                guildName={guildName}
                guildIconUrl={guildIconUrl}
                guildEmojis={guildEmojis}
                onPick={(e) => setEmojis((list) => (list.includes(e) ? list : [...list, e]))}
              />
              {emojis.length === 0 && <span className="text-sm text-gray-500">Aucune réaction</span>}
              {emojis.map((e) => (
                <span key={e} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pl-2 pr-1.5">
                  <EmojiGlyph emoji={e} />
                  <button
                    type="button"
                    onClick={() => setEmojis((list) => list.filter((x) => x !== e))}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-200">
            Annuler
          </button>
          <button
            type="button"
            disabled={!phrase.trim() || emojis.length === 0}
            onClick={() => onSubmit({ phrase: phrase.trim(), emojis })}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {existing ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Ajoute une ou plusieurs réactions emoji quand un message commence par une
// phrase configurée (insensible à la casse) — restrictions de rôles/salons
// globales au module, façon DraftBot.
export function WordReactionsConfigPage({
  guildId,
  guildName,
  guildIconUrl,
  initial,
}: {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  initial?: WordReactionConfigData;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<WordReactionConfigData>(initial ?? DEFAULT_CONFIG);
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(initial ?? DEFAULT_CONFIG));
  const [roles, setRoles] = useState<SelectableEntity[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [triggers, setTriggers] = useState<WordReactionTriggerData[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(true);
  const [modal, setModal] = useState<'new' | WordReactionTriggerData | null>(null);
  const [triggerError, setTriggerError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/guilds/${guildId}/roles`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/guilds/${guildId}/channels`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/guilds/${guildId}/emojis`).then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([r, c, e]) => {
        setRoles(r);
        setChannels(c);
        setGuildEmojis(e);
      })
      .catch(() => {
        setRoles([]);
        setChannels([]);
        setGuildEmojis([]);
      });

    fetch(`/api/guilds/${guildId}/word-reactions/triggers`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setTriggers)
      .catch(() => setTriggers([]))
      .finally(() => setTriggersLoading(false));
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

  function update<K extends keyof WordReactionConfigData>(key: K, value: WordReactionConfigData[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/guilds/${guildId}/word-reactions`, {
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

  async function submitTrigger(data: { phrase: string; emojis: string[] }) {
    setTriggerError('');
    const editing = modal !== 'new' ? modal : null;
    const res = await fetch(
      editing ? `/api/guilds/${guildId}/word-reactions/triggers/${editing.id}` : `/api/guilds/${guildId}/word-reactions/triggers`,
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTriggerError(result.error ?? 'Erreur lors de l’enregistrement');
      return;
    }
    setTriggers((list) => {
      const withoutEditing = editing ? list.filter((t) => t.id !== editing.id) : list;
      return [...withoutEditing, result as WordReactionTriggerData];
    });
    setModal(null);
  }

  async function deleteTrigger(trigger: WordReactionTriggerData) {
    if (!window.confirm(`Supprimer le déclencheur « ${trigger.phrase} » ?`)) return;
    setBusyId(trigger.id);
    const res = await fetch(`/api/guilds/${guildId}/word-reactions/triggers/${trigger.id}`, { method: 'DELETE' });
    if (res.ok) setTriggers((list) => list.filter((t) => t.id !== trigger.id));
    setBusyId(null);
  }

  return (
    <div className="space-y-8 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Réactions de mots</h1>
          <p className="text-sm text-gray-500">
            Configurez des réactions automatiques à des débuts de phrases : serveur plus vivant et interactif.
          </p>
        </div>
        <Toggle checked={config.enabled} onChange={(v) => update('enabled', v)} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Rôles{' '}
            <span className={config.roleMode === 'allow' ? 'text-white' : 'text-gray-600'}>autorisés</span>
            {' / '}
            <span className={config.roleMode === 'deny' ? 'text-white' : 'text-gray-600'}>interdits</span>
          </span>
          <MultiEntitySelect
            entities={roles}
            selectedIds={config.roleIds}
            onChange={(ids) => update('roleIds', ids)}
            placeholder="Tout le monde"
            rightSlot={
              <button
                type="button"
                onClick={() => update('roleMode', config.roleMode === 'allow' ? 'deny' : 'allow')}
                title="Basculer autorisés / interdits"
                className="text-gray-400 hover:text-white"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            }
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Salons{' '}
            <span className={config.channelMode === 'allow' ? 'text-white' : 'text-gray-600'}>autorisés</span>
            {' / '}
            <span className={config.channelMode === 'deny' ? 'text-white' : 'text-gray-600'}>interdits</span>
          </span>
          <MultiEntitySelect
            entities={channels}
            selectedIds={config.channelIds}
            onChange={(ids) => update('channelIds', ids)}
            placeholder="Partout"
            rightSlot={
              <button
                type="button"
                onClick={() => update('channelMode', config.channelMode === 'allow' ? 'deny' : 'allow')}
                title="Basculer autorisés / interdits"
                className="text-gray-400 hover:text-white"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            }
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Réactions de mots</span>
          <button type="button" onClick={() => setModal('new')} className="btn-primary text-sm">
            Ajouter une cible
          </button>
        </div>

        {triggersLoading ? (
          <p className="rounded-lg border border-dashed border-white/10 py-6 text-center text-sm text-gray-500">Chargement...</p>
        ) : triggers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 py-6 text-center text-sm text-gray-500">
            Aucun déclencheur configuré sur le serveur.
          </p>
        ) : (
          <div className="space-y-2">
            {triggers.map((trigger) => (
              <div key={trigger.id} className="card flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-white">{trigger.phrase}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {trigger.emojis.map((e) => (
                      <EmojiGlyph key={e} emoji={e} />
                    ))}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => setModal(trigger)} className="btn-secondary text-xs">
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTrigger(trigger)}
                    disabled={busyId === trigger.id}
                    className="rounded-lg border border-[#ED4245]/40 px-3 py-1.5 text-xs font-medium text-[#ED4245] transition hover:bg-[#ED4245]/10 disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <TriggerModal
          existing={modal === 'new' ? null : modal}
          error={triggerError}
          guildName={guildName}
          guildIconUrl={guildIconUrl}
          guildEmojis={guildEmojis}
          onClose={() => {
            setModal(null);
            setTriggerError('');
          }}
          onSubmit={submitTrigger}
        />
      )}

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
