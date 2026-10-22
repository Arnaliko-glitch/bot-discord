import { createCanvas, loadImage } from '@napi-rs/canvas';
import { FONT_STACK, fontStackFor } from './fonts.js';

// Mêmes dimensions que les autres cartes générées (bienvenue/départ,
// célébration) pour un rendu de taille cohérente une fois réduites à la
// largeur d'affichage d'un embed Discord.
const WIDTH = 525;
const HEIGHT = 155;
export const ACCENT = '#dc2626';

export interface RankCardOptions {
  avatarUrl: string;
  username: string;
  place: number;
  totalMembers?: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
}

// Carte de niveau générée pour /niveau — avatar cerclé, barre de progression
// vers le niveau suivant, position au classement et niveau actuel.
export async function generateRankCard({
  avatarUrl,
  username,
  place,
  totalMembers,
  level,
  xpIntoLevel,
  xpForNextLevel,
}: RankCardOptions): Promise<Buffer> {
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

  const textX = avatarX + avatarSize + 34;
  const rightEdge = WIDTH - 28;

  ctx.textBaseline = 'alphabetic';

  // Largeur réelle du compteur xp mesurée avant de dessiner le pseudo, pour
  // ne réserver que l'espace qu'il occupe vraiment (un pseudo long ne doit
  // pas pouvoir chevaucher un petit compteur, ni l'inverse).
  const xpText = `${xpIntoLevel} / ${xpForNextLevel} xp`;
  ctx.font = `23px ${FONT_STACK}`;
  const xpTextWidth = ctx.measureText(xpText).width;

  ctx.fillStyle = '#ffffff';
  ctx.font = `32px ${fontStackFor(username)}`;
  const usernameWidth = rightEdge - textX - xpTextWidth - 20;
  // On tolère une compression de 20 %, puis on tronque sans couper les
  // emojis composés ni les caractères accompagnés d'accents combinés.
  const minScale = 0.8;
  let displayedUsername = username;
  if (ctx.measureText(username).width * minScale > usernameWidth) {
    const characters = Array.from(
      new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(username),
      ({ segment }) => segment,
    );
    do {
      characters.pop();
      displayedUsername = `${characters.join('')}…`;
    } while (characters.length > 0 && ctx.measureText(displayedUsername).width * minScale > usernameWidth);
  }
  if (usernameWidth > 0 && ctx.measureText(displayedUsername).width * minScale <= usernameWidth) {
    ctx.fillText(displayedUsername, textX, 46, usernameWidth);
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = `23px ${FONT_STACK}`;
  ctx.fillText(xpText, rightEdge, 45);
  ctx.textAlign = 'left';

  const barX = textX;
  const barY = 66;
  const barWidth = rightEdge - textX;
  const barHeight = 12;
  const radius = barHeight / 2;

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  drawRoundedRect(ctx, barX, barY, barWidth, barHeight, radius);
  ctx.fill();

  const progress = xpForNextLevel > 0 ? Math.min(1, xpIntoLevel / xpForNextLevel) : 0;
  const filledWidth = Math.max(barHeight, barWidth * progress);
  ctx.fillStyle = ACCENT;
  drawRoundedRect(ctx, barX, barY, filledWidth, barHeight, radius);
  ctx.fill();

  ctx.fillStyle = '#9ca3af';
  ctx.font = `18px ${FONT_STACK}`;
  ctx.fillText('Place', textX, HEIGHT - 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = `25px ${FONT_STACK}`;
  const placeText = totalMembers === undefined ? String(place) : `${place} / ${totalMembers}`;
  ctx.fillText(placeText, textX, HEIGHT - 18);

  ctx.textAlign = 'right';
  ctx.fillStyle = ACCENT;
  ctx.font = `30px ${FONT_STACK}`;
  ctx.fillText(`Niveau ${level}`, rightEdge, HEIGHT - 20);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

function drawRoundedRect(
  ctx: import('@napi-rs/canvas').SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
