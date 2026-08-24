import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { buildDiscordRequestBody, fetchStandaloneImage } from '@/lib/discord-attachment';
import { buildOneEmbed, type EmbedData } from '@/lib/discord-embed';

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
  const embeds = panelEmbed ? [buildOneEmbed(panelEmbed)].filter((e) => Object.keys(e).length > 0) : [];
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
    await fetch(
      `https://discord.com/api/v10/channels/${sent.channel_id}/messages/${sent.id}/reactions/${encodeURIComponent(param)}/@me`,
      { method: 'PUT', headers: { Authorization: `Bot ${token}` } }
    ).catch(() => undefined);
  }
  for (const r of sent.reactions ?? []) {
    if (!r.me) continue;
    const key = r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name;
    if (wantedParams.has(key)) continue;
    await fetch(
      `https://discord.com/api/v10/channels/${sent.channel_id}/messages/${sent.id}/reactions/${encodeURIComponent(key)}/@me`,
      { method: 'DELETE', headers: { Authorization: `Bot ${token}` } }
    ).catch(() => undefined);
  }

  const updated = await prisma.reactionRolePanel.update({
    where: { id: panel.id },
    data: { messageId: sent.id, channelId: sent.channel_id, updatedAt: new Date() },
  });
  return NextResponse.json(updated);
}
