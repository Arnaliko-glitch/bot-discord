'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Palette, Slash } from 'lucide-react';
import { Poppins } from 'next/font/google';
import { ChannelSelect, type Channel } from '@/components/ChannelSelect';
import { EmojiPickerButton } from '@/components/EmojiPickerButton';
import { MentionTextarea, renderMentionText, type RoleOption } from '@/components/MentionTextarea';
import type { GuildEmoji } from '@/lib/emoji-data';
import { useUnsavedChanges } from '@/lib/unsaved-changes-context';

// Même police (Poppins ExtraBold) que la bannière générée côté bot
// (packages/bot/src/utils/welcomeBanner.ts) — pour que l'aperçu du dashboard
// corresponde exactement à l'image réellement envoyée sur Discord.
const bannerFont = Poppins({ subsets: ['latin'], weight: '800' });

// Miroir des colonnes réelles de WelcomeConfig en base (voir schema.prisma).
// useEmbed/goodbyeUseEmbed ne sont pas exposés : le message est toujours
// envoyé en embed, pas de bascule pour l'instant.
interface WelcomeConfigData {
  enabled: boolean;
  channelId: string | null;
  message: string;
  mentionUser: boolean;
  backgroundColor: string;
  backgroundImage: string | null;
  backgroundOverlay: boolean;
  embedTitle: string | null;
  embedFooter: string | null;
  sidebarColor: string;
  goodbyeEnabled: boolean;
  goodbyeChannelId: string | null;
  goodbyeMessage: string;
  goodbyeMentionUser: boolean;
  goodbyeBackgroundColor: string;
  goodbyeBackgroundImage: string | null;
  goodbyeBackgroundOverlay: boolean;
  goodbyeEmbedTitle: string | null;
  goodbyeEmbedFooter: string | null;
  goodbyeSidebarColor: string;
}

const DEFAULT_CONFIG: WelcomeConfigData = {
  enabled: false,
  channelId: null,
  message: 'Bienvenue {user} sur **{server}** ! Tu es le membre n°{server.membercount}.',
  mentionUser: true,
  backgroundColor: '#57F287',
  backgroundImage: null,
  backgroundOverlay: true,
  embedTitle: 'Ho ! Un nouveau membre !',
  embedFooter: null,
  sidebarColor: '#dc2626',
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  goodbyeMessage: '{user} a quitté **{server}**.',
  goodbyeMentionUser: false,
  goodbyeBackgroundColor: '#ED4245',
  goodbyeBackgroundImage: null,
  goodbyeBackgroundOverlay: true,
  goodbyeEmbedTitle: 'Un membre vient de partir...',
  goodbyeEmbedFooter: null,
  goodbyeSidebarColor: '#dc2626',
};

const COLOR_SWATCHES = ['#ED4245', '#57F287', '#5865F2'];

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

// Couleur de la barre latérale de l'embed (bienvenue/au revoir) — toujours
// une vraie couleur (pas d'option "Aucune", contrairement au fond de la
// bannière : un embed a nécessairement une couleur).
function EmbedColorSwatches({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={`h-8 w-8 rounded-full border-2 transition ${
            value.toLowerCase() === c.toLowerCase() ? 'border-white' : 'border-white/20'
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <button
        type="button"
        onClick={() => colorInputRef.current?.click()}
        title="Couleur personnalisée"
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/20 bg-[conic-gradient(from_180deg,#ED4245,#FEE75C,#57F287,#5865F2,#EB459E,#ED4245)]"
      >
        <Palette className="h-4 w-4 text-white drop-shadow" />
      </button>
      <input ref={colorInputRef} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="hidden" />
    </div>
  );
}

// Rend le fond configuré (image > couleur > dégradé par défaut) + le calque
// de lisibilité optionnel — partagé entre la bannière live et l'aperçu du
// modal d'édition.
function backgroundStyle(
  isWelcome: boolean,
  backgroundImage: string | null,
  backgroundColor: string
): React.CSSProperties {
  if (backgroundImage) {
    return { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  if (backgroundColor !== 'none') return { backgroundColor };
  return {};
}

// Avatar + le texte fixe de la bannière ("Bienvenue sur le serveur Discord" +
// nom du serveur) — distinct du titre personnalisable de l'embed (ex: "Ho !
// Un nouveau membre !"), les deux coexistent, ce n'est pas un doublon.
// Partagé entre l'aperçu live (BannerPreview) et le modal d'édition.
function BannerVisual({ kind, avatarUrl, guildName }: { kind: 'welcome' | 'goodbye'; avatarUrl: string; guildName: string }) {
  const isWelcome = kind === 'welcome';
  return (
    <div className="relative flex h-full items-center gap-5 px-7">
      <img
        src={avatarUrl}
        alt=""
        className="h-[112px] w-[112px] shrink-0 rounded-full"
        style={{ boxShadow: '0 0 0 4px #ffffff' }}
      />
      <div className={`min-w-0 text-white ${bannerFont.className}`}>
        <p className="text-[38px] leading-[1.05]">{isWelcome ? 'Bienvenue' : 'À bientôt'}</p>
        <p className="text-[18px] leading-tight text-white/85">sur le serveur Discord</p>
        <p className="truncate text-[36px] leading-[1.3]">{guildName}</p>
      </div>
    </div>
  );
}

function BannerPreview({
  kind,
  avatarUrl,
  guildName,
  backgroundImage,
  backgroundColor,
  backgroundOverlay,
  onEdit,
}: {
  kind: 'welcome' | 'goodbye';
  avatarUrl: string;
  guildName: string;
  backgroundImage: string | null;
  backgroundColor: string;
  backgroundOverlay: boolean;
  onEdit: () => void;
}) {
  const isWelcome = kind === 'welcome';
  const hasCustomBg = !!backgroundImage || backgroundColor !== 'none';
  return (
    <button
      type="button"
      onClick={onEdit}
      className={`group relative h-[150px] w-full overflow-hidden rounded text-left ${
        hasCustomBg ? '' : isWelcome ? 'bg-gradient-to-br from-[#2f9e44] to-[#37b24d]' : 'bg-gradient-to-br from-[#c92a2a] to-[#e03131]'
      }`}
      style={backgroundStyle(isWelcome, backgroundImage, backgroundColor)}
    >
      {backgroundOverlay && hasCustomBg && <div className="absolute inset-0 bg-black/40" />}
      <BannerVisual kind={kind} avatarUrl={avatarUrl} guildName={guildName} />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-900 transition group-hover:bg-white">
        Modifier
      </span>
    </button>
  );
}

interface BackgroundData {
  backgroundImage: string | null;
  backgroundColor: string;
  backgroundOverlay: boolean;
}

function BannerEditorModal({
  guildId,
  kind,
  avatarUrl,
  guildName,
  initial,
  onCancel,
  onSave,
}: {
  guildId: string;
  kind: 'welcome' | 'goodbye';
  avatarUrl: string;
  guildName: string;
  initial: BackgroundData;
  onCancel: () => void;
  onSave: (data: BackgroundData) => void;
}) {
  // Ouvre sur l'onglet qui correspond à ce qui est déjà configuré, avec la
  // couleur/l'image actuelle déjà sélectionnée.
  const [tab, setTab] = useState<'image' | 'color'>(
    initial.backgroundImage ? 'image' : initial.backgroundColor !== 'none' ? 'color' : 'image'
  );
  const [draftImage, setDraftImage] = useState(initial.backgroundImage);
  const [draftColor, setDraftColor] = useState(initial.backgroundColor);
  const [uploading, setUploading] = useState(false);
  // Pré-rempli le champ URL si l'image actuelle en est déjà une (par
  // opposition à un fichier uploadé, dont le chemin /uploads/... n'a pas sa
  // place dans ce champ).
  const [urlInput, setUrlInput] = useState(
    initial.backgroundImage && /^https?:\/\//i.test(initial.backgroundImage) ? initial.backgroundImage : ''
  );
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Supprime un fichier uploadé côté serveur (no-op silencieux si l'URL ne
  // pointe pas vers un upload à nous, ex: pas encore de fichier).
  function deleteServerFile(url: string | null) {
    if (!url) return;
    fetch(`/api/guilds/${guildId}/upload`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).catch(() => undefined);
  }

  async function handleFile(file: File) {
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/guilds/${guildId}/upload`, { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Échec de l'upload");
        return;
      }
      const data = await res.json();
      // Remplace un upload déjà fait dans cette session (pas encore
      // enregistré) : le précédent devient orphelin, on le supprime. On ne
      // touche jamais à l'image déjà enregistrée (initial.backgroundImage)
      // ici — seulement au moment d'Annuler ou d'Enregistrer.
      if (draftImage && draftImage !== initial.backgroundImage) deleteServerFile(draftImage);
      setDraftImage(data.url);
      setUrlInput(''); // Le fond vient d'un fichier uploadé, pas d'une URL.
    } finally {
      setUploading(false);
    }
  }

  // Alternative à l'upload : coller directement une URL d'image (pratique en
  // local, où le serveur web n'est pas accessible depuis l'extérieur pour un
  // fichier uploadé). L'URL est stockée telle quelle, sans passer par /upload.
  // On garde le champ rempli avec l'URL en cours (pas de reset à vide) pour
  // qu'il reste cohérent avec l'aperçu tant qu'on ne change pas de source.
  function handleUseUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      setError("L'URL doit commencer par http:// ou https://");
      return;
    }
    setError('');
    if (draftImage && draftImage !== initial.backgroundImage) deleteServerFile(draftImage);
    setDraftImage(trimmed);
  }

  // Choisir une couleur remplace l'image en cours — un seul fond actif à la
  // fois. L'ancienne image n'est supprimée du serveur immédiatement que si
  // elle n'a jamais été enregistrée (upload fait dans cette session) ; sinon
  // la suppression est différée à la sauvegarde globale (voir save() dans
  // WelcomeConfigPage), pour que "Annuler" reste sans effet.
  function handlePickColor(color: string) {
    if (draftImage && draftImage !== initial.backgroundImage) deleteServerFile(draftImage);
    setDraftImage(null);
    setUrlInput('');
    setDraftColor(color);
  }

  function handleRemoveImage() {
    if (draftImage && draftImage !== initial.backgroundImage) deleteServerFile(draftImage);
    setUrlInput('');
    setDraftImage(null);
  }

  function handleCancel() {
    // Upload fait dans cette session mais jamais enregistré : orphelin, on le nettoie.
    if (draftImage && draftImage !== initial.backgroundImage) deleteServerFile(draftImage);
    onCancel();
  }

  function handleSave() {
    // L'ancienne image (initial.backgroundImage) n'est PAS supprimée ici :
    // tant que la sauvegarde globale de la page n'a pas eu lieu, on doit
    // pouvoir revenir dessus via "Réinitialiser" — le nettoyage se fait au
    // moment de la sauvegarde globale (voir save() dans WelcomeConfigPage).
    onSave({ backgroundImage: draftImage, backgroundColor: draftColor, backgroundOverlay: initial.backgroundOverlay });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={handleCancel}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#1a1d23] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex border-b border-white/10">
          <button
            type="button"
            onClick={() => setTab('image')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              tab === 'image' ? 'border-b-2 border-[var(--accent)] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Image de fond
          </button>
          <button
            type="button"
            onClick={() => setTab('color')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              tab === 'color' ? 'border-b-2 border-[var(--accent)] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Couleur de fond
          </button>
        </div>

        <div className="p-5">
          <div
            className="relative h-[150px] overflow-hidden rounded-lg border border-white/10"
            style={backgroundStyle(true, draftImage, tab === 'color' ? draftColor : 'none')}
          >
            {initial.backgroundOverlay && (tab === 'color' ? draftImage || draftColor !== 'none' : draftImage) && (
              <div className="absolute inset-0 bg-black/40" />
            )}
            <BannerVisual kind={kind} avatarUrl={avatarUrl} guildName={guildName} />
          </div>

          {tab === 'image' && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleUseUrl();
                  }
                }}
                placeholder="Ou coller une URL d'image (https://...)"
                className="input flex-1 text-sm"
              />
              <button type="button" onClick={handleUseUrl} className="btn-secondary shrink-0 text-sm">
                Utiliser
              </button>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-[#ED4245]">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-white/10 px-5 py-3">
          <div className="flex items-center gap-3">
            {tab === 'image' ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary text-sm"
                  disabled={uploading}
                >
                  {uploading ? 'Envoi...' : 'Charger une image'}
                </button>
                {draftImage && (
                  <button type="button" onClick={handleRemoveImage} className="text-sm text-gray-500 hover:text-gray-300">
                    Retirer l&apos;image
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handlePickColor('none')}
                  title="Aucune"
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-[#2b2d31] transition ${
                    draftColor === 'none' ? 'border-white' : 'border-white/20'
                  }`}
                >
                  <Slash className="h-4 w-4 text-gray-400" />
                </button>
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handlePickColor(c)}
                    title={c}
                    className={`h-8 w-8 rounded-full border-2 transition ${
                      draftColor.toLowerCase() === c.toLowerCase() ? 'border-white' : 'border-white/20'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => colorInputRef.current?.click()}
                  title="Couleur personnalisée"
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/20 bg-[conic-gradient(from_180deg,#ED4245,#FEE75C,#57F287,#5865F2,#EB459E,#ED4245)]"
                >
                  <Palette className="h-4 w-4 text-white drop-shadow" />
                </button>
                <input
                  ref={colorInputRef}
                  type="color"
                  value={draftColor === 'none' ? '#000000' : draftColor}
                  onChange={(e) => handlePickColor(e.target.value)}
                  className="hidden"
                />
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button type="button" onClick={handleCancel} className="text-sm text-gray-400 hover:text-gray-200">
              Annuler
            </button>
            <button type="button" onClick={handleSave} className="btn-primary text-sm">
              {tab === 'image' ? 'Enregistrer' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessagePreview({
  botName,
  botAvatarUrl,
  now,
  mentionLine,
  kind,
  avatarUrl,
  guildName,
  background,
  embedColor,
  embedTitle,
  embedDescription,
  embedFooter,
  roles,
  channels,
  previewUsername,
  onEditBackground,
}: {
  botName: string;
  botAvatarUrl: string | null;
  now: string;
  mentionLine: string | null;
  kind: 'welcome' | 'goodbye';
  avatarUrl: string;
  guildName: string;
  background: BackgroundData;
  embedColor: string;
  embedTitle: string;
  embedDescription: string;
  embedFooter: string;
  roles: RoleOption[];
  channels: Channel[];
  previewUsername: string;
  onEditBackground: () => void;
}) {
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
      {mentionLine && <p className="text-sm text-[#00a8fc]">{mentionLine}</p>}

      {/* L'embed réellement envoyé : bande de couleur + titre + description +
          bannière (image de fond + avatar) + pied de page. */}
      <div className="flex overflow-hidden rounded">
        <div className="w-1 shrink-0" style={{ backgroundColor: embedColor }} />
        <div className="min-w-0 flex-1 space-y-2 bg-[#2b2d31] p-3">
          {embedTitle && <p className="text-base font-semibold text-white">{embedTitle}</p>}
          {embedDescription && (
            <p className="whitespace-pre-wrap text-sm text-[#dcddde]">
              {renderMentionText(embedDescription, roles, channels, { id: '0', name: previewUsername })}
            </p>
          )}
          <BannerPreview
            kind={kind}
            avatarUrl={avatarUrl}
            guildName={guildName}
            backgroundImage={background.backgroundImage}
            backgroundColor={background.backgroundColor}
            backgroundOverlay={background.backgroundOverlay}
            onEdit={onEditBackground}
          />
          {embedFooter && <p className="text-xs text-gray-500">{embedFooter}</p>}
        </div>
      </div>
    </div>
  );
}

export function WelcomeConfigPage({
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
  initial?: WelcomeConfigData;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [config, setConfig] = useState<WelcomeConfigData>(initial ?? DEFAULT_CONFIG);
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(initial ?? DEFAULT_CONFIG));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingBannerKind, setEditingBannerKind] = useState<'welcome' | 'goodbye' | null>(null);
  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const router = useRouter();

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

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guilds/${guildId}/roles`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: RoleOption[]) => {
        if (!cancelled) setRoles(list);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  // Chargé ici (avec salons/rôles) plutôt qu'à l'ouverture du picker : sinon
  // le premier clic sur l'emoji déclenchait un aller-retour réseau visible
  // avant même de pouvoir commencer à charger les images, au lieu d'être
  // déjà prêt.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guilds/${guildId}/emojis`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: GuildEmoji[]) => {
        if (cancelled) return;
        setGuildEmojis(list);
        // Précharge les images tout de suite (navigateur les met en cache)
        // plutôt qu'au moment où le picker s'ouvre — sinon les ~50 emojis du
        // serveur se chargeaient tous d'un coup au premier clic, visible
        // comme un temps de latence.
        for (const e of list) {
          const img = new Image();
          img.src = `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=48`;
        }
      })
      .catch(() => {
        if (!cancelled) setGuildEmojis([]);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  function update<K extends keyof WelcomeConfigData>(key: K, value: WelcomeConfigData[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  const isDirty = JSON.stringify(config) !== lastSaved;

  // Bloque la navigation vers un autre module (voir DashboardShell) et
  // avertit avant de fermer/rafraîchir l'onglet tant qu'il reste des
  // modifications non enregistrées sur cette page.
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

  // Supprime un fichier uploadé côté serveur (no-op silencieux, ex: URL externe).
  function deleteServerFile(url: string) {
    fetch(`/api/guilds/${guildId}/upload`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).catch(() => undefined);
  }

  function resetConfig() {
    const saved = JSON.parse(lastSaved) as WelcomeConfigData;
    // Une image vient d'être uploadée via le modal mais jamais enregistrée :
    // elle devient orpheline dès qu'on revient à l'état sauvegardé.
    if (config.backgroundImage && config.backgroundImage !== saved.backgroundImage) {
      deleteServerFile(config.backgroundImage);
    }
    if (config.goodbyeBackgroundImage && config.goodbyeBackgroundImage !== saved.goodbyeBackgroundImage) {
      deleteServerFile(config.goodbyeBackgroundImage);
    }
    setConfig(saved);
    setMessage('');
  }

  async function save() {
    setSaving(true);
    setMessage('');
    const previous = JSON.parse(lastSaved) as WelcomeConfigData;
    const res = await fetch(`/api/guilds/${guildId}/welcome`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      // La sauvegarde a réussi : l'ancienne image (si remplacée ou retirée)
      // ne sert plus à rien, on peut enfin la supprimer du serveur.
      if (previous.backgroundImage && previous.backgroundImage !== config.backgroundImage) {
        deleteServerFile(previous.backgroundImage);
      }
      if (previous.goodbyeBackgroundImage && previous.goodbyeBackgroundImage !== config.goodbyeBackgroundImage) {
        deleteServerFile(previous.goodbyeBackgroundImage);
      }
      setLastSaved(JSON.stringify(config));
      setMessage('✅ Enregistré');
      // Invalide le cache de navigation de cette route côté client : sinon,
      // en revenant sur ce module après être passé par un autre, Next.js
      // réaffichait la version mise en cache (d'avant la sauvegarde) au lieu
      // de recharger les données fraîches depuis la base.
      router.refresh();
    } else {
      setMessage("❌ Erreur lors de l'enregistrement");
    }
    setSaving(false);
  }

  function applyBackground(kind: 'welcome' | 'goodbye', data: BackgroundData) {
    if (kind === 'welcome') {
      setConfig((c) => ({
        ...c,
        backgroundImage: data.backgroundImage,
        backgroundColor: data.backgroundColor,
        backgroundOverlay: data.backgroundOverlay,
      }));
    } else {
      setConfig((c) => ({
        ...c,
        goodbyeBackgroundImage: data.backgroundImage,
        goodbyeBackgroundColor: data.backgroundColor,
        goodbyeBackgroundOverlay: data.backgroundOverlay,
      }));
    }
    setEditingBannerKind(null);
  }

  // `asTag` produit le vrai tag de mention (<@0>, résolu en pastille bleue
  // par renderMentionText) — utilisé uniquement pour la description, seul
  // champ où Discord résout réellement les mentions (titre/pied de page
  // restent du texte brut côté bot, donc pareil ici).
  function previewText(template: string, mention: boolean, asTag = false) {
    const userText = mention ? (asTag ? '<@0>' : `@${previewUsername}`) : previewUsername;
    return template
      .replaceAll('{user}', userText)
      .replaceAll('{server}', guildName)
      .replaceAll('{server.membercount}', '128');
  }

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white">Arrivées et Départs</h1>
      </div>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_540px]">
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-white">Message de Bienvenue</h2>
              <p className="text-sm text-gray-500">Configurez des messages de bienvenue pour les nouveaux membres.</p>
            </div>
            <Toggle checked={config.enabled} onChange={(v) => update('enabled', v)} />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Salon des messages de bienvenue
            </span>
            <ChannelSelect
              label=""
              channels={channels}
              value={config.channelId ?? ''}
              onChange={(v) => update('channelId', v || null)}
              loading={channelsLoading}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Couleur de l&apos;embed
            </span>
            <EmbedColorSwatches value={config.sidebarColor} onChange={(v) => update('sidebarColor', v)} />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Titre de l&apos;embed
            </span>
            <input
              type="text"
              value={config.embedTitle ?? ''}
              onChange={(e) => update('embedTitle', e.target.value.slice(0, 256) || null)}
              placeholder="Bienvenue sur le serveur Discord"
              className="input"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Message personnalisé
            </span>
            <div className="relative">
              <MentionTextarea
                value={config.message}
                onChange={(v) => update('message', v)}
                roles={roles}
                channels={channels}
                rows={4}
                maxLength={4000}
                className="input resize-none pr-9"
              />
              <div className="absolute right-2 top-2">
                <EmojiPickerButton
                  guildName={guildName}
                  guildIconUrl={guildIconUrl}
                  guildEmojis={guildEmojis}
                  onPick={(e) => update('message', (config.message + e).slice(0, 4000))}
                />
              </div>
            </div>
            <p className="mt-1 text-right text-xs text-gray-500">{config.message.length} /4000</p>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pied de page
            </span>
            <input
              type="text"
              value={config.embedFooter ?? ''}
              onChange={(e) => update('embedFooter', e.target.value.slice(0, 2048) || null)}
              placeholder="Facultatif"
              className="input"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <Toggle checked={config.mentionUser} onChange={(v) => update('mentionUser', v)} />
            <span className="text-sm text-gray-400">
              Notifier le membre (ping séparé) — {'{user}'} s&apos;affiche de toute façon comme une mention.
            </span>
          </label>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Prévisualisation
          </span>
          <MessagePreview
            botName={botName}
            botAvatarUrl={botAvatarUrl}
            now={now}
            mentionLine={config.mentionUser ? `@${previewUsername}` : null}
            kind="welcome"
            avatarUrl={previewAvatarUrl}
            guildName={guildName}
            background={{
              backgroundImage: config.backgroundImage,
              backgroundColor: config.backgroundColor,
              backgroundOverlay: config.backgroundOverlay,
            }}
            embedColor={config.sidebarColor}
            embedTitle={previewText(config.embedTitle ?? '', false)}
            embedDescription={previewText(config.message, true, true)}
            embedFooter={previewText(config.embedFooter ?? '', false)}
            roles={roles}
            channels={channels}
            previewUsername={previewUsername}
            onEditBackground={() => setEditingBannerKind('welcome')}
          />
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_540px]">
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-white">Message d&apos;Au Revoir</h2>
              <p className="text-sm text-gray-500">Configurez des messages d&apos;au revoir pour les anciens membres.</p>
            </div>
            <Toggle checked={config.goodbyeEnabled} onChange={(v) => update('goodbyeEnabled', v)} />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Salon des messages d&apos;au revoir
            </span>
            <ChannelSelect
              label=""
              channels={channels}
              value={config.goodbyeChannelId ?? ''}
              onChange={(v) => update('goodbyeChannelId', v || null)}
              loading={channelsLoading}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Couleur de l&apos;embed
            </span>
            <EmbedColorSwatches value={config.goodbyeSidebarColor} onChange={(v) => update('goodbyeSidebarColor', v)} />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Titre de l&apos;embed
            </span>
            <input
              type="text"
              value={config.goodbyeEmbedTitle ?? ''}
              onChange={(e) => update('goodbyeEmbedTitle', e.target.value.slice(0, 256) || null)}
              placeholder="À bientôt sur le serveur Discord"
              className="input"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Message personnalisé
            </span>
            <div className="relative">
              <MentionTextarea
                value={config.goodbyeMessage}
                onChange={(v) => update('goodbyeMessage', v)}
                roles={roles}
                channels={channels}
                rows={4}
                maxLength={4000}
                className="input resize-none pr-9"
              />
              <div className="absolute right-2 top-2">
                <EmojiPickerButton
                  guildName={guildName}
                  guildIconUrl={guildIconUrl}
                  guildEmojis={guildEmojis}
                  onPick={(e) => update('goodbyeMessage', (config.goodbyeMessage + e).slice(0, 4000))}
                />
              </div>
            </div>
            <p className="mt-1 text-right text-xs text-gray-500">{config.goodbyeMessage.length} /4000</p>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pied de page
            </span>
            <input
              type="text"
              value={config.goodbyeEmbedFooter ?? ''}
              onChange={(e) => update('goodbyeEmbedFooter', e.target.value.slice(0, 2048) || null)}
              placeholder="Facultatif"
              className="input"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              L&apos;ancienneté du membre (« Avait rejoint le serveur il y a... ») est ajoutée automatiquement devant,
              comme dans l&apos;aperçu ci-contre.
            </p>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Prévisualisation
          </span>
          <MessagePreview
            botName={botName}
            botAvatarUrl={botAvatarUrl}
            now={now}
            mentionLine={null}
            kind="goodbye"
            avatarUrl={previewAvatarUrl}
            guildName={guildName}
            background={{
              backgroundImage: config.goodbyeBackgroundImage,
              backgroundColor: config.goodbyeBackgroundColor,
              backgroundOverlay: config.goodbyeBackgroundOverlay,
            }}
            embedColor={config.goodbyeSidebarColor}
            embedTitle={previewText(config.goodbyeEmbedTitle ?? '', false)}
            embedDescription={previewText(config.goodbyeMessage, true, true)}
            embedFooter={['Avait rejoint le serveur il y a 3 mois', previewText(config.goodbyeEmbedFooter ?? '', false)]
              .filter(Boolean)
              .join(' • ')}
            roles={roles}
            channels={channels}
            previewUsername={previewUsername}
            onEditBackground={() => setEditingBannerKind('goodbye')}
          />
        </div>
      </section>

      <div className="card space-y-2">
        <h2 className="text-sm font-semibold text-white">Variables disponibles</h2>
        <p className="text-xs text-gray-500">
          Utilisables dans le message, le titre et le pied de page (arrivée comme départ).
        </p>
        <ul className="space-y-1.5 text-xs text-gray-400">
          <li>
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-gray-200">{'{user}'}</code> — mentionne le membre
            (n&apos;envoie pas de notification à lui seul — l&apos;option « Notifier le membre » sert à ça, séparément)
          </li>
          <li>
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-gray-200">{'{server}'}</code> — nom du serveur
          </li>
          <li>
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-gray-200">{'{server.membercount}'}</code> — nombre
            de membres du serveur
          </li>
        </ul>
      </div>

      {editingBannerKind && (
        <BannerEditorModal
          guildId={guildId}
          kind={editingBannerKind}
          avatarUrl={previewAvatarUrl}
          guildName={guildName}
          initial={
            editingBannerKind === 'welcome'
              ? {
                  backgroundImage: config.backgroundImage,
                  backgroundColor: config.backgroundColor,
                  backgroundOverlay: config.backgroundOverlay,
                }
              : {
                  backgroundImage: config.goodbyeBackgroundImage,
                  backgroundColor: config.goodbyeBackgroundColor,
                  backgroundOverlay: config.goodbyeBackgroundOverlay,
                }
          }
          onCancel={() => setEditingBannerKind(null)}
          onSave={(data) => applyBackground(editingBannerKind, data)}
        />
      )}

      <div className="fixed bottom-0 left-64 right-0 flex h-[72px] items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--card)] px-8">
        {message && <p className="text-sm">{message}</p>}
        <button
          type="button"
          onClick={resetConfig}
          disabled={!isDirty || saving}
          title="Annule toutes les modifications non enregistrées de cette page"
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
