import { randomInt } from 'node:crypto';

export const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// Accepte 30s, 10m, 2h, 7j ou une combinaison telle que 1j 2h 30m.
export function parseGiveawayDuration(value: string): number | null {
  const input = value.trim().toLowerCase();
  const parts = [...input.matchAll(/(\d+)\s*(s|m|h|j|d)/g)];
  if (!parts.length || input.replace(/(\d+)\s*(s|m|h|j|d)/g, '').trim()) return null;
  const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, j: 86_400_000, d: 86_400_000 };
  const duration = parts.reduce((sum, part) => sum + Number(part[1]) * units[part[2]], 0);
  return Number.isSafeInteger(duration) && duration >= 10_000 && duration <= MAX_DURATION_MS ? duration : null;
}

export function shuffleParticipants(ids: readonly string[]): string[] {
  const result = [...new Set(ids)];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function giveawayImageExtension(image: { contentType: string | null; name: string }): string | null {
  const types: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  if (image.contentType) return types[image.contentType.toLowerCase()] ?? null;
  const extension = image.name.toLowerCase().match(/\.(png|jpe?g|gif|webp)$/)?.[1];
  return extension === 'jpeg' ? 'jpg' : extension ?? null;
}
