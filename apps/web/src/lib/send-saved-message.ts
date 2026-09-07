import { prisma } from '@discord-bot-dashboard/database';
import type { SavedMessage } from '@discord-bot-dashboard/database';
import { buildDiscordRequestBody, fetchStandaloneImage } from '@/lib/discord-attachment';
import { buildEmbedGroup, type EmbedData } from '@/lib/discord-embed';

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

// Les messages enregistrés avant le passage aux embeds multiples stockent un
// objet unique en base plutôt qu'un tableau — on l'accepte toujours en lecture.
function normalizeEmbeds(raw: unknown): EmbedData[] {
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]) as EmbedData[];
}

function buildDiscordPayload(message: {
  content: string | null;
  embedData: unknown;
  imageUrls: string[];
  buttons: unknown;
}): { content?: string; embeds: Record<string, unknown>[]; components: Record<string, unknown>[] } {
  // Chaque EmbedData peut se transformer en plusieurs embeds bruts (galerie
  // d'images, voir buildEmbedGroup) — on plafonne quand même au total au
  // maximum absolu de Discord (10 embeds par message).
  const embeds = normalizeEmbeds(message.embedData)
    .slice(0, 5)
    .flatMap(buildEmbedGroup)
    .filter((e) => Object.keys(e).length > 0)
    .slice(0, 10);

  return {
    content: message.content ?? undefined,
    embeds,
    // Toujours explicite (même vide) : sur une édition, l'omettre laisserait
    // Discord garder d'anciens boutons retirés depuis côté dashboard.
    components: buildComponents(message.buttons),
  };
}

export type SendSavedMessageResult =
  | { ok: true; updated: SavedMessage }
  | { ok: false; error: string; status: number };

// Construit et envoie un message enregistré à Discord — partagé entre la
// route d'envoi manuel (bouton "Envoyer"/"Modifier") et le planificateur
// d'envoi automatique (voir auto-send-scheduler.ts), pour ne jamais avoir
// deux implémentations qui divergent.
export async function sendSavedMessage(message: SavedMessage, mode: 'resend' | 'edit'): Promise<SendSavedMessageResult> {
  if (!message.channelId) return { ok: false, error: "Choisissez un salon avant d'envoyer.", status: 400 };

  const payload = buildDiscordPayload(message);
  if (!payload.content && payload.embeds.length === 0 && message.imageUrls.length === 0 && payload.components.length === 0) {
    return { ok: false, error: 'Le message est vide.', status: 400 };
  }

  const hasEditableMessage = Boolean(message.lastSentMessageId && message.lastSentChannelId === message.channelId);
  if (mode === 'edit' && !hasEditableMessage) {
    return { ok: false, error: 'Aucun message existant à modifier dans ce salon.', status: 400 };
  }

  // Discord accepte jusqu'à 10 pièces jointes par message — on envoie toutes
  // les images de la galerie, pas seulement la première.
  const fetchedAttachments = await Promise.all(
    message.imageUrls.slice(0, 10).map((u) => fetchStandaloneImage(u, message.guildId))
  );
  const attachments = fetchedAttachments.filter((a): a is NonNullable<typeof a> => a !== null);

  const canEdit = mode === 'edit' && hasEditableMessage;
  const url = canEdit
    ? `https://discord.com/api/v10/channels/${message.channelId}/messages/${message.lastSentMessageId}`
    : `https://discord.com/api/v10/channels/${message.channelId}/messages`;

  const { headers, body } = buildDiscordRequestBody(payload, attachments);

  const res = await fetch(url, { method: canEdit ? 'PATCH' : 'POST', headers, body });
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    return { ok: false, error: error?.message ?? 'Envoi Discord échoué', status: 502 };
  }

  const sent = (await res.json()) as { id: string; channel_id: string };
  const updated = await prisma.savedMessage.update({
    where: { id: message.id },
    data: { lastSentChannelId: sent.channel_id, lastSentMessageId: sent.id, updatedAt: new Date() },
  });

  return { ok: true, updated };
}
