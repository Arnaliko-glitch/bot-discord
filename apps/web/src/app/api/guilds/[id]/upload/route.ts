import { NextRequest, NextResponse } from 'next/server';
import { mkdir, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// Stocké sous public/uploads pour que Next.js serve les fichiers directement
// par URL statique, sans route de lecture dédiée.
const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads');

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });

  const ext = ACCEPTED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Format non supporté (PNG, JPG, GIF, WEBP)' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Fichier trop volumineux (8 Mo max)' }, { status: 400 });
  }

  const dir = path.join(UPLOADS_ROOT, params.id);
  await mkdir(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return NextResponse.json({ url: `/uploads/${params.id}/${filename}` });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const url: string | undefined = body?.url;
  if (!url?.startsWith(`/uploads/${params.id}/`)) return NextResponse.json({ ok: true });

  const filePath = path.join(UPLOADS_ROOT, url.slice('/uploads/'.length));
  await unlink(filePath).catch(() => undefined);

  // Nettoie aussi le dossier de la guilde s'il ne contient plus rien.
  const dir = path.dirname(filePath);
  const remaining = await readdir(dir).catch(() => null);
  if (remaining && remaining.length === 0) await rmdir(dir).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
