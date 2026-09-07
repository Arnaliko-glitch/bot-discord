'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  CircleHelp,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  MousePointerClick,
  Smile,
  SquareMenu,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { ChannelSelect, type Channel } from '@/components/ChannelSelect';
import {
  BLANK_EMBED,
  deleteServerFile,
  EmbedBlock,
  ImageGrid,
  totalEmbedChars,
  type EmbedData,
  type EmbedField,
} from '@/components/EmbedEditor';
import { EmojiPickerButton } from '@/components/EmojiPickerButton';
import { InlineRenameLabel } from '@/components/InlineRenameLabel';
import { MentionTextarea, renderMentionText, type RoleOption } from '@/components/MentionTextarea';
import type { GuildEmoji } from '@/lib/emoji-data';

export type { EmbedData, EmbedField } from '@/components/EmbedEditor';

// Même panneau que EmojiPickerButton, chargé à part ici pour piloter
// nous-même l'icône du déclencheur (le smiley doit laisser place à l'emoji
// choisi, ce qu'EmojiPickerButton ne permet pas).
const EmojiPickerPanel = dynamic(() => import('./EmojiPickerPanel'), { ssr: false });

export type ButtonStyleKey = 'blue' | 'gray' | 'green' | 'red';
export type ButtonActionKey = 'ticket' | 'link';

export interface MessageButtonData {
  label: string;
  emoji: string | null;
  style: ButtonStyleKey;
  disabled: boolean;
  action: ButtonActionKey | null;
  url: string | null;
}

export interface MessageData {
  id: string;
  name: string;
  channelId: string | null;
  content: string | null;
  embedData: EmbedData[];
  imageUrls: string[];
  buttons: MessageButtonData[];
  lastSentMessageId: string | null;
  lastSentChannelId: string | null;
  // Renvoie un nouveau message dans le salon toutes les autoSendIntervalMin
  // minutes tant que c'est activé — autoSendNextAt (calculé côté serveur,
  // jamais modifié depuis ici) sert juste à afficher le prochain envoi prévu.
  autoSendEnabled: boolean;
  autoSendIntervalMin: number | null;
  autoSendNextAt: string | null;
}

const MAX_IMAGES = 10;
const MAX_EMBEDS = 5;
// Discord n'autorise que 5 boutons par ligne — on ne gère qu'une seule ligne.
const MAX_BUTTONS = 5;
// Doit rester synchronisé avec la même constante côté API
// (app/api/guilds/[id]/messages/[messageId]/route.ts, qui l'applique
// réellement) — purement indicatif ici.
const MIN_AUTO_SEND_INTERVAL_MIN = 5;

const BLANK_BUTTON: MessageButtonData = {
  label: '',
  emoji: null,
  style: 'blue',
  disabled: false,
  action: null,
  url: null,
};

// Couleurs réelles des boutons Discord (styles Primary/Secondary/Success/Danger).
const BUTTON_STYLE_OPTIONS: { key: ButtonStyleKey; label: string; color: string }[] = [
  { key: 'blue', label: 'Bleu', color: '#5865F2' },
  { key: 'gray', label: 'Gris', color: '#4E5058' },
  { key: 'green', label: 'Vert', color: '#248046' },
  { key: 'red', label: 'Rouge', color: '#DA373C' },
];
const BUTTON_COLORS: Record<ButtonStyleKey, string> = Object.fromEntries(
  BUTTON_STYLE_OPTIONS.map((o) => [o.key, o.color])
) as Record<ButtonStyleKey, string>;

type Tab = 'content' | 'image' | 'embed' | 'button' | 'selector';

const TABS: { key: Tab; label: string; icon: typeof FileText; disabled?: boolean }[] = [
  { key: 'content', label: 'Contenu', icon: FileText },
  { key: 'image', label: 'Image', icon: ImageIcon },
  { key: 'embed', label: 'Embed', icon: LayoutGrid },
  { key: 'button', label: 'Bouton', icon: MousePointerClick },
  { key: 'selector', label: 'Sélecteur', icon: SquareMenu, disabled: true },
];

function emptyDraft(name: string): MessageData {
  return {
    id: '',
    name,
    channelId: null,
    content: null,
    embedData: [],
    imageUrls: [],
    buttons: [],
    lastSentMessageId: null,
    lastSentChannelId: null,
    autoSendEnabled: false,
    autoSendIntervalMin: null,
    autoSendNextAt: null,
  };
}

// Les champs `embedData`/`buttons` en base sont des JSON nullables : Prisma
// renvoie `null` tant que rien n'a été sauvegardé, alors que le composant
// attend toujours des tableaux. Toute réponse d'API doit passer par ici
// avant d'être traitée comme un MessageData.
function normalizeMessage(
  raw: Omit<MessageData, 'embedData' | 'buttons'> & { embedData: EmbedData[] | null; buttons: MessageButtonData[] | null }
): MessageData {
  return { ...raw, embedData: raw.embedData ?? [], buttons: raw.buttons ?? [] };
}

export function MessagesConfigPage({
  guildId,
  guildName,
  guildIconUrl,
  botName,
  botAvatarUrl,
  initialMessages,
}: {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  botName: string;
  botAvatarUrl: string | null;
  initialMessages: MessageData[];
}) {
  const [messages, setMessages] = useState<MessageData[]>(initialMessages);
  // Rien n'est présélectionné à l'arrivée sur la page — l'éditeur reste vide
  // (et le salon non modifiable) tant qu'on n'a pas choisi ou créé un brouillon.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MessageData>(emptyDraft(''));
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(emptyDraft('')));
  const [activeTab, setActiveTab] = useState<Tab>('content');
  const [contentVisible, setContentVisible] = useState(true);
  const [imagePopupOpen, setImagePopupOpen] = useState(false);
  // Index du bouton en cours d'édition dans la modale, 'new' pour un ajout,
  // null quand la modale est fermée.
  const [editingButtonIndex, setEditingButtonIndex] = useState<number | 'new' | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    fetch(`/api/guilds/${guildId}/channels`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setChannels)
      .catch(() => setChannels([]));
    fetch(`/api/guilds/${guildId}/roles`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setRoles)
      .catch(() => setRoles([]));
    fetch(`/api/guilds/${guildId}/emojis`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setGuildEmojis)
      .catch(() => setGuildEmojis([]));
  }, [guildId]);

  function selectMessage(m: MessageData) {
    setSelectedId(m.id);
    setDraft(m);
    setLastSaved(JSON.stringify(m));
    setStatusMessage('');
    setImagePopupOpen(false);
    setEditingButtonIndex(null);
    // La zone de contenu ne doit réapparaître que si ce message en a
    // vraiment un — sinon on écrase le fait de l'avoir volontairement vidée
    // à chaque fois qu'on rouvre ce message pour le modifier.
    setContentVisible(Boolean(m.content));
  }

  function update<K extends keyof MessageData>(key: K, value: MessageData[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // Renomme n'importe quel message (brouillon ou déjà envoyé) en base,
  // indépendamment du bouton "Sauvegarder" et de la sélection courante —
  // cliquer sur un nom dans une des listes suffit, il s'enregistre tout
  // seul. Le débounce/l'état d'édition vivent dans InlineRenameLabel, ici on
  // ne fait que persister.
  async function commitRename(id: string, name: string) {
    const res = await fetch(`/api/guilds/${guildId}/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const updated = normalizeMessage(await res.json());
    setMessages((list) => list.map((item) => (item.id === updated.id ? updated : item)));
    if (draft.id === updated.id) {
      setDraft((d) => ({ ...d, name: updated.name }));
      setLastSaved((prev) => JSON.stringify({ ...JSON.parse(prev), name: updated.name }));
    }
  }

  function handleImagePopupChange(nextOpen: boolean) {
    setImagePopupOpen(nextOpen);
    // Si on ferme la popup sans avoir ajouté d'image, on ne laisse pas
    // l'emplacement vide affiché — l'onglet "Image" redevient inactif.
    if (!nextOpen && draft.imageUrls.length === 0) {
      setActiveTab('content');
    }
  }

  function updateEmbedAt<K extends keyof EmbedData>(index: number, key: K, value: EmbedData[K]) {
    setDraft((d) => ({
      ...d,
      embedData: d.embedData.map((e, i) => (i === index ? { ...e, [key]: value } : e)),
    }));
  }

  function selectTab(tab: Tab) {
    setActiveTab(tab);
    if (tab === 'content') setContentVisible(true);
    // Chaque clic sur l'onglet "Embed" ajoute un nouvel embed (jusqu'au
    // maximum autorisé) — l'aperçu affiche sa structure complète, avec ses
    // libellés vides, dès qu'il est créé.
    if (tab === 'embed' && draft.embedData.length < MAX_EMBEDS) {
      setDraft((d) => ({ ...d, embedData: [...d.embedData, { ...BLANK_EMBED }] }));
    }
    // Chaque clic sur l'onglet "Image" ouvre directement la popup d'ajout,
    // qu'il y ait déjà des images ou non.
    if (tab === 'image' && draft.imageUrls.length < MAX_IMAGES) {
      setImagePopupOpen(true);
    }
    // Chaque clic sur l'onglet "Bouton" ouvre directement la modale d'ajout.
    if (tab === 'button' && draft.buttons.length < MAX_BUTTONS) {
      setEditingButtonIndex('new');
    }
  }

  function addButton(button: MessageButtonData) {
    setDraft((d) => ({ ...d, buttons: [...d.buttons, button] }));
  }

  function updateButtonAt(index: number, button: MessageButtonData) {
    setDraft((d) => ({ ...d, buttons: d.buttons.map((b, i) => (i === index ? button : b)) }));
  }

  function removeButtonAt(index: number) {
    setDraft((d) => ({ ...d, buttons: d.buttons.filter((_, i) => i !== index) }));
  }

  function removeEmbed(index: number) {
    const target = draft.embedData[index];
    // Une image déjà enregistrée n'est nettoyée qu'à la sauvegarde (voir
    // save()), pas ici — sinon "Annuler" ne peut plus la restaurer.
    for (const url of target?.imageUrls ?? []) {
      if (!isSavedImageUrl(url)) deleteServerFile(guildId, url);
    }
    if (target?.thumbnailUrl && !isSavedImageUrl(target.thumbnailUrl)) deleteServerFile(guildId, target.thumbnailUrl);
    if (target?.authorIconUrl && !isSavedImageUrl(target.authorIconUrl)) deleteServerFile(guildId, target.authorIconUrl);
    if (target?.footerIconUrl && !isSavedImageUrl(target.footerIconUrl)) deleteServerFile(guildId, target.footerIconUrl);
    setDraft((d) => ({ ...d, embedData: d.embedData.filter((_, i) => i !== index) }));
  }

  function duplicateEmbed(index: number) {
    setDraft((d) => {
      if (d.embedData.length >= MAX_EMBEDS) return d;
      const source = d.embedData[index];
      const copy: EmbedData = { ...source, fields: source.fields.map((f) => ({ ...f })) };
      const next = [...d.embedData];
      next.splice(index + 1, 0, copy);
      return { ...d, embedData: next };
    });
  }

  const isDirty = JSON.stringify(draft) !== lastSaved;
  const canModifyLastSent = Boolean(draft.lastSentMessageId && draft.lastSentChannelId === draft.channelId);

  // Une image encore présente dans la dernière version enregistrée ne doit
  // jamais être supprimée du serveur avant que le remplacement/retrait ne
  // soit confirmé par "Sauvegarder" — sinon "Annuler" ne peut plus la
  // restaurer (le fichier n'existe déjà plus). Seules les images ajoutées
  // dans la session en cours (jamais enregistrées) peuvent être nettoyées
  // immédiatement quand on les remplace ou retire.
  function isSavedImageUrl(url: string | null): boolean {
    if (!url) return false;
    const saved = JSON.parse(lastSaved) as MessageData;
    if (saved.imageUrls.includes(url)) return true;
    return saved.embedData.some(
      (e) => e.imageUrls.includes(url) || e.thumbnailUrl === url || e.authorIconUrl === url || e.footerIconUrl === url
    );
  }

  async function createDraft() {
    const res = await fetch(`/api/guilds/${guildId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!res.ok) return;
    const created = normalizeMessage(await res.json());
    setMessages((list) => [created, ...list]);
    selectMessage(created);
  }

  async function save(): Promise<MessageData | null> {
    if (!draft.id) return null;
    setSaving(true);
    setStatusMessage('');
    const previous = JSON.parse(lastSaved) as MessageData;
    const res = await fetch(`/api/guilds/${guildId}/messages/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!res.ok) {
      setStatusMessage("❌ Erreur lors de l'enregistrement");
      return null;
    }
    const updated = normalizeMessage(await res.json());
    // Les images de l'ancienne version qui ne servent plus nulle part dans
    // la nouvelle deviennent orphelines maintenant que le changement est
    // confirmé (remplacement ou retrait) — c'est le seul moment où on peut
    // les supprimer sans casser un éventuel "Annuler" fait avant cette sauvegarde.
    const keptUrls = new Set(
      [
        ...updated.imageUrls,
        ...updated.embedData.flatMap((e) => [...e.imageUrls, e.thumbnailUrl, e.authorIconUrl, e.footerIconUrl]),
      ].filter(Boolean)
    );
    const previousUrls = [
      ...previous.imageUrls,
      ...previous.embedData.flatMap((e) => [...e.imageUrls, e.thumbnailUrl, e.authorIconUrl, e.footerIconUrl]),
    ];
    for (const url of previousUrls) {
      if (url && !keptUrls.has(url)) deleteServerFile(guildId, url);
    }
    setMessages((list) => list.map((m) => (m.id === updated.id ? updated : m)));
    setDraft(updated);
    setLastSaved(JSON.stringify(updated));
    setStatusMessage('✅ Enregistré');
    return updated;
  }

  async function sendMessage(mode: 'resend' | 'edit') {
    if (!draft.channelId) {
      setStatusMessage('❌ Choisissez un salon avant d\'envoyer.');
      return;
    }
    setSending(true);
    const saved = await save();
    if (!saved) {
      setSending(false);
      return;
    }
    const res = await fetch(`/api/guilds/${guildId}/messages/${saved.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const raw = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setStatusMessage(`❌ ${raw.error ?? 'Envoi échoué'}`);
      return;
    }
    const result = normalizeMessage(raw);
    setMessages((list) => list.map((m) => (m.id === result.id ? result : m)));
    setDraft(result);
    setLastSaved(JSON.stringify(result));
    setStatusMessage(mode === 'edit' ? '✅ Message mis à jour !' : '✅ Message envoyé !');
  }

  async function deleteMessage(m: MessageData) {
    if (!window.confirm(`Supprimer "${m.name}" ?`)) return;
    const res = await fetch(`/api/guilds/${guildId}/messages/${m.id}`, { method: 'DELETE' });
    if (!res.ok) return;
    m.imageUrls.forEach((url) => deleteServerFile(guildId, url));
    m.embedData.forEach((e) => {
      e.imageUrls.forEach((url) => deleteServerFile(guildId, url));
      deleteServerFile(guildId, e.thumbnailUrl);
      deleteServerFile(guildId, e.authorIconUrl);
      deleteServerFile(guildId, e.footerIconUrl);
    });
    setMessages((list) => list.filter((item) => item.id !== m.id));
    if (selectedId === m.id) {
      const next = messages.find((item) => item.id !== m.id) ?? null;
      if (next) selectMessage(next);
      else {
        setSelectedId(null);
        setDraft(emptyDraft(''));
        setLastSaved(JSON.stringify(emptyDraft('')));
      }
    }
  }

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Messages</h1>
        <p className="text-sm text-gray-500">
          Créez des messages interactifs reliés à tous vos systèmes préférés via des boutons et sélecteurs
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_500px]">
        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Salon du message</span>
            <ChannelSelect
              label=""
              channels={channels}
              value={draft.channelId ?? ''}
              onChange={(v) => update('channelId', v || null)}
              disabled={!draft.id}
            />
          </div>

          {draft.id && (
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Envoi automatique</span>
              <div className="card space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Renvoyer ce message périodiquement</p>
                    <p className="text-xs text-gray-500">Un nouveau message est posté dans le salon à intervalle régulier.</p>
                  </div>
                  <Toggle checked={draft.autoSendEnabled} onChange={(v) => update('autoSendEnabled', v)} />
                </div>
                {draft.autoSendEnabled && (
                  <>
                    <div className="flex items-center gap-2 text-sm text-white">
                      <span className="text-gray-400">Toutes les</span>
                      <input
                        type="number"
                        min={0}
                        value={Math.floor((draft.autoSendIntervalMin ?? 0) / 60)}
                        onChange={(e) => {
                          const hours = Math.max(0, Number(e.target.value) || 0);
                          const minutes = (draft.autoSendIntervalMin ?? 0) % 60;
                          update('autoSendIntervalMin', hours * 60 + minutes);
                        }}
                        className="input w-16 text-center"
                      />
                      <span className="text-gray-400">h</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={(draft.autoSendIntervalMin ?? 0) % 60}
                        onChange={(e) => {
                          const hours = Math.floor((draft.autoSendIntervalMin ?? 0) / 60);
                          const minutes = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                          update('autoSendIntervalMin', hours * 60 + minutes);
                        }}
                        className="input w-16 text-center"
                      />
                      <span className="text-gray-400">min</span>
                    </div>
                    <p className="text-xs text-gray-500">Minimum {MIN_AUTO_SEND_INTERVAL_MIN} minutes.</p>
                    {draft.autoSendNextAt && (
                      <p className="text-xs text-gray-500">
                        Prochain envoi : {new Date(draft.autoSendNextAt).toLocaleString('fr-FR')}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Envoi du message</span>
            <div className="card space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
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
                    <span className="text-xs text-gray-500">à l&apos;instant</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <span className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Embeds
                  </span>
                  <span
                    title="Bientôt disponible"
                    className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-500"
                  >
                    <SquareMenu className="h-3.5 w-3.5" />
                    Avancé
                  </span>
                </div>
              </div>

              {!draft.id ? (
                <p className="text-sm text-gray-500">Créez ou sélectionnez un brouillon pour commencer.</p>
              ) : (
                <div className="max-w-[600px] space-y-3">
                  {contentVisible && (
                    <div className="flex items-start gap-1.5">
                      <div className="h-7 w-7 shrink-0" />
                      <div className="relative min-w-0 flex-1 rounded-lg bg-[#2b2d31] p-3">
                        <MentionTextarea
                          value={draft.content ?? ''}
                          onChange={(v) => update('content', v || null)}
                          roles={roles}
                          channels={channels}
                          rows={1}
                          maxLength={2000}
                          placeholder="Contenu du message"
                          className="w-full resize-none border-0 bg-transparent p-0 pr-8 text-sm text-[#dcddde] outline-none placeholder:text-gray-500"
                        />
                        <div className="absolute right-3 top-3">
                          <EmojiPickerButton
                            guildName={guildName}
                            guildIconUrl={guildIconUrl}
                            guildEmojis={guildEmojis}
                            onPick={(e) => update('content', ((draft.content ?? '') + e).slice(0, 2000))}
                          />
                        </div>
                      </div>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            update('content', null);
                            setContentVisible(false);
                          }}
                          title="Vider le contenu"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {(draft.imageUrls.length > 0 || activeTab === 'image') && (
                    <div className="flex items-start gap-1.5">
                      <div className="h-7 w-7 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <ImageGrid
                          guildId={guildId}
                          urls={draft.imageUrls}
                          onChange={(v) => update('imageUrls', v)}
                          maxImages={MAX_IMAGES}
                          open={imagePopupOpen}
                          onOpenChange={handleImagePopupChange}
                          isSavedUrl={isSavedImageUrl}
                        />
                      </div>
                      <div className="h-7 w-7 shrink-0" />
                    </div>
                  )}

                  {draft.embedData.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {draft.embedData.map((embed, index) => (
                        <EmbedBlock
                          key={index}
                          embed={embed}
                          onUpdate={(key, value) => updateEmbedAt(index, key, value)}
                          onRemove={() => removeEmbed(index)}
                          onDuplicate={() => duplicateEmbed(index)}
                          duplicateDisabled={draft.embedData.length >= MAX_EMBEDS}
                          guildId={guildId}
                          roles={roles}
                          channels={channels}
                          guildEmojis={guildEmojis}
                          guildName={guildName}
                          guildIconUrl={guildIconUrl}
                          isSavedUrl={isSavedImageUrl}
                        />
                      ))}
                    </div>
                  )}

                  {draft.buttons.length > 0 && (
                    <div className="flex items-start gap-1.5">
                      <div className="h-7 w-7 shrink-0" />
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {draft.buttons.map((button, index) => (
                          <ButtonPreview
                            key={index}
                            button={button}
                            onEdit={() => setEditingButtonIndex(index)}
                            onRemove={() => removeButtonAt(index)}
                          />
                        ))}
                      </div>
                      <div className="h-7 w-7 shrink-0" />
                    </div>
                  )}
                </div>
              )}

              {draft.id && (
                <div className="text-right text-[11px] leading-tight text-gray-500">
                  <p>{(draft.content ?? '').length}/2000</p>
                  {draft.embedData.length > 0 && <p>{totalEmbedChars(draft.embedData)}/6000</p>}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-3">
                {TABS.filter((tab) => {
                  if (tab.key === 'content') return !contentVisible;
                  if (tab.key === 'image') return draft.imageUrls.length < MAX_IMAGES;
                  if (tab.key === 'embed') return draft.embedData.length < MAX_EMBEDS;
                  if (tab.key === 'button') return draft.buttons.length < MAX_BUTTONS;
                  return true;
                }).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    disabled={!draft.id || tab.disabled}
                    onClick={() => selectTab(tab.key)}
                    title={tab.disabled ? 'Bientôt disponible' : undefined}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {draft.id && (
            <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
              {statusMessage && <p className="text-sm">{statusMessage}</p>}
              <button
                type="button"
                onClick={() => {
                  const saved = JSON.parse(lastSaved) as MessageData;
                  const keep = new Set(
                    [
                      ...saved.imageUrls,
                      ...saved.embedData.flatMap((e) => [...e.imageUrls, e.thumbnailUrl, e.authorIconUrl, e.footerIconUrl]),
                    ].filter(Boolean)
                  );
                  const current = [
                    ...draft.imageUrls,
                    ...draft.embedData.flatMap((e) => [...e.imageUrls, e.thumbnailUrl, e.authorIconUrl, e.footerIconUrl]),
                  ];
                  for (const url of current) {
                    if (url && !keep.has(url)) deleteServerFile(guildId, url);
                  }
                  setDraft(saved);
                }}
                disabled={!isDirty}
                className="rounded-lg border border-white/10 bg-[#f5f0e6] px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Annuler
              </button>
              <button type="button" onClick={save} disabled={!isDirty || saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Enregistrement...' : 'Sauvegarder'}
              </button>
              <button
                type="button"
                onClick={() => sendMessage('resend')}
                disabled={sending || !draft.channelId}
                className="btn-primary disabled:opacity-50"
              >
                {sending ? 'Envoi...' : draft.lastSentMessageId ? 'Renvoyer' : 'Envoyer'}
              </button>
              <button
                type="button"
                onClick={() => sendMessage('edit')}
                disabled={sending || !draft.channelId || !canModifyLastSent}
                title={canModifyLastSent ? undefined : "Ce message n'a pas encore été envoyé dans ce salon"}
                className="btn-primary disabled:opacity-40"
              >
                {sending ? 'Envoi...' : 'Modifier'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Messages</span>
              <button type="button" onClick={createDraft} className="btn-secondary text-xs">
                Nouveau brouillon
              </button>
            </div>
            <div className="space-y-2">
              {messages.length === 0 && <p className="text-sm text-gray-500">Aucun message.</p>}
              {messages.map((m) => {
                const channel = channels.find((c) => c.id === m.channelId);
                return (
                  <div key={m.id} className="card space-y-2 p-3">
                    <InlineRenameLabel value={m.name} onCommit={(name) => commitRename(m.id, name)} />
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      {m.lastSentMessageId ? (
                        <span className="text-[#57F287]">✓</span>
                      ) : (
                        <Link2 className="h-3 w-3" />
                      )}
                      <span className="truncate">{channel ? `#${channel.name}` : 'Aucun salon'}</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => selectMessage(m)} className="btn-secondary flex-1 text-xs">
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMessage(m)}
                        className="flex-1 rounded-lg border border-[#ED4245]/40 px-3 py-1.5 text-xs font-medium text-[#ED4245] transition hover:bg-[#ED4245]/10"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {editingButtonIndex !== null && (
        <ButtonEditorModal
          guildName={guildName}
          guildIconUrl={guildIconUrl}
          guildEmojis={guildEmojis}
          initial={editingButtonIndex === 'new' ? null : draft.buttons[editingButtonIndex]}
          onCancel={() => setEditingButtonIndex(null)}
          onDelete={
            editingButtonIndex === 'new'
              ? undefined
              : () => {
                  removeButtonAt(editingButtonIndex);
                  setEditingButtonIndex(null);
                }
          }
          onSave={(button) => {
            if (editingButtonIndex === 'new') addButton(button);
            else updateButtonAt(editingButtonIndex, button);
            setEditingButtonIndex(null);
          }}
        />
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-[var(--accent)]' : 'bg-gray-600'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// Affiche un emoji picoché pour le bouton — glyphe unicode direct, ou image
// CDN pour un émoji personnalisé du serveur (même tag `<a?:nom:id>` que
// celui déjà géré par renderMentionText).
function ButtonEmojiGlyph({ emoji }: { emoji: string }) {
  const match = /^<(a?):(\w+):(\d+)>$/.exec(emoji);
  if (match) {
    const [, animated, name, id] = match;
    return (
      <img
        src={`https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=32`}
        alt={name}
        className="h-4 w-4"
      />
    );
  }
  return <span className="text-sm leading-none">{emoji}</span>;
}

// Déclencheur du picker d'emoji du bouton : contrairement à EmojiPickerButton
// (icône smiley fixe), celui-ci affiche l'emoji choisi à la place du smiley
// une fois qu'il y en a un, comme dans DraftBot.
function ButtonEmojiPicker({
  guildName,
  guildIconUrl,
  guildEmojis,
  value,
  onChange,
}: {
  guildName: string;
  guildIconUrl: string | null;
  guildEmojis: GuildEmoji[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-6 w-6 items-center justify-center text-gray-500 hover:text-gray-300"
      >
        {value ? <ButtonEmojiGlyph emoji={value} /> : <Smile className="h-4 w-4" />}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1">
          <EmojiPickerPanel
            guildName={guildName}
            guildIconUrl={guildIconUrl}
            guildEmojis={guildEmojis}
            onPick={(text) => {
              onChange(text);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

// Rendu non-interactif d'un bouton dans l'aperçu — la vraie couleur/le vrai
// texte du bouton Discord, avec les actions (modifier/retirer) au survol.
function ButtonPreview({
  button,
  onEdit,
  onRemove,
}: {
  button: MessageButtonData;
  onEdit: () => void;
  onRemove: () => void;
}) {
  // Discord force le style "Link" (toujours gris + icône de lien sortant)
  // pour un bouton avec URL, quelle que soit la couleur choisie — l'aperçu
  // doit refléter le vrai rendu, pas la couleur enregistrée mais inactive.
  const isLink = button.action === 'link';
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-[3px] px-4 py-2 text-sm font-medium text-white ${
          button.disabled ? 'opacity-50' : ''
        }`}
        style={{ backgroundColor: isLink ? BUTTON_COLORS.gray : BUTTON_COLORS[button.style] }}
      >
        {button.emoji && <ButtonEmojiGlyph emoji={button.emoji} />}
        {button.label || 'Bouton'}
        {isLink && <ExternalLink className="h-3.5 w-3.5" />}
      </span>
      <button type="button" onClick={onEdit} className="btn-secondary px-3 py-1.5 text-xs">
        Modifier
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Retirer le bouton"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Modale d'ajout/modification d'un bouton, façon DraftBot : bouton (emoji +
// titre), couleur, désactivation, puis l'action déclenchée au clic. Seules
// deux actions sont supportées pour l'instant : ouvrir un ticket (réutilise
// le système de tickets existant, un seul bouton "ticket:create" par serveur)
// et rediriger vers un lien (bouton natif Discord de type "Link").
function ButtonEditorModal({
  guildName,
  guildIconUrl,
  guildEmojis,
  initial,
  onCancel,
  onSave,
  onDelete,
}: {
  guildName: string;
  guildIconUrl: string | null;
  guildEmojis: GuildEmoji[];
  initial: MessageButtonData | null;
  onCancel: () => void;
  onSave: (button: MessageButtonData) => void;
  onDelete?: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [style, setStyle] = useState<ButtonStyleKey>(initial?.style ?? 'blue');
  const [disabled, setDisabled] = useState(initial?.disabled ?? false);
  const [action, setAction] = useState<ButtonActionKey | ''>(initial?.action ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [error, setError] = useState('');

  function handleValidate() {
    if (!label.trim()) {
      setError('Le titre du bouton est requis.');
      return;
    }
    if (!action) {
      setError("Choisissez une action.");
      return;
    }
    const trimmedUrl = url.trim();
    if (action === 'link' && !/^https?:\/\//i.test(trimmedUrl)) {
      setError("L'URL doit commencer par http:// ou https://");
      return;
    }
    onSave({
      label: label.trim().slice(0, 80),
      emoji,
      style,
      disabled,
      action,
      url: action === 'link' ? trimmedUrl : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#1a1d23] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-5 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">
            {initial ? "Modifier l'interaction de bouton" : 'Ajouter une interaction de bouton'}
          </h2>

          <div className="space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Bouton</span>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#2b2d31] px-3 py-2.5">
              <ButtonEmojiPicker
                guildName={guildName}
                guildIconUrl={guildIconUrl}
                guildEmojis={guildEmojis}
                value={emoji}
                onChange={setEmoji}
              />
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value.slice(0, 80))}
                placeholder="Titre du bouton"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-white outline-none placeholder:text-gray-500"
              />
            </div>
          </div>

          {action === 'link' ? (
            // Discord impose le style "Link" pour un bouton avec URL — la
            // couleur n'est pas personnalisable, comme chez DraftBot.
            <div className="flex items-center gap-2 rounded-lg border border-[#F0A020]/40 bg-[#F0A020]/10 px-3 py-2.5 text-sm text-[#F0A020]">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              Le changement de couleur n&apos;est pas possible pour les boutons de lien
            </div>
          ) : (
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Couleur du bouton</span>
              <div className="grid grid-cols-4 gap-2">
                {BUTTON_STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setStyle(opt.key)}
                    className={`rounded-lg py-2 text-sm font-medium text-white transition ring-2 ring-offset-2 ring-offset-[#1a1d23] ${
                      style === opt.key ? 'ring-white' : 'ring-transparent'
                    }`}
                    style={{ backgroundColor: opt.color }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Toggle checked={disabled} onChange={setDisabled} />
              <span className="text-sm font-semibold uppercase tracking-wide text-white">Désactiver le bouton</span>
              <span title="Les membres ne pourront plus utiliser le bouton.">
                <CircleHelp className="h-3.5 w-3.5 cursor-help text-gray-600" />
              </span>
            </div>
            <p className="pl-[52px] text-xs text-gray-500">Les membres ne pourront plus utiliser le bouton.</p>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Action</span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as ButtonActionKey | '')}
              className="input"
            >
              <option value="">Veuillez choisir le type d&apos;action</option>
              <option value="ticket">Ouvrir un ticket</option>
              <option value="link">Rediriger vers un lien</option>
            </select>
          </div>

          {action === 'link' && (
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Lien du bouton</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Lien vers lequel l'utilisateur sera envoyé"
                className="input"
              />
            </div>
          )}

          {action === 'ticket' && (
            <p className="text-xs text-gray-500">
              Ouvre un ticket comme le fait le module Tickets — assurez-vous qu&apos;il est activé pour ce serveur.
            </p>
          )}

          {error && <p className="text-xs text-[#ED4245]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-4 border-t border-white/10 px-5 py-3">
          {onDelete && (
            <button type="button" onClick={onDelete} className="mr-auto text-sm text-[#ED4245] hover:underline">
              Supprimer
            </button>
          )}
          <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-200">
            Annuler
          </button>
          <button type="button" onClick={handleValidate} className="btn-primary text-sm">
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}

