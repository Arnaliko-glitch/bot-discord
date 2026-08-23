import crypto from 'node:crypto';
import { AttachmentBuilder, EmbedBuilder, type GuildMember } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { XpSettings } from '@discord-bot-dashboard/database';
import { levelForXp } from '@discord-bot-dashboard/shared';
import { applyLevelRewards, applyPlaceholders, resolveAnnounceChannel } from './rewards.js';
import { generateCelebrationCard } from '../../utils/celebrationCard.js';

const LEVEL_UP_ACCENT = '#F0A020';

// Ajoute de l'xp à un membre (message ou vocal — la source ne détermine que
// le calcul du montant en amont), gère le passage de niveau, l'annonce et
// l'attribution des récompenses de niveau associées.
export async function grantXp(
  member: GuildMember,
  settings: XpSettings,
  amount: number,
  sourceChannelId: string | null
) {
  // Un seul aller-retour DB dans le cas courant : `level` n'est pas touché
  // par cet upsert, donc la ligne renvoyée porte encore l'ancien niveau —
  // pas besoin d'un `findUnique` séparé juste pour le lire avant d'écrire.
  const updated = await prisma.userXp.upsert({
    where: { guildId_discordUserId: { guildId: member.guild.id, discordUserId: member.id } },
    update: {
      xp: { increment: amount },
      username: member.displayName,
      avatar: member.user.avatar,
      updatedAt: new Date(),
    },
    create: {
      id: crypto.randomUUID(),
      guildId: member.guild.id,
      discordUserId: member.id,
      username: member.displayName,
      avatar: member.user.avatar,
      xp: amount,
      level: 0,
      updatedAt: new Date(),
    },
  });

  const oldLevel = updated.level;
  const newLevel = levelForXp(updated.xp, settings.curveStyle, settings.curveMultiplier, settings.maxLevel);

  // Second aller-retour seulement quand le niveau a réellement changé (rare).
  if (newLevel !== oldLevel) {
    await prisma.userXp.update({
      where: { guildId_discordUserId: { guildId: member.guild.id, discordUserId: member.id } },
      data: { level: newLevel },
    });
  }

  if (newLevel > oldLevel) {
    if (newLevel >= settings.levelUpMinLevel) {
      const channel = await resolveAnnounceChannel(
        member.guild,
        settings.levelUpAnnounceMode,
        settings.levelUpChannelId,
        sourceChannelId
      );
      if (channel) {
        const description = applyPlaceholders(settings.levelUpMessage, member, newLevel);
        const card = await generateCelebrationCard({
          avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
          accentColor: LEVEL_UP_ACCENT,
          line1: 'vous avez atteint',
          line2: `le niveau ${newLevel}`,
        });
        const attachment = new AttachmentBuilder(card, { name: 'levelup.png' });
        const embed = new EmbedBuilder().setColor(LEVEL_UP_ACCENT).setImage('attachment://levelup.png');
        await channel.send({ content: description, embeds: [embed], files: [attachment] }).catch(() => undefined);
      }
    }
    await applyLevelRewards(member, settings, oldLevel, newLevel, sourceChannelId);
  }
}

export async function resetUserXp(guildId: string, userId: string) {
  await prisma.userXp
    .deleteMany({ where: { guildId, discordUserId: userId } })
    .catch((err) => console.error('Réinitialisation xp échouée:', err));
}
