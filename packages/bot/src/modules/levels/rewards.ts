import { AttachmentBuilder, EmbedBuilder, type Guild, type GuildMember, type GuildTextBasedChannel } from 'discord.js';
import crypto from 'node:crypto';
import { prisma } from '@discord-bot-dashboard/database';
import type { LevelRole, XpSettings } from '@discord-bot-dashboard/database';
import { generateCelebrationCard } from '../../utils/celebrationCard.js';

const REWARD_FALLBACK_ACCENT = '#ED4245';

function applyPlaceholders(template: string, member: GuildMember, level: number) {
  return template
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{reward.level}', String(level))
    .replaceAll('{level}', String(level));
}

async function resolveAnnounceChannel(
  guild: Guild,
  mode: string,
  channelId: string | null,
  sourceChannelId: string | null
): Promise<GuildTextBasedChannel | null> {
  if (mode === 'disabled') return null;
  const targetId = mode === 'channel' ? channelId : sourceChannelId;
  if (!targetId) return null;
  const channel = await guild.channels.fetch(targetId).catch(() => null);
  return channel?.isTextBased() ? channel : null;
}

// Applique les récompenses de niveau (rôles) franchies en passant de
// oldLevel à newLevel, puis annonce chaque récompense obtenue.
export async function applyLevelRewards(
  member: GuildMember,
  settings: XpSettings,
  oldLevel: number,
  newLevel: number,
  sourceChannelId: string | null
) {
  if (newLevel <= oldLevel) return;

  const rewards = await prisma.levelRole.findMany({
    where: { guildId: member.guild.id, level: { gt: oldLevel, lte: newLevel } },
    orderBy: { level: 'asc' },
  });
  if (rewards.length === 0) return;

  // Toutes les récompenses "rôle évolutif" du serveur — pour retirer les
  // rôles évolutifs plus anciens lorsqu'on en atteint un nouveau. Requête
  // évitée si aucune des récompenses franchies n'est elle-même évolutive.
  const hasEvolveReward = rewards.some((r) => r.rewardType === 'role' && r.stackMode === 'evolve');
  const evolveRoleIds = hasEvolveReward
    ? await prisma.levelRole.findMany({
        where: { guildId: member.guild.id, rewardType: 'role', stackMode: 'evolve' },
        select: { roleId: true },
      })
    : [];

  for (const reward of rewards) {
    await grantReward(member, reward, evolveRoleIds.map((r) => r.roleId));
  }

  const channel = await resolveAnnounceChannel(
    member.guild,
    settings.rewardAnnounceMode,
    settings.rewardChannelId,
    sourceChannelId
  );
  if (!channel) return;

  for (const reward of rewards) {
    const role = await member.guild.roles.fetch(reward.roleId).catch(() => null);
    if (!role) continue;
    const accentColor = role.color ? role.hexColor : REWARD_FALLBACK_ACCENT;
    const description = applyPlaceholders(settings.rewardMessage, member, reward.level);
    const card = await generateCelebrationCard({
      avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
      accentColor,
      line1: 'vous recevez le rôle',
      line2: `@${role.name}`,
      emoji: '🎉',
    });
    const attachment = new AttachmentBuilder(card, { name: 'reward.png' });
    const embed = new EmbedBuilder().setColor(accentColor).setImage('attachment://reward.png');
    await channel.send({ content: description, embeds: [embed], files: [attachment] }).catch(() => undefined);
  }
}

async function grantReward(member: GuildMember, reward: LevelRole, evolveRoleIds: string[]) {
  if (reward.rewardType === 'temporary_role') {
    await member.roles.add(reward.roleId).catch((err) => console.error('Ajout rôle temporaire échoué:', err));
    if (reward.durationSeconds) {
      await prisma.temporaryRoleGrant
        .create({
          data: {
            id: crypto.randomUUID(),
            guildId: member.guild.id,
            userId: member.id,
            roleId: reward.roleId,
            expiresAt: new Date(Date.now() + reward.durationSeconds * 1000),
          },
        })
        .catch((err) => console.error('Enregistrement expiration rôle temporaire échoué:', err));
    }
    return;
  }

  if (reward.stackMode === 'evolve') {
    const toRemove = evolveRoleIds.filter((id) => id !== reward.roleId && member.roles.cache.has(id));
    if (toRemove.length > 0) {
      await member.roles.remove(toRemove).catch((err) => console.error('Retrait ancien rôle évolutif échoué:', err));
    }
  }

  await member.roles.add(reward.roleId).catch((err) => console.error('Ajout rôle de récompense échoué:', err));
}

export { resolveAnnounceChannel, applyPlaceholders };
