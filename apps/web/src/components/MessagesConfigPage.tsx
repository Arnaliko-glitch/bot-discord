'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CircleHelp,
  Copy,
  FileText,
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  MousePointerClick,
  Palette,
  Plus,
  SquareMenu,
  Trash2,
} from 'lucide-react';
import { ChannelSelect, type Channel } from '@/components/ChannelSelect';
import { EmojiPickerButton } from '@/components/EmojiPickerButton';
import { MentionTextarea, renderMentionText, type RoleOption } from '@/components/MentionTextarea';
import type { GuildEmoji } from '@/lib/emoji-data';

export interface EmbedField {
  name: string;
  value: string;
}

export interface EmbedData {
  authorName: string | null;
  title: string | null;
  description: string | null;
  color: string | null;
  fields: EmbedField[];
  imageUrl: string | null;
  thumbnailUrl: string | null;
  footerText: string | null;
}

export interface MessageData {
  id: string;
  name: string;
  channelId: string | null;
  content: string | null;
  embedData: EmbedData[];
  imageUrls: string[];
  lastSentMessageId: string | null;
  lastSentChannelId: string | null;
}

const EMBED_COLOR_SWATCHES = ['#ED4245', '#57F287', '#5865F2', '#F0A020'];
const DEFAULT_EMBED_COLOR = '#5865F2';
const MAX_IMAGES = 10;
const MAX_EMBEDS = 5;

const BLANK_EMBED: EmbedData = {
  authorName: null,
  title: null,
  description: null,
  color: DEFAULT_EMBED_COLOR,
  fields: [],
  imageUrl: null,
  thumbnailUrl: null,
  footerText: null,
};

type Tab = 'content' | 'image' | 'embed' | 'button' | 'selector';

const TABS: { key: Tab; label: string; icon: typeof FileText; disabled?: boolean }[] = [
  { key: 'content', label: 'Contenu', icon: FileText },
  { key: 'image', label: 'Image', icon: ImageIcon },
  { key: 'embed', label: 'Embed', icon: LayoutGrid },
  { key: 'button', label: 'Bouton', icon: MousePointerClick, disabled: true },
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
    lastSentMessageId: null,
    lastSentChannelId: null,
  };
}

// Le champ `embedData` en base est un JSON nullable : Prisma renvoie `null`
// tant qu'aucun embed n'a été sauvegardé, alors que le composant attend
// toujours un tableau. Toute réponse d'API doit passer par ici avant d'être
// traitée comme un MessageData.
function normalizeMessage(raw: Omit<MessageData, 'embedData'> & { embedData: EmbedData[] | null }): MessageData {
  return { ...raw, embedData: raw.embedData ?? [] };
}

// Discord limite la somme de tous les caractères (titre + description +
// auteur + footer + champs) de TOUS les embeds d'un message à 6000, tous
// embeds confondus — pas seulement par embed.
function totalEmbedChars(embeds: EmbedData[]): number {
  return embeds.reduce((sum, e) => {
    const base = (e.title ?? '').length + (e.description ?? '').length + (e.authorName ?? '').length + (e.footerText ?? '').length;
    const fields = e.fields.reduce((fs, f) => fs + f.name.length + f.value.length, 0);
    return sum + base + fields;
  }, 0);
}

// Formats acceptés par la route d'upload (public/uploads) — même liste côté
// serveur (apps/web/src/app/api/guilds/[id]/upload/route.ts).
const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp', 'gif', 'webp'];
const SUPPORTED_IMAGE_LABEL = 'PNG, JPG, GIF ou WEBP';

async function uploadImageFile(guildId: string, file: File): Promise<{ url: string | null; error?: string }> {
  if (!file.type.startsWith('image/')) {
    return { url: null, error: `Format non supporté (${SUPPORTED_IMAGE_LABEL} uniquement)` };
  }
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/guilds/${guildId}/upload`, { method: 'POST', body: formData });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) return { url: null, error: result.error ?? 'Envoi échoué' };
  return { url: result.url ?? null };
}

// Supprime un fichier uploadé côté serveur (le dossier de la guilde est
// nettoyé automatiquement par la route si elle devient vide) — no-op
// silencieux si l'URL ne pointe pas vers un de nos uploads (image externe).
function deleteServerFile(guildId: string, url: string | null | undefined) {
  if (!url) return;
  fetch(`/api/guilds/${guildId}/upload`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }).catch(() => undefined);
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
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setContentVisible(true);
  }

  function update<K extends keyof MessageData>(key: K, value: MessageData[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // Renomme n'importe quel message (brouillon ou déjà envoyé) en base,
  // indépendamment du bouton "Sauvegarder" et de la sélection courante —
  // cliquer sur un nom dans une des listes suffit, il s'enregistre tout seul.
  function startEditingName(m: MessageData) {
    setEditingNameId(m.id);
    setEditingNameValue(m.name);
  }

  async function commitRename(id: string, rawName: string) {
    if (!id) return;
    const name = rawName.trim() || 'Sans titre';
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

  function handleNameInputChange(id: string, value: string) {
    const name = value.slice(0, 100);
    setEditingNameValue(name);
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => commitRename(id, name), 600);
  }

  function finishEditingName(id: string) {
    if (renameTimer.current) {
      clearTimeout(renameTimer.current);
      renameTimer.current = null;
    }
    commitRename(id, editingNameValue);
    setEditingNameId(null);
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
  }

  function removeEmbed(index: number) {
    const target = draft.embedData[index];
    deleteServerFile(guildId, target?.imageUrl);
    deleteServerFile(guildId, target?.thumbnailUrl);
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
      deleteServerFile(guildId, e.imageUrl);
      deleteServerFile(guildId, e.thumbnailUrl);
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

  const drafts = messages.filter((m) => !m.lastSentMessageId);

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
                          open={imagePopupOpen}
                          onOpenChange={handleImagePopupChange}
                        />
                      </div>
                      <div className="h-7 w-7 shrink-0" />
                    </div>
                  )}

                  {draft.embedData.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {draft.embedData.map((embed, index) => (
                        <div key={index} className="flex flex-1 basis-[260px] items-start gap-1.5">
                        <div className="flex shrink-0 flex-col items-center gap-1">
                          <EmbedColorPicker
                            value={embed.color ?? DEFAULT_EMBED_COLOR}
                            onChange={(v) => updateEmbedAt(index, 'color', v)}
                            compact
                          />
                        </div>

                        <div className="flex min-w-0 flex-1 rounded">
                          <div className="w-1 shrink-0 rounded-l" style={{ backgroundColor: embed.color ?? DEFAULT_EMBED_COLOR }} />
                          <div className="min-w-0 flex-1 space-y-2 rounded-r bg-[#2b2d31] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <input
                                  value={embed.authorName ?? ''}
                                  onChange={(e) => updateEmbedAt(index, 'authorName', e.target.value.slice(0, 256) || null)}
                                  placeholder="Nom de l'auteur"
                                  className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-white outline-none placeholder:text-gray-500"
                                />
                                <div className="relative">
                                  <MentionTextarea
                                    value={embed.title ?? ''}
                                    onChange={(v) => updateEmbedAt(index, 'title', v || null)}
                                    roles={roles}
                                    channels={channels}
                                    rows={1}
                                    maxLength={256}
                                    placeholder="Titre"
                                    className="w-full resize-none border-0 bg-transparent p-0 pr-7 text-base font-bold text-white outline-none placeholder:text-gray-500"
                                  />
                                  <div className="absolute right-0 top-0">
                                    <EmojiPickerButton
                                      guildName={guildName}
                                      guildIconUrl={guildIconUrl}
                                      guildEmojis={guildEmojis}
                                      onPick={(e) =>
                                        updateEmbedAt(index, 'title', ((embed.title ?? '') + e).slice(0, 256))
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="relative">
                                  <MentionTextarea
                                    value={embed.description ?? ''}
                                    onChange={(v) => updateEmbedAt(index, 'description', v || null)}
                                    roles={roles}
                                    channels={channels}
                                    rows={1}
                                    maxLength={4096}
                                    placeholder="Description"
                                    className="w-full resize-none border-0 bg-transparent p-0 pr-7 text-sm text-[#dcddde] outline-none placeholder:text-gray-500"
                                  />
                                  <div className="absolute right-0 top-0">
                                    <EmojiPickerButton
                                      guildName={guildName}
                                      guildIconUrl={guildIconUrl}
                                      guildEmojis={guildEmojis}
                                      onPick={(e) =>
                                        updateEmbedAt(
                                          index,
                                          'description',
                                          ((embed.description ?? '') + e).slice(0, 4000)
                                        )
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  {embed.fields.map((field, i) => (
                                    <div key={i} className="group/field flex items-start gap-1.5">
                                      <div className="min-w-0 flex-1">
                                        <input
                                          value={field.name}
                                          onChange={(e) => {
                                            const fields = [...embed.fields];
                                            fields[i] = { ...fields[i], name: e.target.value.slice(0, 256) };
                                            updateEmbedAt(index, 'fields', fields);
                                          }}
                                          placeholder="Nom du champ"
                                          className="w-full border-0 bg-transparent p-0 text-xs font-semibold text-white outline-none placeholder:text-gray-500"
                                        />
                                        <input
                                          value={field.value}
                                          onChange={(e) => {
                                            const fields = [...embed.fields];
                                            fields[i] = { ...fields[i], value: e.target.value.slice(0, 1024) };
                                            updateEmbedAt(index, 'fields', fields);
                                          }}
                                          placeholder="Valeur du champ"
                                          className="w-full border-0 bg-transparent p-0 text-xs text-gray-400 outline-none placeholder:text-gray-500"
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => updateEmbedAt(index, 'fields', embed.fields.filter((_, idx) => idx !== i))}
                                        className="shrink-0 text-gray-600 opacity-0 transition hover:text-[#ED4245] group-hover/field:opacity-100"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => updateEmbedAt(index, 'fields', [...embed.fields, { name: '', value: '' }])}
                                    className="text-xs text-gray-500 hover:text-white"
                                  >
                                    + Ajouter un champ
                                  </button>
                                </div>
                              </div>

                              <EmbedImageSlot
                                guildId={guildId}
                                value={embed.thumbnailUrl}
                                onChange={(v) => updateEmbedAt(index, 'thumbnailUrl', v)}
                                size="small"
                              />
                            </div>

                            <EmbedImageSlot
                              guildId={guildId}
                              value={embed.imageUrl}
                              onChange={(v) => updateEmbedAt(index, 'imageUrl', v)}
                              size="large"
                            />

                            <div className="flex items-center justify-between gap-3 pt-1">
                              <input
                                value={embed.footerText ?? ''}
                                onChange={(e) => updateEmbedAt(index, 'footerText', e.target.value.slice(0, 2048) || null)}
                                placeholder="Footer"
                                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-gray-400 outline-none placeholder:text-gray-600"
                              />
                              <span className="shrink-0 text-xs text-gray-600">
                                Aujourd&apos;hui à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => removeEmbed(index)}
                            title="Retirer l'embed"
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateEmbed(index)}
                            disabled={draft.embedData.length >= MAX_EMBEDS}
                            title="Dupliquer l'embed"
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        </div>
                      ))}
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
                      ...saved.embedData.flatMap((e) => [e.imageUrl, e.thumbnailUrl]),
                    ].filter(Boolean)
                  );
                  const current = [
                    ...draft.imageUrls,
                    ...draft.embedData.flatMap((e) => [e.imageUrl, e.thumbnailUrl]),
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
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Brouillons</span>
              <button type="button" onClick={createDraft} className="btn-secondary text-xs">
                Nouveau brouillon
              </button>
            </div>
            <div className="space-y-2">
              {drafts.length === 0 && <p className="text-sm text-gray-500">Aucun brouillon.</p>}
              {drafts.map((m) => (
                <div
                  key={m.id}
                  onClick={() => selectMessage(m)}
                  className={`card block w-full cursor-pointer p-3 text-left text-sm transition hover:border-[var(--accent)] ${
                    selectedId === m.id ? 'border-[var(--accent)] text-white' : ''
                  }`}
                >
                  {editingNameId === m.id ? (
                    <input
                      autoFocus
                      value={editingNameValue}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleNameInputChange(m.id, e.target.value)}
                      onBlur={() => finishEditingName(m.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      className="-mx-2 -my-1 w-full rounded border border-[var(--accent)] bg-transparent px-2 py-1 text-sm text-white outline-none"
                    />
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingName(m);
                      }}
                      className="-mx-2 -my-1 block truncate rounded border border-transparent px-2 py-1 transition hover:border-white/20"
                    >
                      {m.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Messages</span>
            <div className="space-y-2">
              {messages.length === 0 && <p className="text-sm text-gray-500">Aucun message.</p>}
              {messages.map((m) => {
                const channel = channels.find((c) => c.id === m.channelId);
                return (
                  <div key={m.id} className="card space-y-2 p-3">
                    {editingNameId === m.id ? (
                      <input
                        autoFocus
                        value={editingNameValue}
                        onChange={(e) => handleNameInputChange(m.id, e.target.value)}
                        onBlur={() => finishEditingName(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="-mx-2 -my-1 w-full rounded border border-[var(--accent)] bg-transparent px-2 py-1 text-sm font-medium text-white outline-none"
                      />
                    ) : (
                      <p
                        onClick={() => startEditingName(m)}
                        className="-mx-2 -my-1 cursor-pointer truncate rounded border border-transparent px-2 py-1 text-sm font-medium text-white transition hover:border-white/20"
                      >
                        {m.name}
                      </p>
                    )}
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

    </div>
  );
}

function EmbedColorPicker({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const swatches = (
    <div className="flex items-center gap-2">
      {EMBED_COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => {
            onChange(c);
            setOpen(false);
          }}
          title={c}
          className={`h-8 w-8 rounded-full border-2 transition ${
            value.toLowerCase() === c.toLowerCase() ? 'border-white' : 'border-white/20'
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <label
        title="Couleur personnalisée"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-white/20 bg-[conic-gradient(from_180deg,#ED4245,#FEE75C,#57F287,#5865F2,#EB459E,#ED4245)]"
      >
        <Palette className="h-4 w-4 text-white drop-shadow" />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="hidden" />
      </label>
    </div>
  );

  if (!compact) return swatches;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Couleur de l'embed"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80"
      >
        <Palette className="h-3.5 w-3.5" style={{ color: value }} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 rounded-lg border border-white/10 bg-[#1a1d23] p-2 shadow-xl">{swatches}</div>
      )}
    </div>
  );
}

// Zone de dépôt/collage pour l'image autonome du message (distincte de
// l'image propre à l'embed, voir EmbedImageSlot) — insérée directement dans
// l'aperçu à la place d'un formulaire séparé.
function InlineImageDropzone({
  guildId,
  onUploaded,
}: {
  guildId: string;
  onUploaded: (urls: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [error, setError] = useState('');

  // Sélection multiple acceptée — au-delà de MAX_IMAGES on prend juste les
  // premières, pas la peine de compliquer avec le nombre de places restantes.
  async function handleUploadFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, MAX_IMAGES);
    if (list.length === 0) return;
    setUploading(true);
    setError('');
    const results = await Promise.all(list.map((file) => uploadImageFile(guildId, file)));
    setUploading(false);
    const ok = results.map((r) => r.url).filter((u): u is string => Boolean(u));
    const failed = results.find((r) => r.error);
    if (failed?.error) setError(failed.error);
    if (ok.length > 0) onUploaded(ok);
  }

  function isValidImageUrl(url: string) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Extension reconnue mais absente de la liste supportée = on prévient tout
  // de suite plutôt que de laisser échouer l'envoi sur Discord plus tard.
  // Pas d'extension du tout (CDN dynamique...) : on laisse passer.
  function hasUnsupportedExtension(url: string) {
    const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(new URL(url).pathname);
    const ext = match?.[1]?.toLowerCase();
    return Boolean(ext) && !SUPPORTED_IMAGE_EXTENSIONS.includes(ext!);
  }

  function submitLink(raw?: string) {
    const url = (raw ?? linkValue).trim();
    if (!url) return;
    if (!isValidImageUrl(url)) {
      setError('Lien invalide.');
      return;
    }
    if (hasUnsupportedExtension(url)) {
      setError(`Format non supporté (${SUPPORTED_IMAGE_LABEL} uniquement)`);
      return;
    }
    setError('');
    onUploaded([url]);
    setLinkValue('');
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#1a1d23] p-3 shadow-xl">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) handleUploadFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed py-8 text-center text-sm transition ${
          dragOver ? 'border-[var(--accent)] text-white' : 'border-white/20 text-gray-400 hover:border-[var(--accent)] hover:text-white'
        }`}
      >
        {uploading ? 'Envoi...' : 'Cliquez ici ou déposez vos images'}
        <input
          type="file"
          accept=".pjp,.jpe,.jpeg,.jpg,.pjpeg,.jfif,.png,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleUploadFiles(e.target.files);
          }}
        />
      </label>
      <div className="mb-1.5 mt-3 flex items-center justify-center gap-1.5">
        <p className="text-center text-xs text-gray-500">ou collez votre image ou lien ici</p>
        <span title="Vous pouvez coller un lien d'image, ou copier une image puis la coller ici.">
          <CircleHelp className="h-3.5 w-3.5 cursor-help text-gray-600" />
        </span>
      </div>
      <input
        value={linkValue}
        onChange={(e) => setLinkValue(e.target.value)}
        onPaste={(e) => {
          if (e.clipboardData.files?.length) {
            e.preventDefault();
            handleUploadFiles(e.clipboardData.files);
            return;
          }
          const text = e.clipboardData.getData('text').trim();
          if (text) {
            e.preventDefault();
            submitLink(text);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitLink();
        }}
        onBlur={() => submitLink()}
        placeholder="Lien d'une image ou image copiée"
        className="input"
      />
      {error && <p className="mt-1.5 text-xs text-[#ED4245]">{error}</p>}
    </div>
  );
}

// Popup d'ajout d'image façon DraftBot : une vraie fenêtre modale centrée
// avec un fond assombri, plutôt qu'un petit menu ancré au bouton.
function ImageUploadModal({
  guildId,
  onUploaded,
  onClose,
}: {
  guildId: string;
  onUploaded: (urls: string[]) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <InlineImageDropzone guildId={guildId} onUploaded={onUploaded} />
      </div>
    </div>
  );
}

// Emplacement image cliquable dans l'embed — grand format pour l'image
// principale, petit carré pour la vignette. Le clic ouvre la même popup de
// dépôt/collage que l'image autonome du message (pas un sélecteur de
// fichier natif) ; un second clic une fois l'image en place la retire.
function EmbedImageSlot({
  guildId,
  value,
  onChange,
  size,
}: {
  guildId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  size: 'small' | 'large';
}) {
  const [open, setOpen] = useState(false);

  if (value) {
    return (
      <div className={`group/img relative shrink-0 overflow-hidden rounded ${size === 'small' ? 'h-16 w-16' : 'w-full'}`}>
        <img src={value} alt="" className={size === 'small' ? 'h-16 w-16 object-cover' : 'max-h-52 w-full object-cover'} />
        <button
          type="button"
          onClick={() => {
            deleteServerFile(guildId, value);
            onChange(null);
          }}
          title="Retirer l'image"
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white opacity-0 transition hover:bg-black/80 group-hover/img:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className={`relative shrink-0 ${size === 'small' ? '' : 'w-full'}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ajouter une image"
        className={`flex items-center justify-center rounded border border-dashed border-white/20 text-gray-600 transition hover:border-[var(--accent)] hover:text-gray-400 ${
          size === 'small' ? 'h-16 w-16' : 'h-32 w-full'
        }`}
      >
        <ImageIcon className={size === 'small' ? 'h-5 w-5' : 'h-6 w-6'} />
      </button>
      {open && (
        <ImageUploadModal
          guildId={guildId}
          onUploaded={(urls) => {
            if (urls[0]) onChange(urls[0]);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// Une vignette d'image de la galerie — recadrée (object-cover) pour remplir
// sa case carrée, sauf en mode "seule" (voir ImageGrid) où elle garde ses
// proportions naturelles sans recadrage.
function ImageTile({
  url,
  index,
  guildId,
  urls,
  onChange,
  dragIndex,
  isDragOver,
  onDragOverTile,
  onOpenChange,
  isLastOverall,
  canAddMore,
  tileClassName,
  imgClassName = 'h-full w-full object-cover rounded',
}: {
  url: string;
  index: number;
  guildId: string;
  urls: string[];
  onChange: (urls: string[]) => void;
  dragIndex: React.MutableRefObject<number | null>;
  isDragOver: boolean;
  onDragOverTile: (index: number | null) => void;
  onOpenChange: (open: boolean) => void;
  isLastOverall: boolean;
  canAddMore: boolean;
  tileClassName: string;
  imgClassName?: string;
}) {
  function removeAt(i: number) {
    deleteServerFile(guildId, urls[i]);
    onChange(urls.filter((_, idx) => idx !== i));
  }

  function moveTo(from: number, to: number) {
    if (from === to) return;
    const next = [...urls];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div
      className={`group/img relative ${tileClassName}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (dragIndex.current !== null && dragIndex.current !== index) onDragOverTile(index);
      }}
      onDragLeave={() => onDragOverTile(null)}
      onDrop={(e) => {
        e.preventDefault();
        if (dragIndex.current !== null) moveTo(dragIndex.current, index);
        dragIndex.current = null;
        onDragOverTile(null);
      }}
    >
      <img src={url} alt="" className={imgClassName} />
      <div
        draggable
        onDragStart={() => {
          dragIndex.current = index;
        }}
        onDragEnd={() => onDragOverTile(null)}
        title="Glisser pour réordonner"
        className="absolute left-1 top-1 flex h-6 w-6 cursor-grab items-center justify-center rounded bg-black/60 text-white opacity-0 transition group-hover/img:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      <button
        type="button"
        onClick={() => removeAt(index)}
        title="Retirer l'image"
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white opacity-0 transition hover:bg-black/80 group-hover/img:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      {isLastOverall && canAddMore && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          title="Ajouter une image"
          className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white opacity-0 transition hover:bg-black/80 group-hover/img:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      {isDragOver && <div className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-full bg-[var(--accent)]" />}
    </div>
  );
}

// Galerie d'images autonomes du message (jusqu'à MAX_IMAGES) — une seule
// image garde ses proportions naturelles, à partir de deux elles deviennent
// des vignettes carrées recadrées, 3 par ligne max (celles d'une ligne
// incomplète s'agrandissent pour la remplir). Chaque vignette se glisse pour
// réordonner (drag & drop HTML5, aucune dépendance).
function ImageGrid({
  guildId,
  urls,
  onChange,
  open,
  onOpenChange,
}: {
  guildId: string;
  urls: string[];
  onChange: (urls: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const canAddMore = urls.length < MAX_IMAGES;
  const single = urls.length === 1;
  // Une seule ligne (2 ou 3 images) : chaque vignette s'agrandit pour
  // remplir toute la largeur. Au-delà, grille fixe à 3 colonnes — une ligne
  // incomplète (ex: la 4e toute seule) reste petite plutôt que de s'étirer.
  const fillsOneRow = urls.length >= 2 && urls.length <= 3;

  return (
    <div className={single || fillsOneRow ? 'flex flex-wrap gap-2' : 'grid grid-cols-3 gap-2'}>
      {urls.map((url, i) => (
        <ImageTile
          key={url + i}
          url={url}
          index={i}
          guildId={guildId}
          urls={urls}
          onChange={onChange}
          dragIndex={dragIndex}
          isDragOver={dragOverIndex === i}
          onDragOverTile={setDragOverIndex}
          onOpenChange={onOpenChange}
          isLastOverall={i === urls.length - 1}
          canAddMore={canAddMore}
          tileClassName={
            single ? 'flex-none max-w-full' : fillsOneRow ? 'aspect-square flex-1' : 'aspect-square'
          }
          imgClassName={single ? 'block h-auto max-h-[400px] w-auto max-w-full rounded' : undefined}
        />
      ))}
      {urls.length === 0 && canAddMore && !open && (
        <div className="relative aspect-square w-full max-w-[280px]">
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            title="Ajouter une image"
            className="flex h-full w-full items-center justify-center rounded border border-dashed border-white/20 text-gray-600 transition hover:border-[var(--accent)] hover:text-gray-400"
          >
            <ImageIcon className="h-6 w-6" />
          </button>
        </div>
      )}
      {open && (
        <ImageUploadModal
          guildId={guildId}
          onUploaded={(newUrls) => {
            onChange([...urls, ...newUrls].slice(0, MAX_IMAGES));
            onOpenChange(false);
          }}
          onClose={() => onOpenChange(false)}
        />
      )}
    </div>
  );
}

