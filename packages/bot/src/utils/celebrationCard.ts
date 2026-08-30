import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import type { HexColorString, Role } from 'discord.js';
import { FONT_STACK } from './fonts.js';

const WIDTH = 525;
const HEIGHT = 155;

export interface CelebrationCardOptions {
  avatarUrl: string;
  // Un seul hex ("#RRGGBB") pour une couleur pleine, plusieurs pour un
  // dégradé (ex: rôle Discord à couleurs primaire/secondaire/tertiaire).
  accentColor: string | string[];
  // Ex: "vous avez atteint" / "vous recevez le rôle"
  line1: string;
  // Ex: "le niveau 5" / "@xp1" — affiché en gras dans accentColor.
  line2: string;
  // Emoji Unicode affiché en grand à droite (ex: "🎉") — optionnel.
  emoji?: string;
}

// Couleur(s) d'un rôle Discord pour accentColor — un rôle "dégradé" a
// colors.secondaryColor/tertiaryColor en plus de primaryColor (voir aussi
// Role#colors dans discord.js, qui remplace l'ancien Role#color unique).
// Partagée entre modules/serverTag.ts et modules/levels/rewards.ts.
export function roleAccentColors(role: Role | null | undefined, fallback: HexColorString): HexColorString[] {
  if (!role?.colors.primaryColor) return [fallback];
  const hex = (n: number): HexColorString => `#${n.toString(16).padStart(6, '0')}`;
  return [role.colors.primaryColor, role.colors.secondaryColor, role.colors.tertiaryColor]
    .filter((c): c is number => typeof c === 'number')
    .map(hex);
}

// Image Twemoji (même style que Discord) plutôt qu'une police emoji système
// — voir apps/web/src/lib/emoji-data.ts pour le même choix côté dashboard.
const TWEMOJI_PNG_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72';

function emojiToCodepoints(emoji: string): string {
  return [...emoji].map((char) => char.codePointAt(0)!.toString(16)).join('-');
}

// Réduit la taille de police par pas de 1px jusqu'à ce que le texte rentre
// dans maxWidth (ou jusqu'à minSize) — préféré à une troncature directe pour
// un nom de rôle un peu long : on garde le nom entier, juste plus petit,
// plutôt que de couper avec "…".
function fitFontSize(
  ctx: SKRSContext2D,
  text: string,
  fontStack: string,
  maxSize: number,
  minSize: number,
  maxWidth: number
): number {
  for (let size = maxSize; size > minSize; size--) {
    ctx.font = `${size}px ${fontStack}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return minSize;
}

// Coupe le texte (avec une ellipse) s'il dépasse maxWidth avec la police
// actuellement définie sur ctx — dernier recours si même la taille minimum
// de fitFontSize ne suffit pas (nom de rôle jusqu'à 100 caractères côté
// Discord, largement de quoi déborder du cadre même en petit).
function truncateToWidth(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return text.slice(0, low) + ellipsis;
}

// Couleur pleine si un seul hex fourni, dégradé horizontal réparti sur toute
// la largeur du texte sinon — un rôle Discord "dégradé" (colors.secondaryColor
// / tertiaryColor) n'était sinon rendu qu'avec sa première couleur.
function textFillStyle(ctx: SKRSContext2D, colors: string[], x: number, width: number, y: number) {
  if (colors.length <= 1) return colors[0] ?? '#dc2626';
  const gradient = ctx.createLinearGradient(x, y, x + width, y);
  colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
  return gradient;
}

// Un seul emoji est réellement utilisé pour l'instant (🎉) — évite de le
// re-télécharger et re-décoder à chaque récompense/passage de niveau.
const emojiImageCache = new Map<string, Image | null>();
async function loadEmojiImage(emoji: string): Promise<Image | null> {
  const codepoints = emojiToCodepoints(emoji);
  if (emojiImageCache.has(codepoints)) return emojiImageCache.get(codepoints)!;

  const image = await loadImage(`${TWEMOJI_PNG_BASE}/${codepoints}.png`).catch(() => null);
  emojiImageCache.set(codepoints, image);
  return image;
}

// Carte "Félicitations !" utilisée par les annonces de passage de niveau et
// de récompense — avatar cerclé de la couleur d'accent + titre + deux
// lignes de texte (+ un gros emoji optionnel à droite), même gabarit que la
// bannière de bienvenue.
export async function generateCelebrationCard({
  avatarUrl,
  accentColor,
  line1,
  line2,
  emoji,
}: CelebrationCardOptions): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const avatarSize = 104;
  const avatarX = 28;
  const avatarY = (HEIGHT - avatarSize) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } catch {
    // Avatar injoignable : on continue sans (fond seul).
  }

  const emojiReserved = emoji ? 78 : 24;
  const textX = avatarX + avatarSize + 34;
  const maxTextWidth = WIDTH - textX - emojiReserved;
  ctx.textBaseline = 'alphabetic';

  // Bloc de 3 lignes centré verticalement (même technique que
  // welcomeBanner.ts) plutôt que des positions Y fixes qui ne centraient pas
  // vraiment le bloc dans le cadre.
  const TITLE_SIZE = 35;
  const SUBTITLE_SIZE = 17;
  const LINE2_MAX_SIZE = 29;
  const LINE2_MIN_SIZE = 18;
  const GAP_TITLE_SUBTITLE = 6;
  const GAP_SUBTITLE_LINE2 = 10;
  const ASCENT_RATIO = 0.8;

  // Déterminé avant le calcul du bloc pour que le centrage vertical tienne
  // compte de la taille réelle (potentiellement réduite) de line2.
  const LINE2_SIZE = fitFontSize(ctx, line2, FONT_STACK, LINE2_MAX_SIZE, LINE2_MIN_SIZE, maxTextWidth);

  const blockHeight = TITLE_SIZE + GAP_TITLE_SUBTITLE + SUBTITLE_SIZE + GAP_SUBTITLE_LINE2 + LINE2_SIZE;
  let cursorY = (HEIGHT - blockHeight) / 2;

  ctx.fillStyle = '#ffffff';
  ctx.font = `${TITLE_SIZE}px ${FONT_STACK}`;
  ctx.fillText('Félicitations !', textX, cursorY + TITLE_SIZE * ASCENT_RATIO, maxTextWidth);
  cursorY += TITLE_SIZE + GAP_TITLE_SUBTITLE;

  ctx.fillStyle = '#9ca3af';
  ctx.font = `${SUBTITLE_SIZE}px ${FONT_STACK}`;
  ctx.fillText(line1, textX, cursorY + SUBTITLE_SIZE * ASCENT_RATIO, maxTextWidth);
  cursorY += SUBTITLE_SIZE + GAP_SUBTITLE_LINE2;

  ctx.font = `${LINE2_SIZE}px ${FONT_STACK}`;
  const line2Text = truncateToWidth(ctx, line2, maxTextWidth);
  const line2Y = cursorY + LINE2_SIZE * ASCENT_RATIO;
  const colors = Array.isArray(accentColor) ? accentColor : [accentColor];
  ctx.fillStyle = textFillStyle(ctx, colors, textX, ctx.measureText(line2Text).width, line2Y);
  ctx.fillText(line2Text, textX, line2Y, maxTextWidth);

  if (emoji) {
    const emojiImage = await loadEmojiImage(emoji);
    if (emojiImage) {
      const emojiSize = 52;
      ctx.drawImage(emojiImage, WIDTH - emojiSize - 26, (HEIGHT - emojiSize) / 2, emojiSize, emojiSize);
    }
  }

  return canvas.toBuffer('image/png');
}
