import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { sendSavedMessage } from '@/lib/send-saved-message';

type Params = { params: { id: string; messageId: string } };

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

  const requestBody = await request.json().catch(() => ({}));
  const mode: 'resend' | 'edit' = requestBody?.mode === 'edit' ? 'edit' : 'resend';

  const result = await sendSavedMessage(message, mode);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.updated);
}
