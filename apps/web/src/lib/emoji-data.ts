import dataByGroup from 'unicode-emoji-json/data-by-group.json';
import { toCodePoints } from 'twemoji-parser';

export interface EmojiEntry {
  emoji: string;
  name: string;
}

export interface GuildEmoji {
  id: string;
  name: string;
  animated: boolean;
}

export interface EmojiCategory {
  key: string;
  label: string;
  emojis: EmojiEntry[];
}

interface RawGroup {
  name: string;
  slug: string;
  emojis: { emoji: string; name: string; slug: string; emoji_version: string }[];
}

// Discord/DraftBot fusionnent "Smileys & Emotion" (groupe 0) et "People &
// Body" (groupe 1) en une seule catégorie "Personnes" — même regroupement
// ici. Les clés de data-by-group.json sont les index numériques du standard
// Unicode ; l'ordre ci-dessous reprend celui affiché par DraftBot.
const GROUPS: { key: string; label: string; ids: string[] }[] = [
  { key: 'people', label: 'Personnes', ids: ['0', '1'] },
  { key: 'nature', label: 'Nature', ids: ['2'] },
  { key: 'food', label: 'Nourriture', ids: ['3'] },
  { key: 'activities', label: 'Activités', ids: ['5'] },
  { key: 'travel', label: 'Voyage', ids: ['4'] },
  { key: 'objects', label: 'Objets', ids: ['6'] },
  { key: 'symbols', label: 'Symboles', ids: ['7'] },
  { key: 'flags', label: 'Drapeaux', ids: ['8'] },
];

const rawGroups = dataByGroup as unknown as Record<string, RawGroup>;

// Les émojis Unicode très récents (15.0+, ~2023 et après) n'ont souvent pas
// encore de glyphe dans la police système de l'utilisateur (ex: Segoe UI
// Emoji sous Windows met du temps à les ajouter) — ils s'affichent alors en
// caractère "tofu" (carré gris) une fois insérés dans le texte, même si
// l'image Twemoji du picker s'affiche correctement. On les exclut du picker
// pour ne proposer que des émojis fiables une fois tapés en texte brut.
const MAX_SAFE_EMOJI_VERSION = 14.0;

export const EMOJI_CATEGORIES: EmojiCategory[] = GROUPS.map(({ key, label, ids }) => ({
  key,
  label,
  emojis: ids
    .flatMap((id) => rawGroups[id]?.emojis ?? [])
    .filter((e) => parseFloat(e.emoji_version) <= MAX_SAFE_EMOJI_VERSION)
    .map((e) => ({ emoji: e.emoji, name: e.name })),
}));

// Image Twemoji (même style que Discord) plutôt que la police emoji du
// système, qui rend très différemment selon l'OS/navigateur.
//
// jsdelivr + le fork maintenu jdecked/twemoji plutôt que l'ancien
// twemoji.maxcdn.com (domaine communautaire non officiel, parfois bloqué par
// des extensions/ad-blockers ou simplement peu fiable — cause probable des
// emojis qui ne s'affichaient pas).
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg';

export function twemojiUrl(emoji: string): string {
  return `${TWEMOJI_BASE}/${toCodePoints(emoji).join('-')}.svg`;
}

// Repli si le nom de fichier exact n'existe pas sur ce fork : une poignée
// d'émojis y sont indexés sans le(s) sélecteur(s) de variante -fe0f,
// contrairement à d'autres builds Twemoji — que ce soit en fin de séquence
// (ex: 🌶️ → 1f336, 🍽️ → 1f37d) ou au milieu (ex: 1️⃣ = 31-fe0f-20e3
// → 31-20e3, les touches numérotées/# /*).
export function twemojiFallbackUrl(emoji: string): string | null {
  const codepoints = toCodePoints(emoji);
  const withoutVariationSelectors = codepoints.filter((cp) => cp !== 'fe0f');
  if (withoutVariationSelectors.length === codepoints.length) return null;
  return `${TWEMOJI_BASE}/${withoutVariationSelectors.join('-')}.svg`;
}
