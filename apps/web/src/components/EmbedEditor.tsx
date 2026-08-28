'use client';

import { useRef, useState } from 'react';
import { CircleHelp, Copy, GripVertical, Image as ImageIcon, Link2, Palette, Plus, Trash2 } from 'lucide-react';
import type { Channel } from '@/components/ChannelSelect';
import { EmojiPickerButton } from '@/components/EmojiPickerButton';
import { MentionTextarea, type RoleOption } from '@/components/MentionTextarea';
import type { GuildEmoji } from '@/lib/emoji-data';

export interface EmbedField {
  name: string;
  value: string;
}

export interface EmbedData {
  authorName: string | null;
  authorIconUrl: string | null;
  title: string | null;
  // Rend le titre cliquable (comportement natif des embeds Discord) — null
  // tant que l'utilisateur n'a pas explicitement ajouté de lien.
  titleUrl: string | null;
  description: string | null;
  color: string | null;
  fields: EmbedField[];
  // Jusqu'à 4 images (voir MAX_EMBED_IMAGES) — Discord n'a qu'un seul champ
  // "image" par embed brut, plusieurs images sont donc envoyées comme des
  // embeds "image seule" supplémentaires partageant la même url, que Discord
  // regroupe visuellement en galerie (voir buildEmbedGroup côté envoi).
  imageUrls: string[];
  thumbnailUrl: string | null;
  footerText: string | null;
  footerIconUrl: string | null;
}

export const EMBED_COLOR_SWATCHES = ['#ED4245', '#57F287', '#5865F2', '#F0A020'];
export const DEFAULT_EMBED_COLOR = '#dc2626';

export const BLANK_EMBED: EmbedData = {
  authorName: null,
  authorIconUrl: null,
  title: null,
  titleUrl: null,
  description: null,
  color: DEFAULT_EMBED_COLOR,
  fields: [],
  imageUrls: [],
  thumbnailUrl: null,
  footerText: null,
  footerIconUrl: null,
};

// Discord limite la somme de tous les caractères (titre + description +
// auteur + footer + champs) de TOUS les embeds d'un message à 6000, tous
// embeds confondus — pas seulement par embed.
export function totalEmbedChars(embeds: EmbedData[]): number {
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

export async function uploadImageFile(guildId: string, file: File): Promise<{ url: string | null; error?: string }> {
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
export function deleteServerFile(guildId: string, url: string | null | undefined) {
  if (!url) return;
  fetch(`/api/guilds/${guildId}/upload`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }).catch(() => undefined);
}

// Zone de dépôt/collage pour une image — utilisée aussi bien pour l'image
// autonome d'un message que pour chaque emplacement d'image d'un embed.
export function InlineImageDropzone({
  guildId,
  onUploaded,
  maxFiles = 10,
}: {
  guildId: string;
  onUploaded: (urls: string[]) => void;
  maxFiles?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [error, setError] = useState('');

  // Sélection multiple acceptée — au-delà de maxFiles on prend juste les
  // premières, pas la peine de compliquer avec le nombre de places restantes.
  async function handleUploadFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, maxFiles);
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
export function ImageUploadModal({
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
// principale, petit carré pour la vignette, minuscule pour l'icône d'auteur.
// Le clic ouvre la même popup de dépôt/collage que l'image autonome du
// message (pas un sélecteur de fichier natif) ; une fois l'image en place,
// cliquer dessus rouvre la popup pour la remplacer, l'icône corbeille (au
// survol) la retire.
export function EmbedImageSlot({
  guildId,
  value,
  onChange,
  isSavedUrl,
  size,
  open: openProp,
  onOpenChange,
}: {
  guildId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  isSavedUrl: (url: string | null) => boolean;
  size: 'tiny' | 'small' | 'large';
  // Non contrôlé par défaut (état interne) — le composeur de messages s'en
  // sert tel quel pour les emplacements d'embed. Un appelant qui a besoin
  // d'ouvrir la popup depuis l'extérieur (ex : au clic sur l'onglet "Image",
  // sans second clic sur l'emplacement vide) passe ces deux props, comme le
  // module Rôles-réactions pour son image autonome.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const boxClass = size === 'large' ? 'w-full' : size === 'small' ? 'h-16 w-16' : 'h-6 w-6';

  // Une image déjà enregistrée n'est nettoyée qu'à la sauvegarde globale
  // (voir save() dans le composant appelant) — sinon "Annuler" ne peut plus
  // la restaurer. Seul un upload de cette session, jamais sauvegardé, peut
  // être supprimé tout de suite quand on le remplace ou le retire.
  function handleUploaded(urls: string[]) {
    if (!urls[0]) return;
    if (value && !isSavedUrl(value)) deleteServerFile(guildId, value);
    onChange(urls[0]);
    setOpen(false);
  }

  return (
    <div className={`relative shrink-0 ${size === 'large' ? 'w-full' : ''}`}>
      {value ? (
        <div className={`group/img relative overflow-hidden rounded ${boxClass}`}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Remplacer l'image"
            className="block h-full w-full cursor-pointer border-0 bg-transparent p-0"
          >
            <img src={value} alt="" className={`object-cover ${size === 'large' ? 'max-h-52 w-full' : boxClass}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isSavedUrl(value)) deleteServerFile(guildId, value);
              onChange(null);
            }}
            title="Retirer l'image"
            className={
              size === 'tiny'
                ? 'absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition hover:bg-black/80 group-hover/img:opacity-100'
                : 'absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white opacity-0 transition hover:bg-black/80 group-hover/img:opacity-100'
            }
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Ajouter une image"
          className={`flex items-center justify-center rounded border border-dashed border-white/20 text-gray-600 transition hover:border-[var(--accent)] hover:text-gray-400 ${
            size === 'large' ? 'h-32 w-full' : boxClass
          }`}
        >
          <ImageIcon className={size === 'tiny' ? 'h-3 w-3' : size === 'small' ? 'h-5 w-5' : 'h-6 w-6'} />
        </button>
      )}
      {open && <ImageUploadModal guildId={guildId} onUploaded={handleUploaded} onClose={() => setOpen(false)} />}
    </div>
  );
}

export const MAX_EMBED_IMAGES = 4;

// Une vignette d'image de galerie — recadrée (object-cover) pour remplir sa
// case carrée, sauf en mode "seule" (voir ImageGrid) où elle garde ses
// proportions naturelles sans recadrage. Partagée entre la galerie d'images
// autonome d'un message et l'emplacement image principal d'un embed, pour ne
// jamais avoir deux implémentations qui divergent.
function ImageTile({
  url,
  index,
  guildId,
  urls,
  onChange,
  isSavedUrl,
  dragIndex,
  isDragOver,
  onDragOverTile,
  onOpenChange,
  canAddMore,
  tileClassName,
  imgClassName = 'h-full w-full object-cover rounded',
}: {
  url: string;
  index: number;
  guildId: string;
  urls: string[];
  onChange: (urls: string[]) => void;
  isSavedUrl: (url: string | null) => boolean;
  dragIndex: React.MutableRefObject<number | null>;
  isDragOver: boolean;
  onDragOverTile: (index: number | null) => void;
  onOpenChange: (open: boolean) => void;
  canAddMore: boolean;
  tileClassName: string;
  imgClassName?: string;
}) {
  const [replaceOpen, setReplaceOpen] = useState(false);

  // Une image déjà enregistrée n'est nettoyée qu'à la sauvegarde globale
  // (voir save() dans le composant appelant) — sinon "Annuler" ne peut plus la
  // restaurer. Seul un upload de cette session, jamais sauvegardé, peut être
  // supprimé tout de suite quand on le remplace ou le retire.
  function removeAt(i: number) {
    if (!isSavedUrl(urls[i])) deleteServerFile(guildId, urls[i]);
    onChange(urls.filter((_, idx) => idx !== i));
  }

  function moveTo(from: number, to: number) {
    if (from === to) return;
    const next = [...urls];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function replaceWith(newUrls: string[]) {
    if (!newUrls[0]) return;
    if (!isSavedUrl(urls[index])) deleteServerFile(guildId, urls[index]);
    const next = [...urls];
    next[index] = newUrls[0];
    onChange(next);
    setReplaceOpen(false);
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
      <button
        type="button"
        onClick={() => setReplaceOpen(true)}
        title="Remplacer l'image"
        className="block h-full w-full cursor-pointer border-0 bg-transparent p-0"
      >
        <img src={url} alt="" className={imgClassName} />
      </button>
      {replaceOpen && <ImageUploadModal guildId={guildId} onUploaded={replaceWith} onClose={() => setReplaceOpen(false)} />}
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
      {canAddMore && (
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

// Galerie d'images (jusqu'à maxImages) — une seule image garde ses
// proportions naturelles, à partir de deux elles deviennent des vignettes
// carrées recadrées, 3 par ligne max (celles d'une ligne incomplète
// s'agrandissent pour la remplir). Chaque vignette se glisse pour réordonner
// (drag & drop HTML5, aucune dépendance) ; le "+" d'ajout apparaît au survol
// de N'IMPORTE QUELLE vignette, pas seulement la dernière. Utilisée à la fois
// pour la galerie d'images autonome d'un message et l'image principale d'un
// embed (voir EmbedBlock).
export function ImageGrid({
  guildId,
  urls,
  onChange,
  isSavedUrl,
  maxImages,
  open: openProp,
  onOpenChange,
}: {
  guildId: string;
  urls: string[];
  onChange: (urls: string[]) => void;
  isSavedUrl: (url: string | null) => boolean;
  maxImages: number;
  // Non contrôlé par défaut (état interne) — un appelant qui a besoin
  // d'ouvrir la popup depuis l'extérieur (ex: au clic sur l'onglet "Image",
  // sans second clic sur l'emplacement vide) passe ces deux props, comme le
  // composeur de messages pour sa galerie autonome.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const canAddMore = urls.length < maxImages;
  const single = urls.length === 1;
  // Une seule ligne (2 ou 3 images) : chaque vignette s'agrandit pour remplir
  // toute la largeur. Au-delà, grille fixe à 3 colonnes — une ligne
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
          isSavedUrl={isSavedUrl}
          dragIndex={dragIndex}
          isDragOver={dragOverIndex === i}
          onDragOverTile={setDragOverIndex}
          onOpenChange={setOpen}
          canAddMore={canAddMore}
          tileClassName={single ? 'flex-none max-w-full' : fillsOneRow ? 'aspect-square flex-1' : 'aspect-square'}
          imgClassName={single ? 'block h-auto max-h-[400px] w-auto max-w-full rounded' : undefined}
        />
      ))}
      {urls.length === 0 && canAddMore && !open && (
        <div className="relative aspect-square w-full max-w-[280px]">
          <button
            type="button"
            onClick={() => setOpen(true)}
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
            onChange([...urls, ...newUrls].slice(0, maxImages));
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function EmbedColorPicker({
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

// Bloc d'édition complet d'un embed — même composant utilisé par le
// composeur de messages (plusieurs embeds) et le module Rôles-réactions (un
// seul), pour ne jamais avoir deux implémentations qui divergent.
export function EmbedBlock({
  embed,
  onUpdate,
  onRemove,
  onDuplicate,
  duplicateDisabled,
  guildId,
  roles,
  channels,
  guildEmojis,
  guildName,
  guildIconUrl,
  isSavedUrl,
}: {
  embed: EmbedData;
  onUpdate: <K extends keyof EmbedData>(key: K, value: EmbedData[K]) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  duplicateDisabled?: boolean;
  guildId: string;
  roles: RoleOption[];
  channels: Channel[];
  guildEmojis: GuildEmoji[];
  guildName: string;
  guildIconUrl: string | null;
  isSavedUrl: (url: string | null) => boolean;
}) {
  return (
    <div className="flex flex-1 basis-[260px] items-start gap-1.5">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <EmbedColorPicker value={embed.color ?? DEFAULT_EMBED_COLOR} onChange={(v) => onUpdate('color', v)} compact />
      </div>

      <div className="flex min-w-0 flex-1 rounded">
        <div className="w-1 shrink-0 rounded-l" style={{ backgroundColor: embed.color ?? DEFAULT_EMBED_COLOR }} />
        <div className="min-w-0 flex-1 space-y-2 rounded-r bg-[#2b2d31] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <EmbedImageSlot
                  guildId={guildId}
                  value={embed.authorIconUrl}
                  onChange={(v) => onUpdate('authorIconUrl', v)}
                  isSavedUrl={isSavedUrl}
                  size="tiny"
                />
                <input
                  value={embed.authorName ?? ''}
                  onChange={(e) => onUpdate('authorName', e.target.value.slice(0, 256) || null)}
                  placeholder="Nom de l'auteur"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold text-white outline-none placeholder:text-gray-500"
                />
              </div>
              <div className="relative">
                <MentionTextarea
                  value={embed.title ?? ''}
                  onChange={(v) => onUpdate('title', v || null)}
                  roles={roles}
                  channels={channels}
                  rows={1}
                  maxLength={256}
                  placeholder="Titre"
                  className="w-full resize-none border-0 bg-transparent p-0 pr-14 text-base font-bold text-white outline-none placeholder:text-gray-500"
                />
                <div className="absolute right-0 top-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdate('titleUrl', embed.titleUrl === null ? '' : null)}
                    title={embed.titleUrl === null ? 'Ajouter un lien au titre' : 'Retirer le lien du titre'}
                    className={embed.titleUrl === null ? 'text-gray-500 hover:text-gray-300' : 'text-[var(--accent)]'}
                  >
                    <Link2 className="h-4 w-4" />
                  </button>
                  <EmojiPickerButton
                    guildName={guildName}
                    guildIconUrl={guildIconUrl}
                    guildEmojis={guildEmojis}
                    onPick={(e) => onUpdate('title', ((embed.title ?? '') + e).slice(0, 256))}
                  />
                </div>
              </div>
              {embed.titleUrl !== null && (
                <input
                  type="url"
                  value={embed.titleUrl}
                  onChange={(e) => onUpdate('titleUrl', e.target.value)}
                  placeholder="https://... (lien du titre)"
                  className="w-full rounded border-0 bg-black/20 px-2 py-1 text-xs text-gray-300 outline-none placeholder:text-gray-600"
                />
              )}
              <div className="relative">
                <MentionTextarea
                  value={embed.description ?? ''}
                  onChange={(v) => onUpdate('description', v || null)}
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
                    onPick={(e) => onUpdate('description', ((embed.description ?? '') + e).slice(0, 4000))}
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
                          onUpdate('fields', fields);
                        }}
                        placeholder="Nom du champ"
                        className="w-full border-0 bg-transparent p-0 text-xs font-semibold text-white outline-none placeholder:text-gray-500"
                      />
                      <input
                        value={field.value}
                        onChange={(e) => {
                          const fields = [...embed.fields];
                          fields[i] = { ...fields[i], value: e.target.value.slice(0, 1024) };
                          onUpdate('fields', fields);
                        }}
                        placeholder="Valeur du champ"
                        className="w-full border-0 bg-transparent p-0 text-xs text-gray-400 outline-none placeholder:text-gray-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdate('fields', embed.fields.filter((_, idx) => idx !== i))}
                      className="shrink-0 text-gray-600 opacity-0 transition hover:text-[#ED4245] group-hover/field:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onUpdate('fields', [...embed.fields, { name: '', value: '' }])}
                  className="text-xs text-gray-500 hover:text-white"
                >
                  + Ajouter un champ
                </button>
              </div>
            </div>

            <EmbedImageSlot
              guildId={guildId}
              value={embed.thumbnailUrl}
              onChange={(v) => onUpdate('thumbnailUrl', v)}
              isSavedUrl={isSavedUrl}
              size="small"
            />
          </div>

          <ImageGrid
            guildId={guildId}
            urls={embed.imageUrls}
            onChange={(v) => onUpdate('imageUrls', v)}
            isSavedUrl={isSavedUrl}
            maxImages={MAX_EMBED_IMAGES}
          />

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <EmbedImageSlot
                guildId={guildId}
                value={embed.footerIconUrl}
                onChange={(v) => onUpdate('footerIconUrl', v)}
                isSavedUrl={isSavedUrl}
                size="tiny"
              />
              <input
                value={embed.footerText ?? ''}
                onChange={(e) => onUpdate('footerText', e.target.value.slice(0, 2048) || null)}
                placeholder="Footer"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-gray-400 outline-none placeholder:text-gray-600"
              />
            </div>
            <span className="shrink-0 text-xs text-gray-600">
              Aujourd&apos;hui à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <button
          type="button"
          onClick={onRemove}
          title="Retirer l'embed"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            disabled={duplicateDisabled}
            title="Dupliquer l'embed"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
