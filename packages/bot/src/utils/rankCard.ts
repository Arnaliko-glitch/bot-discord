import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 600;
const HEIGHT = 160;
const ACCENT = '#f0a020';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_FAMILY = 'Poppins ExtraBold';
GlobalFonts.registerFromPath(path.resolve(__dirname, '../../assets/fonts/Poppins-ExtraBold.ttf'), FONT_FAMILY);

export interface RankCardOptions {
  avatarUrl: string;
  username: string;
  place: number;
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
  level,
  xpIntoLevel,
  xpForNextLevel,
}: RankCardOptions): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const avatarSize = 96;
  const avatarX = 32;
  const avatarY = (HEIGHT - avatarSize) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = ACCENT;
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

  const textX = avatarX + avatarSize + 28;
  const rightEdge = WIDTH - 32;

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `28px "${FONT_FAMILY}"`;
  ctx.fillText(username, textX, 56, rightEdge - textX - 110);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = `20px "${FONT_FAMILY}"`;
  ctx.fillText(`${xpIntoLevel} / ${xpForNextLevel}`, rightEdge, 44);
  ctx.textAlign = 'left';

  const barX = textX;
  const barY = 74;
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
  ctx.font = `16px "${FONT_FAMILY}"`;
  ctx.fillText('Place', textX, HEIGHT - 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = `22px "${FONT_FAMILY}"`;
  ctx.fillText(String(place), textX, HEIGHT - 12);

  ctx.textAlign = 'right';
  ctx.fillStyle = ACCENT;
  ctx.font = `26px "${FONT_FAMILY}"`;
  ctx.fillText(`Niveau ${level}`, rightEdge, HEIGHT - 18);
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
