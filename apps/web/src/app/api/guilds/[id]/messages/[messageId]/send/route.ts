import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string; messageId: string } };

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

interface EmbedData {
  authorName?: string | null;
  title?: string | null;
  description?: string | null;
  color?: string | null;
  fields?: { name: string; value: string }[];
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  footerText?: string | null;
}

interface ButtonData {
  label?: string | null;
  emoji?: string | null;
  style?: 'blue' | 'gray' | 'green' | 'red';
  disabled?: boolean;
  action?: 'ticket' | 'link' | null;
  url?: string | null;
}

// Doit rester synchronisé avec TICKET_CREATE_BUTTON_ID dans
// packages/bot/src/modules/tickets/constants.ts — l'écouteur d'interactions
// du bot reconnaît ce customId indépendamment du message/salon d'origine, un
// seul bouton "ouvrir un ticket" suffit donc pour tout le serveur.
const TICKET_CREATE_BUTTON_ID = 'ticket:create';

const BUTTON_STYLE_TO_DISCORD: Record<string, number> = { blue: 1, gray: 2, green: 3, red: 4 };

function parseButtonEmoji(raw: string): Record<string, unknown> {
  const custom = /^<(a?):(\w+):(\d+)>$/.exec(raw);
  if (custom) {
    const [, animated, name, id] = custom;
    return { id, name, animated: animated === 'a' };
  }
  return { name: raw };
}

function buildButtonComponent(button: ButtonData): Record<string, unknown> | null {
  if (!button.action) return null;

  const component: Record<string, unknown> = { type: 2, disabled: Boolean(button.disabled) };
  if (button.label) component.label = button.label.slice(0, 80);
  if (button.emoji) component.emoji = parseButtonEmoji(button.emoji);

  if (button.action === 'link') {
    if (!button.url) return null;
    // Discord impose le style "Link" (5) dès qu'une URL est fournie — la
    // couleur choisie dans l'éditeur n'a aucun effet visuel pour ce type.
    component.style = 5;
    component.url = button.url;
  } else {
    component.style = BUTTON_STYLE_TO_DISCORD[button.style ?? 'blue'] ?? 1;
    component.custom_id = TICKET_CREATE_BUTTON_ID;
  }
  return component;
}

function buildComponents(raw: unknown): Record<string, unknown>[] {
  const buttons = (Array.isArray(raw) ? raw : []) as ButtonData[];
  const components = buttons
    .slice(0, 5)
    .map(buildButtonComponent)
    .filter((c): c is Record<string, unknown> => c !== null);
  return components.length > 0 ? [{ type: 1, components }] : [];
}

function toAbsoluteUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  return `${appUrl}${url}`;
}

// Les messages enregistrés avant le passage aux embeds multiples stockent un
// objet unique en base plutôt qu'un tableau — on l'accepte toujours en lecture.
function normalizeEmbeds(raw: unknown): EmbedData[] {
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]) as EmbedData[];
}

function buildOneEmbed(embedData: EmbedData): Record<string, unknown> {
  const embed: Record<string, unknown> = {};
  if (embedData.authorName) embed.author = { name: embedData.authorName };
  if (embedData.title) embed.title = embedData.title;
  if (embedData.description) embed.description = embedData.description;
  if (embedData.color) embed.color = parseInt(embedData.color.replace('#', ''), 16);
  const fields = (embedData.fields ?? []).filter((f) => f.name && f.value);
  if (fields.length > 0) embed.fields = fields;
  if (embedData.footerText) embed.footer = { text: embedData.footerText };
  if (embedData.thumbnailUrl) embed.thumbnail = { url: toAbsoluteUrl(embedData.thumbnailUrl) };
  if (embedData.imageUrl) embed.image = { url: toAbsoluteUrl(embedData.imageUrl) };
  return embed;
}

function buildDiscordPayload(message: {
  content: string | null;
  embedData: unknown;
  imageUrls: string[];
  buttons: unknown;
}): { content?: string; embeds: Record<string, unknown>[]; components: Record<string, unknown>[] } {
  const embeds = normalizeEmbeds(message.embedData)
    .slice(0, 5)
    .map(buildOneEmbed)
    .filter((e) => Object.keys(e).length > 0);

  return {
    content: message.content ?? undefined,
    embeds,
    // Toujours explicite (même vide) : sur une édition, l'omettre laisserait
    // Discord garder d'anciens boutons retirés depuis côté dashboard.
    components: buildComponents(message.buttons),
  };
}

// Récupère les octets de l'image autonome (attachée telle quelle au message,
// jamais dans un embed) : lecture disque directe pour nos propres uploads,
// téléchargement pour un lien externe collé par l'utilisateur.
async function fetchStandaloneImage(
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

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const message = await prisma.savedMessage.findUnique({ where: { id: params.messageId } });
  if (!message || message.guildId !== params.id) {
    return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
  }
  if (!message.channelId) return NextResponse.json({ error: 'Choisissez un salon avant d\'envoyer.' }, { status: 400 });

  const payload = buildDiscordPayload(message);
  if (!payload.content && payload.embeds.length === 0 && message.imageUrls.length === 0 && payload.components.length === 0) {
    return NextResponse.json({ error: 'Le message est vide.' }, { status: 400 });
  }

  const requestBody = await request.json().catch(() => ({}));
  const mode: 'resend' | 'edit' = requestBody?.mode === 'edit' ? 'edit' : 'resend';
  const hasEditableMessage = Boolean(message.lastSentMessageId && message.lastSentChannelId === message.channelId);
  if (mode === 'edit' && !hasEditableMessage) {
    return NextResponse.json({ error: 'Aucun message existant à modifier dans ce salon.' }, { status: 400 });
  }

  // Discord accepte jusqu'à 10 pièces jointes par message — on envoie toutes
  // les images de la galerie, pas seulement la première.
  const fetchedAttachments = await Promise.all(
    message.imageUrls.slice(0, 10).map((u) => fetchStandaloneImage(u, message.guildId))
  );
  const attachments = fetchedAttachments.filter((a): a is NonNullable<typeof a> => a !== null);

  const token = process.env.DISCORD_BOT_TOKEN;
  const canEdit = mode === 'edit' && hasEditableMessage;
  const url = canEdit
    ? `https://discord.com/api/v10/channels/${message.channelId}/messages/${message.lastSentMessageId}`
    : `https://discord.com/api/v10/channels/${message.channelId}/messages`;

  let body: BodyInit;
  const headers: Record<string, string> = { Authorization: `Bot ${token}` };
  if (attachments.length > 0) {
    const form = new FormData();
    form.append(
      'payload_json',
      JSON.stringify({ ...payload, attachments: attachments.map((_, i) => ({ id: i })) })
    );
    attachments.forEach((attachment, i) => {
      form.append(
        `files[${i}]`,
        new Blob([new Uint8Array(attachment.data)], { type: attachment.contentType }),
        attachment.filename
      );
    });
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    // Toujours explicite (même sans image) : sur une édition, omettre ce
    // champ ferait garder par défaut une éventuelle pièce jointe précédente.
    body = JSON.stringify({ ...payload, attachments: [] });
  }

  const res = await fetch(url, {
    method: canEdit ? 'PATCH' : 'POST',
    headers,
    body,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => null);
    return NextResponse.json({ error: error?.message ?? 'Envoi Discord échoué' }, { status: 502 });
  }

  const sent = (await res.json()) as { id: string; channel_id: string };
  const updated = await prisma.savedMessage.update({
    where: { id: message.id },
    data: { lastSentChannelId: sent.channel_id, lastSentMessageId: sent.id, updatedAt: new Date() },
  });

  return NextResponse.json(updated);
}
