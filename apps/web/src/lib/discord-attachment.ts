import { readFile } from 'node:fs/promises';
import path from 'node:path';

const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads');

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

function guessImageContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export interface FetchedAttachment {
  filename: string;
  data: Buffer;
  contentType: string;
}

// Construit les headers + le corps d'une requête REST Discord (JSON simple
// sans pièce jointe, multipart sinon) — partagé entre le composeur de
// messages et le module Rôles-réactions, pour ne jamais avoir deux
// implémentations qui divergent.
export function buildDiscordRequestBody(
  payload: Record<string, unknown>,
  attachments: FetchedAttachment[]
): { headers: Record<string, string>; body: BodyInit } {
  const headers: Record<string, string> = { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` };
  if (attachments.length === 0) {
    headers['Content-Type'] = 'application/json';
    // Toujours explicite (même sans image) : sur une édition, omettre ce
    // champ ferait garder par défaut une éventuelle pièce jointe précédente.
    return { headers, body: JSON.stringify({ ...payload, attachments: [] }) };
  }

  const form = new FormData();
  form.append('payload_json', JSON.stringify({ ...payload, attachments: attachments.map((_, i) => ({ id: i })) }));
  attachments.forEach((attachment, i) => {
    form.append(`files[${i}]`, new Blob([new Uint8Array(attachment.data)], { type: attachment.contentType }), attachment.filename);
  });
  return { headers, body: form };
}

// Récupère les octets d'une image autonome (attachée telle quelle à un
// message, jamais dans un embed) : lecture disque directe pour nos propres
// uploads, téléchargement pour un lien externe collé par l'utilisateur.
// Partagée entre le composeur de messages et le module Rôles-réactions.
export async function fetchStandaloneImage(
  url: string,
  guildId: string
): Promise<{ filename: string; data: Buffer; contentType: string } | null> {
  if (url.startsWith(`/uploads/${guildId}/`)) {
    const filePath = path.join(UPLOADS_ROOT, url.slice('/uploads/'.length));
    const data = await readFile(filePath).catch(() => null);
    const filename = path.basename(filePath);
    return data ? { filename, data, contentType: guessImageContentType(filename) } : null;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    const filename = path.basename(new URL(url).pathname) || 'image.png';
    const contentType = res.headers.get('content-type')?.split(';')[0].trim() || guessImageContentType(filename);
    return { filename, data, contentType };
  } catch {
    return null;
  }
}
