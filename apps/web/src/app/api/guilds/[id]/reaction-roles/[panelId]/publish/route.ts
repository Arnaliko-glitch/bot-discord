import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { buildDiscordRequestBody, fetchStandaloneImage } from '@/lib/discord-attachment';
import { buildEmbedGroup, type EmbedData } from '@/lib/discord-embed';

type Params = { params: { id: string; panelId: string } };

interface Mapping {
  emoji: string;
  roleId: string;
}

// Convertit le format affiché stocké (<a:nom:id> / <:nom:id> / unicode brut,
// voir EmojiPickerPanel côté dashboard) vers le format attendu par l'API
// REST Discord pour cibler une réaction ("nom:id" pour un emoji personnalisé,
// le caractère lui-même pour un unicode).
function toReactionParam(stored: string): string {
  const custom = /^<a?:(\w+):(\d+)>$/.exec(stored);
  return custom ? `${custom[1]}:${custom[2]}` : stored;
}

// Ajoute/retire une réaction avec re-essai sur 429 (limite de débit Discord
// pour cet endpoint très facilement atteinte dès 5-6 réactions ajoutées
// d'affilée) — sans ça, `fetch` ne rejette PAS sur un 429 (seulement sur une
// vraie erreur réseau), donc un `.catch()` seul laissait passer l'échec en
// silence et certaines réactions n'étaient jamais ajoutées.
async function reactionRequest(
  method: 'PUT' | 'DELETE',
  channelId: string,
  messageId: string,
  param: string,
  token: string | undefined,
  attempt = 0
): Promise<void> {
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(param)}/@me`,
    { method, headers: { Authorization: `Bot ${token}` } }
  ).catch(() => null);
  if (!res) return;
  if (res.status === 429 && attempt < 3) {
    const body = (await res.json().catch(() => null)) as { retry_after?: number } | null;
    const retryAfterMs = Math.ceil(((body?.retry_after ?? 1) + 0.1) * 1000);
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    return reactionRequest(method, channelId, messageId, param, token, attempt + 1);
  }
  if (!res.ok) console.error(`Réaction ${method} ${param} échouée (${res.status})`);
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const panel = await prisma.reactionRolePanel.findUnique({ where: { id: params.panelId } });
  if (!panel || panel.guildId !== params.id) {
    return NextResponse.json({ error: 'Panneau introuvable' }, { status: 404 });
  }
  if (!panel.channelId) return NextResponse.json({ error: 'Choisissez un salon avant de publier.' }, { status: 400 });

  const mappings = (Array.isArray(panel.mappings) ? panel.mappings : []) as unknown as Mapping[];
  if (mappings.length === 0) {
    return NextResponse.json({ error: 'Ajoutez au moins un emoji lié à un rôle.' }, { status: 400 });
  }

  // Le texte du message est entièrement à la main de l'utilisateur (Contenu
  // / Image / Embed) — rien n'est généré ni ajouté automatiquement à partir
  // des rôles réactions.
  const panelEmbed = (panel.embedData ?? null) as EmbedData | null;
  const embeds = panelEmbed ? buildEmbedGroup(panelEmbed).filter((e) => Object.keys(e).length > 0) : [];
  const content = panel.content || undefined;

  if (!content && embeds.length === 0 && !panel.imageUrl) {
    return NextResponse.json(
      { error: 'Remplissez au moins un des trois : Contenu, Image ou Embed.' },
      { status: 400 }
    );
  }

  const attachment = panel.imageUrl ? await fetchStandaloneImage(panel.imageUrl, params.id) : null;
  const basePayload = { content, embeds };
  const token = process.env.DISCORD_BOT_TOKEN;
  const { headers, body } = buildDiscordRequestBody(basePayload, attachment ? [attachment] : []);

  // Republier après avoir changé de salon depuis le dashboard : le message
  // existant (dans l'ancien salon) ne peut plus être édité via ce salon —
  // on retente alors comme une publication neuve plutôt que d'échouer.
  let res = panel.messageId
    ? await fetch(`https://discord.com/api/v10/channels/${panel.channelId}/messages/${panel.messageId}`, {
        method: 'PATCH',
        headers,
        body,
      })
    : null;

  if (!res || !res.ok) {
    res = await fetch(`https://discord.com/api/v10/channels/${panel.channelId}/messages`, {
      method: 'POST',
      headers,
      body,
    });
  }

  if (!res.ok) {
    const error = await res.json().catch(() => null);
    return NextResponse.json({ error: error?.message ?? 'Publication Discord échouée' }, { status: 502 });
  }

  const sent = (await res.json()) as {
    id: string;
    channel_id: string;
    reactions?: { me: boolean; emoji: { id: string | null; name: string } }[];
  };

  // Ajoute une réaction du bot pour chaque emoji mappé (idempotent — déjà
  // présente ne fait rien), puis retire celles laissées par une ancienne
  // version du panneau qui ne correspondent plus à aucun rôle mappé.
  const wantedParams = new Set(mappings.map((m) => toReactionParam(m.emoji)));
  for (const param of wantedParams) {
    await reactionRequest('PUT', sent.channel_id, sent.id, param, token);
  }
  for (const r of sent.reactions ?? []) {
    if (!r.me) continue;
    const key = r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name;
    if (wantedParams.has(key)) continue;
    await reactionRequest('DELETE', sent.channel_id, sent.id, key, token);
  }

  const updated = await prisma.reactionRolePanel.update({
    where: { id: panel.id },
    data: { messageId: sent.id, channelId: sent.channel_id, updatedAt: new Date() },
  });
  return NextResponse.json(updated);
}
