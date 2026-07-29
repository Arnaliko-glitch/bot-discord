import type { BotClient } from '../client.js';
import { prisma, type Prisma } from '@discord-bot-dashboard/database';
import { BOT_MODULES } from '@discord-bot-dashboard/shared';

export async function ensureGuild(guildId: string, name: string, ownerId: string, icon?: string | null) {
  const existing = await prisma.guild.findUnique({ where: { id: guildId } });
  if (existing) {
    return prisma.guild.update({
      where: { id: guildId },
      data: { name, ownerId, icon: icon ?? null },
    });
  }

  return prisma.guild.create({
    data: {
      id: guildId,
      name,
      ownerId,
      icon: icon ?? null,
      settings: { create: {} },
      welcomeConfig: { create: {} },
      ticketConfig: { create: {} },
      xpSettings: { create: {} },
      moduleConfigs: {
        create: BOT_MODULES.map((module) => ({ module, enabled: true })),
      },
    },
  });
}

export function replacePlaceholders(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

export async function createLogEntry(
  guildId: string,
  type: string,
  data: {
    actorId?: string;
    actorName?: string;
    targetId?: string;
    targetName?: string;
    channelId?: string;
    reason?: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return prisma.logEntry.create({
    data: {
      guildId,
      type,
      ...data,
      metadata: data.metadata ?? undefined,
    },
  });
}
