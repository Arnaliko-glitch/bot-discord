'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { FileText, Image as ImageIcon, LayoutGrid, Link2, Plus, Smile, Trash2 } from 'lucide-react';
import { ChannelSelect, type Channel } from '@/components/ChannelSelect';
import {
  BLANK_EMBED,
  deleteServerFile,
  EmbedBlock,
  EmbedImageSlot,
  totalEmbedChars,
  type EmbedData,
} from '@/components/EmbedEditor';
import { EmojiPickerButton } from '@/components/EmojiPickerButton';
import { InlineRenameLabel } from '@/components/InlineRenameLabel';
import { MentionTextarea, type RoleOption as MentionRoleOption } from '@/components/MentionTextarea';
import { RoleSelect, type RoleOption } from '@/components/RoleSelect';
import type { GuildEmoji } from '@/lib/emoji-data';

const EmojiPickerPanel = dynamic(() => import('./EmojiPickerPanel'), { ssr: false });

export interface ReactionRoleMapping {
  emoji: string;
  roleId: string;
}

export interface ReactionRolePanelData {
  id: string;
  name: string;
  channelId: string | null;
  messageId: string | null;
  content: string | null;
  imageUrl: string | null;
  embedData: EmbedData | null;
  mappings: ReactionRoleMapping[];
}

const MAX_MAPPINGS = 20;
type Tab = 'content' | 'image' | 'embed';
const TABS: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: 'content', label: 'Contenu', icon: FileText },
  { key: 'image', label: 'Image', icon: ImageIcon },
  { key: 'embed', label: 'Embed', icon: LayoutGrid },
];

// Un embed "activé" (onglet cliqué) mais resté entièrement vide ne compte
// pas comme un des trois blocs requis pour publier.
function embedHasContent(embed: EmbedData | null): boolean {
  if (!embed) return false;
  return Boolean(
    embed.authorName ||
      embed.title ||
      embed.description ||
      embed.fields.length > 0 ||
      embed.footerText ||
      embed.imageUrl ||
      embed.thumbnailUrl
  );
}

// Rien n'est prérempli — comme le composeur de messages, un embed/une image
// n'existe que si l'utilisateur l'ajoute explicitement via l'onglet
// correspondant.
export function emptyPanelDraft(name: string): ReactionRolePanelData {
  return {
    id: '',
    name,
    channelId: null,
    messageId: null,
    content: null,
    imageUrl: null,
    embedData: null,
    mappings: [],
  };
}

// Même rendu que le glyphe emoji des boutons du composeur de messages —
// affiche l'image de l'emoji personnalisé, ou le caractère unicode tel quel.
function EmojiGlyph({ emoji }: { emoji: string }) {
  const match = /^<(a?):(\w+):(\d+)>$/.exec(emoji);
  if (match) {
    const [, animated, name, id] = match;
    return (
      <img
        src={`https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=32`}
        alt={name}
        className="h-5 w-5"
      />
    );
  }
  return <span className="text-lg leading-none">{emoji}</span>;
}

// Sélecteur d'emoji d'une ligne "rôle réaction" — spécifique à ce module
// (le composeur de messages n'a pas ce concept), pas de facteur possible
// avec EmbedEditor.tsx ici.
function MappingEmojiPicker({
  guildName,
  guildIconUrl,
  guildEmojis,
  value,
  onChange,
}: {
  guildName: string;
  guildIconUrl: string | null;
  guildEmojis: GuildEmoji[];
  value: string;
  onChange: (v: string) => void;
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
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#2b2d31] text-gray-500 transition hover:border-[var(--accent)] hover:text-gray-300"
      >
        {value ? <EmojiGlyph emoji={value} /> : <Smile className="h-4 w-4" />}
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

export function ReactionRolesConfigPage({
  guildId,
  botName,
  botAvatarUrl,
  guildName,
  guildIconUrl,
  initialPanels,
}: {
  guildId: string;
  botName: string;
  botAvatarUrl: string | null;
  guildName: string;
  guildIconUrl: string | null;
  initialPanels: ReactionRolePanelData[];
}) {
  const [panels, setPanels] = useState(initialPanels);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReactionRolePanelData>(emptyPanelDraft(''));
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(emptyPanelDraft('')));
  const [activeTab, setActiveTab] = useState<Tab>('content');
  const [contentVisible, setContentVisible] = useState(true);
  const [imagePopupOpen, setImagePopupOpen] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
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

  function selectPanel(p: ReactionRolePanelData) {
    setSelectedId(p.id);
    setDraft(p);
    setLastSaved(JSON.stringify(p));
    setStatusMessage('');
    // La zone de contenu ne doit réapparaître que si ce panneau en a
    // vraiment un — sinon on écrase le fait de l'avoir volontairement vidée
    // à chaque fois qu'on le rouvre pour le modifier.
    setContentVisible(Boolean(p.content));
    setImagePopupOpen(false);
  }

  // Comme le composeur de messages : fermer la popup sans avoir ajouté
  // d'image ne laisse pas l'emplacement vide affiché.
  function handleImagePopupChange(nextOpen: boolean) {
    setImagePopupOpen(nextOpen);
    if (!nextOpen && !draft.imageUrl) setActiveTab('content');
  }

  function update<K extends keyof ReactionRolePanelData>(key: K, value: ReactionRolePanelData[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function updateEmbed<K extends keyof EmbedData>(key: K, value: EmbedData[K]) {
    setDraft((d) => (d.embedData ? { ...d, embedData: { ...d.embedData, [key]: value } } : d));
  }

  // Toutes les URLs d'image potentiellement en jeu pour un état donné du
  // panneau (image autonome + les 4 emplacements de l'embed) — sert au
  // nettoyage différé (voir isSavedImageUrl et save()), même principe que le
  // composeur de messages.
  function imageUrlsOf(p: ReactionRolePanelData): (string | null)[] {
    return [
      p.imageUrl,
      p.embedData?.imageUrl ?? null,
      p.embedData?.thumbnailUrl ?? null,
      p.embedData?.authorIconUrl ?? null,
      p.embedData?.footerIconUrl ?? null,
    ];
  }

  function isSavedImageUrl(url: string | null): boolean {
    if (!url) return false;
    return imageUrlsOf(JSON.parse(lastSaved) as ReactionRolePanelData).includes(url);
  }

  // Chaque clic sur un onglet révèle/ajoute la section correspondante — pas
  // un sélecteur à vue unique, les sections restent toutes visibles ensemble
  // une fois ajoutées (comme Contenu/Image/Embed dans le composeur de
  // messages).
  function selectTab(tab: Tab) {
    setActiveTab(tab);
    if (tab === 'content') setContentVisible(true);
    // Ouvre directement la popup d'ajout, comme le composeur de messages —
    // pas la peine d'un second clic sur l'emplacement vide qui vient d'apparaître.
    if (tab === 'image' && !draft.imageUrl) setImagePopupOpen(true);
    if (tab === 'embed' && !draft.embedData) update('embedData', { ...BLANK_EMBED });
  }

  function removeEmbedSection() {
    if (draft.embedData) {
      for (const url of [draft.embedData.imageUrl, draft.embedData.thumbnailUrl, draft.embedData.authorIconUrl, draft.embedData.footerIconUrl]) {
        if (url && !isSavedImageUrl(url)) deleteServerFile(guildId, url);
      }
    }
    update('embedData', null);
  }

  function updateMapping(index: number, patch: Partial<ReactionRoleMapping>) {
    setDraft((d) => ({ ...d, mappings: d.mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)) }));
  }

  function addMapping() {
    setDraft((d) => (d.mappings.length >= MAX_MAPPINGS ? d : { ...d, mappings: [...d.mappings, { emoji: '', roleId: '' }] }));
  }

  function removeMapping(index: number) {
    setDraft((d) => ({ ...d, mappings: d.mappings.filter((_, i) => i !== index) }));
  }

  async function createDraft() {
    const res = await fetch(`/api/guilds/${guildId}/reaction-roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return;
    const created = (await res.json()) as ReactionRolePanelData;
    setPanels((list) => [created, ...list]);
    selectPanel(created);
  }

  // Renomme n'importe quel panneau en base indépendamment de la sélection
  // courante — cliquer sur un nom dans la liste suffit, il s'enregistre tout
  // seul (même comportement que le module Messages). Le débounce/l'état
  // d'édition vivent dans InlineRenameLabel, ici on ne fait que persister.
  async function commitRename(id: string, name: string) {
    const res = await fetch(`/api/guilds/${guildId}/reaction-roles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const updated = (await res.json()) as ReactionRolePanelData;
    setPanels((list) => list.map((item) => (item.id === updated.id ? updated : item)));
    if (draft.id === updated.id) {
      setDraft((d) => ({ ...d, name: updated.name }));
      setLastSaved((prev) => JSON.stringify({ ...JSON.parse(prev), name: updated.name }));
    }
  }

  async function save(): Promise<ReactionRolePanelData | null> {
    if (!draft.id) return null;
    setSaving(true);
    setStatusMessage('');
    const previous = JSON.parse(lastSaved) as ReactionRolePanelData;
    const res = await fetch(`/api/guilds/${guildId}/reaction-roles/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!res.ok) {
      setStatusMessage("❌ Erreur lors de l'enregistrement");
      return null;
    }
    const updated = (await res.json()) as ReactionRolePanelData;
    // Les images de l'ancienne version qui ne servent plus nulle part
    // deviennent orphelines maintenant que le changement est confirmé — seul
    // moment où on peut les supprimer sans casser un "Annuler" fait avant.
    const kept = new Set(imageUrlsOf(updated).filter(Boolean));
    for (const url of imageUrlsOf(previous)) {
      if (url && !kept.has(url)) deleteServerFile(guildId, url);
    }
    setPanels((list) => list.map((p) => (p.id === updated.id ? updated : p)));
    setDraft(updated);
    setLastSaved(JSON.stringify(updated));
    setStatusMessage('✅ Enregistré');
    return updated;
  }

  async function publish() {
    if (!draft.channelId) {
      setStatusMessage('❌ Choisissez un salon avant de publier.');
      return;
    }
    if (draft.mappings.length === 0 || draft.mappings.some((m) => !m.emoji || !m.roleId)) {
      setStatusMessage('❌ Ajoutez au moins un rôle réaction complet (emoji + rôle).');
      return;
    }
    if (!draft.content?.trim() && !draft.imageUrl && !embedHasContent(draft.embedData)) {
      setStatusMessage('❌ Remplissez au moins un des trois : Contenu, Image ou Embed.');
      return;
    }
    setPublishing(true);
    const saved = await save();
    if (!saved) {
      setPublishing(false);
      return;
    }
    const res = await fetch(`/api/guilds/${guildId}/reaction-roles/${saved.id}/publish`, { method: 'POST' });
    const raw = await res.json().catch(() => ({}));
    setPublishing(false);
    if (!res.ok) {
      setStatusMessage(`❌ ${raw.error ?? 'Publication échouée'}`);
      return;
    }
    const updated = raw as ReactionRolePanelData;
    setPanels((list) => list.map((p) => (p.id === updated.id ? updated : p)));
    setDraft(updated);
    setLastSaved(JSON.stringify(updated));
    setStatusMessage('✅ Publié sur Discord !');
  }

  async function deletePanel(p: ReactionRolePanelData) {
    if (!window.confirm(`Supprimer "${p.name}" ?`)) return;
    const res = await fetch(`/api/guilds/${guildId}/reaction-roles/${p.id}`, { method: 'DELETE' });
    if (!res.ok) return;
    imageUrlsOf(p).forEach((url) => deleteServerFile(guildId, url));
    setPanels((list) => list.filter((item) => item.id !== p.id));
    if (selectedId === p.id) {
      const next = panels.find((item) => item.id !== p.id) ?? null;
      if (next) selectPanel(next);
      else {
        setSelectedId(null);
        setDraft(emptyPanelDraft(''));
        setLastSaved(JSON.stringify(emptyPanelDraft('')));
      }
    }
  }

  const isDirty = JSON.stringify(draft) !== lastSaved;
  const mentionRoles = roles as unknown as MentionRoleOption[];

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white">Rôles-Réactions</h1>
        <p className="mt-1 text-sm text-gray-500">
          Rôles sélectionnables par réactions : autonomie des membres et configuration simple.
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

              {!draft.id ? (
                <p className="text-sm text-gray-500">Créez ou sélectionnez un rôle réaction pour commencer.</p>
              ) : (
                <div className="max-w-[600px] space-y-3">
                  {contentVisible && (
                    <div className="flex items-start gap-1.5">
                      <div className="h-7 w-7 shrink-0" />
                      <div className="relative min-w-0 flex-1 rounded-lg bg-[#2b2d31] p-3">
                        <MentionTextarea
                          value={draft.content ?? ''}
                          onChange={(v) => update('content', v || null)}
                          roles={mentionRoles}
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

                  {(draft.imageUrl || activeTab === 'image') && (
                    <div className="flex items-start gap-1.5">
                      <div className="h-7 w-7 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <EmbedImageSlot
                          guildId={guildId}
                          value={draft.imageUrl}
                          onChange={(v) => update('imageUrl', v)}
                          isSavedUrl={isSavedImageUrl}
                          size="large"
                          open={imagePopupOpen}
                          onOpenChange={handleImagePopupChange}
                        />
                      </div>
                      <div className="h-7 w-7 shrink-0" />
                    </div>
                  )}

                  {draft.embedData && (
                    <div className="flex flex-wrap gap-2">
                      <EmbedBlock
                        embed={draft.embedData}
                        onUpdate={updateEmbed}
                        onRemove={removeEmbedSection}
                        guildId={guildId}
                        roles={roles}
                        channels={channels}
                        guildEmojis={guildEmojis}
                        guildName={guildName}
                        guildIconUrl={guildIconUrl}
                        isSavedUrl={isSavedImageUrl}
                      />
                    </div>
                  )}
                </div>
              )}

              {draft.id && (
                <div className="text-right text-[11px] leading-tight text-gray-500">
                  <p>{(draft.content ?? '').length}/2000</p>
                  {draft.embedData && <p>{totalEmbedChars([draft.embedData])}/6000</p>}
                </div>
              )}

              {draft.id && (
                <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-3">
                  {TABS.filter((tab) => {
                    if (tab.key === 'content') return !contentVisible;
                    if (tab.key === 'image') return !draft.imageUrl;
                    if (tab.key === 'embed') return !draft.embedData;
                    return true;
                  }).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => selectTab(tab.key)}
                      className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:text-white"
                    >
                      <tab.icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {draft.id && (
            <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
              {statusMessage && <p className="text-sm">{statusMessage}</p>}
              <button
                type="button"
                onClick={save}
                disabled={!isDirty || saving}
                className="rounded-lg border border-white/10 bg-[#f5f0e6] px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={publishing || !draft.channelId}
                className="btn-primary disabled:opacity-50"
              >
                {publishing ? 'Publication...' : draft.messageId ? 'Mettre à jour' : 'Publier'}
              </button>
            </div>
          )}

          {draft.id && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rôles réactions</span>
                <button
                  type="button"
                  onClick={addMapping}
                  disabled={draft.mappings.length >= MAX_MAPPINGS}
                  className="btn-secondary text-xs disabled:opacity-50"
                >
                  <Plus className="mr-1 inline h-3.5 w-3.5" />
                  Ajouter un rôle réaction
                </button>
              </div>

              {draft.mappings.length === 0 ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-white/20 p-6 text-sm text-gray-500">
                  Vous n&apos;avez créé aucun rôle réaction.
                </div>
              ) : (
                <div className="space-y-2">
                  {draft.mappings.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#2b2d31] p-2">
                      <MappingEmojiPicker
                        guildName={guildName}
                        guildIconUrl={guildIconUrl}
                        guildEmojis={guildEmojis}
                        value={m.emoji}
                        onChange={(v) => updateMapping(i, { emoji: v })}
                      />
                      <div className="min-w-0 flex-1">
                        <RoleSelect
                          label=""
                          roles={roles}
                          value={m.roleId}
                          onChange={(v) => updateMapping(i, { roleId: v })}
                          placeholder="Choisir un rôle"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMapping(i)}
                        className="shrink-0 text-gray-600 transition hover:text-[#ED4245]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
              {panels.length === 0 && <p className="text-sm text-gray-500">Aucun rôle réaction.</p>}
              {panels.map((p) => {
                const channel = channels.find((c) => c.id === p.channelId);
                return (
                  <div key={p.id} className="card space-y-2 p-3">
                    <InlineRenameLabel value={p.name} onCommit={(name) => commitRename(p.id, name)} />
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      {p.messageId ? <span className="text-[#57F287]">✓</span> : <Link2 className="h-3 w-3" />}
                      <span className="truncate">{channel ? `#${channel.name}` : 'Aucun salon'}</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => selectPanel(p)} className="btn-secondary flex-1 text-xs">
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePanel(p)}
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
