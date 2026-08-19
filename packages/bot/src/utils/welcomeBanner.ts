import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Même dimensions que l'aperçu du dashboard (WelcomeConfigPage.tsx / BannerPreview).
const WIDTH = 500;
const HEIGHT = 150;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_FAMILY = 'Poppins ExtraBold';
GlobalFonts.registerFromPath(
  path.resolve(__dirname, '../../assets/fonts/Poppins-ExtraBold.ttf'),
  FONT_FAMILY
);

export interface WelcomeBannerOptions {
  kind: 'welcome' | 'goodbye';
  avatarUrl: string;
  guildName: string;
  // Reflète les colonnes background{Image,Color,Overlay} (ou leur variante
  // goodbye*) de WelcomeConfig — voir le module d'édition du dashboard.
  backgroundImage?: string | null;
  backgroundColor?: string | null;
  backgroundOverlay?: boolean;
}

// Fond (image > couleur > dégradé par défaut) + calque de lisibilité
// optionnel + avatar du membre et nom du serveur — le titre/la
// description/le pied de page sont eux portés par l'embed (voir
// packages/bot/src/modules/welcome/index.ts), pas par l'image.
export async function generateWelcomeBanner({
  kind,
  avatarUrl,
  guildName,
  backgroundImage,
  backgroundColor,
  backgroundOverlay,
}: WelcomeBannerOptions): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const hasCustomBg = !!backgroundImage || (!!backgroundColor && backgroundColor !== 'none');

  if (backgroundImage) {
    try {
      const bg = await loadImage(backgroundImage);
      // "cover" : centre et rogne l'image pour remplir le cadre sans la déformer.
      const scale = Math.max(WIDTH / bg.width, HEIGHT / bg.height);
      const w = bg.width * scale;
      const h = bg.height * scale;
      ctx.drawImage(bg, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
    } catch {
      fillDefaultGradient(ctx, kind);
    }
  } else if (backgroundColor && backgroundColor !== 'none') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } else {
    fillDefaultGradient(ctx, kind);
  }

  if (backgroundOverlay && hasCustomBg) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const avatarSize = 112;
  const avatarX = 28;
  const avatarY = (HEIGHT - avatarSize) / 2;

  // Contour blanc autour de l'avatar — même technique que la carte de niveau
  // et la carte de célébration (récompenses) : un cercle plein légèrement
  // plus grand dessiné derrière, qui dépasse en anneau autour de l'avatar.
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

  const textX = avatarX + avatarSize + 20;
  const maxTextWidth = WIDTH - textX - 20;
  ctx.textBaseline = 'alphabetic';

  // Bloc de 3 lignes centré verticalement dans la bannière (auparavant des
  // positions Y fixes qui ne centraient rien, décalées vers le haut par
  // rapport à l'avatar) — chaque ligne est positionnée depuis sa propre
  // "boîte" (taille de police + interligne) plutôt qu'à la main.
  const TITLE_SIZE = 38;
  const SUBTITLE_SIZE = 18;
  const NAME_SIZE = 36;
  const GAP_TITLE_SUBTITLE = 4;
  const GAP_SUBTITLE_NAME = 12;
  const ASCENT_RATIO = 0.8; // approximation ascendant/corps pour cette police.

  const blockHeight = TITLE_SIZE + GAP_TITLE_SUBTITLE + SUBTITLE_SIZE + GAP_SUBTITLE_NAME + NAME_SIZE;
  let cursorY = (HEIGHT - blockHeight) / 2;

  ctx.fillStyle = '#ffffff';
  ctx.font = `${TITLE_SIZE}px "${FONT_FAMILY}"`;
  ctx.fillText(kind === 'welcome' ? 'Bienvenue' : 'À bientôt', textX, cursorY + TITLE_SIZE * ASCENT_RATIO, maxTextWidth);
  cursorY += TITLE_SIZE + GAP_TITLE_SUBTITLE;

  ctx.font = `${SUBTITLE_SIZE}px "${FONT_FAMILY}"`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('sur le serveur Discord', textX, cursorY + SUBTITLE_SIZE * ASCENT_RATIO, maxTextWidth);
  cursorY += SUBTITLE_SIZE + GAP_SUBTITLE_NAME;

  ctx.font = `${NAME_SIZE}px "${FONT_FAMILY}"`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(guildName, textX, cursorY + NAME_SIZE * ASCENT_RATIO, maxTextWidth);

  return canvas.toBuffer('image/png');
}

function fillDefaultGradient(ctx: SKRSContext2D, kind: 'welcome' | 'goodbye') {
  const baseColor = kind === 'welcome' ? '#2f9e44' : '#c92a2a';
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, baseColor);
  gradient.addColorStop(1, kind === 'welcome' ? '#37b24d' : '#e03131');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}
