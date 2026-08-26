import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { FONT_STACK } from './fonts.js';

const WIDTH = 525;
const HEIGHT = 155;

export interface CelebrationCardOptions {
  avatarUrl: string;
  accentColor: string;
  // Ex: "vous avez atteint" / "vous recevez le rôle"
  line1: string;
  // Ex: "le niveau 5" / "@xp1" — affiché en gras dans accentColor.
  line2: string;
  // Emoji Unicode affiché en grand à droite (ex: "🎉") — optionnel.
  emoji?: string;
}

// Image Twemoji (même style que Discord) plutôt qu'une police emoji système
// — voir apps/web/src/lib/emoji-data.ts pour le même choix côté dashboard.
const TWEMOJI_PNG_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72';

function emojiToCodepoints(emoji: string): string {
  return [...emoji].map((char) => char.codePointAt(0)!.toString(16)).join('-');
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

  const emojiReserved = emoji ? 90 : 24;
  const textX = avatarX + avatarSize + 34;
  const maxTextWidth = WIDTH - textX - emojiReserved;
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#ffffff';
  ctx.font = `35px ${FONT_STACK}`;
  ctx.fillText('Félicitations !', textX, 56, maxTextWidth);

  ctx.fillStyle = '#9ca3af';
  ctx.font = `17px ${FONT_STACK}`;
  ctx.fillText(line1, textX, 82, maxTextWidth);

  ctx.fillStyle = accentColor;
  ctx.font = `29px ${FONT_STACK}`;
  ctx.fillText(line2, textX, 116, maxTextWidth);

  if (emoji) {
    const emojiImage = await loadEmojiImage(emoji);
    if (emojiImage) {
      const emojiSize = 64;
      ctx.drawImage(emojiImage, WIDTH - emojiSize - 26, (HEIGHT - emojiSize) / 2, emojiSize, emojiSize);
    }
  }

  return canvas.toBuffer('image/png');
}
