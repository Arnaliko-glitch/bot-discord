import { NextRequest, NextResponse } from 'next/server';
import { readdir, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string; panelId: string } };

const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads');

// Même logique que la route DELETE d'upload — appelée directement ici (pas
// via un fetch interne) pour rester cohérente avec le reste du projet.
async function deleteUploadedFile(guildId: string, url: string | null | undefined) {
  if (!url?.startsWith(`/uploads/${guildId}/`)) return;
  const filePath = path.join(UPLOADS_ROOT, url.slice('/uploads/'.length));
  await unlink(filePath).catch(() => undefined);
  const dir = path.dirname(filePath);
  const remaining = await readdir(dir).catch(() => null);
  if (remaining && remaining.length === 0) await rmdir(dir).catch(() => undefined);
}

const MAX_MAPPINGS = 20;

interface MappingInput {
  emoji: string;
  roleId: string;
}

function sanitizeMappings(raw: unknown): MappingInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is MappingInput =>
        typeof m === 'object' && m !== null && typeof (m as MappingInput).emoji === 'string' && typeof (m as MappingInput).roleId === 'string'
    )
    .map((m) => ({ emoji: m.emoji.slice(0, 100), roleId: m.roleId }))
    .slice(0, MAX_MAPPINGS);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const existing = await prisma.reactionRolePanel.findUnique({ where: { id: params.panelId } });
  if (!existing || existing.guildId !== params.id) {
    return NextResponse.json({ error: 'Panneau introuvable' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

  const updated = await prisma.reactionRolePanel.update({
    where: { id: params.panelId },
    data: {
      name: body.name !== undefined ? String(body.name).slice(0, 100) : existing.name,
      channelId: body.channelId !== undefined ? body.channelId || null : existing.channelId,
      content: body.content !== undefined ? (body.content ? String(body.content).slice(0, 2000) : null) : existing.content,
      imageUrl: body.imageUrl !== undefined ? body.imageUrl || null : existing.imageUrl,
      // Même contrat que le module Messages : le JSON de l'embed est stocké
      // tel quel, pas de validation profonde côté serveur.
      embedData: body.embedData !== undefined ? body.embedData : existing.embedData ?? undefined,
      mappings: body.mappings !== undefined ? (sanitizeMappings(body.mappings) as object[]) : existing.mappings ?? undefined,
      updatedAt: new Date(),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const existing = await prisma.reactionRolePanel.findUnique({ where: { id: params.panelId } });
  if (!existing || existing.guildId !== params.id) {
    return NextResponse.json({ error: 'Panneau introuvable' }, { status: 404 });
  }

  await prisma.reactionRolePanel.delete({ where: { id: params.panelId } });

  // Best-effort : le message publié n'a plus lieu d'exister sans son
  // panneau (les réactions dessus ne feraient plus rien).
  if (existing.channelId && existing.messageId) {
    const token = process.env.DISCORD_BOT_TOKEN;
    await fetch(`https://discord.com/api/v10/channels/${existing.channelId}/messages/${existing.messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bot ${token}` },
    }).catch(() => undefined);
  }
  const embed = (existing.embedData ?? null) as { imageUrl?: string | null; thumbnailUrl?: string | null; authorIconUrl?: string | null; footerIconUrl?: string | null } | null;
  await Promise.all(
    [existing.imageUrl, embed?.imageUrl, embed?.thumbnailUrl, embed?.authorIconUrl, embed?.footerIconUrl].map((url) =>
      deleteUploadedFile(params.id, url)
    )
  );

  return NextResponse.json({ ok: true });
}
