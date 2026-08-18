import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string; messageId: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const existing = await prisma.savedMessage.findUnique({ where: { id: params.messageId } });
  if (!existing || existing.guildId !== params.id) {
    return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

  // Mise à jour partielle : un champ absent du corps de la requête garde sa
  // valeur existante plutôt que d'être réinitialisé (utilisé par exemple
  // pour ne renommer qu'un brouillon sans toucher au reste).
  const updated = await prisma.savedMessage.update({
    where: { id: params.messageId },
    data: {
      name: body.name !== undefined ? String(body.name).slice(0, 100) : existing.name,
      channelId: body.channelId !== undefined ? body.channelId || null : existing.channelId,
      content:
        body.content !== undefined ? (body.content != null ? String(body.content).slice(0, 2000) : null) : existing.content,
      embedData: body.embedData !== undefined ? body.embedData : existing.embedData ?? undefined,
      imageUrls:
        body.imageUrls !== undefined
          ? Array.isArray(body.imageUrls)
            ? body.imageUrls.filter((u: unknown) => typeof u === 'string')
            : []
          : existing.imageUrls,
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

  const existing = await prisma.savedMessage.findUnique({ where: { id: params.messageId } });
  if (!existing || existing.guildId !== params.id) {
    return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
  }

  await prisma.savedMessage.delete({ where: { id: params.messageId } });
  return NextResponse.json({ ok: true });
}
