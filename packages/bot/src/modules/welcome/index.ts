import { AttachmentBuilder, EmbedBuilder, Events, type GuildMember } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../../client.js';
import { generateWelcomeBanner } from '../../utils/welcomeBanner.js';

function applyPlaceholders(template: string, member: GuildMember, mention: boolean) {
  return template
    .replaceAll('{user}', mention ? `<@${member.id}>` : member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{server.membercount}', String(member.guild.memberCount));
}

function hexToInt(hex: string): number {
  const parsed = parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(parsed) ? 0xed4245 : parsed;
}

async function handleJoinOrLeave(member: GuildMember, kind: 'welcome' | 'goodbye') {
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config || !config.moduleEnabled) return;

  const enabled = kind === 'welcome' ? config.enabled : config.goodbyeEnabled;
  const channelId = kind === 'welcome' ? config.channelId : config.goodbyeChannelId;
  const mention = kind === 'welcome' ? config.mentionUser : config.goodbyeMentionUser;
  const template = kind === 'welcome' ? config.message : config.goodbyeMessage;
  const description = applyPlaceholders(template, member, mention);

  if (kind === 'welcome' && config.dmWelcome) {
    await member.send({ content: description }).catch(() => undefined); // DM fermé : on ignore.
  }

  if (!enabled || !channelId) return;

  const channel = member.guild.channels.cache.get(channelId) ?? (await member.guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased()) return;

  const backgroundImagePath = kind === 'welcome' ? config.backgroundImage : config.goodbyeBackgroundImage;
  // Chemin relatif (/uploads/...) stocké par le dashboard : le bot tourne
  // dans un process séparé, il lui faut l'URL complète du serveur web pour aller la charger.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const backgroundImage = backgroundImagePath ? `${appUrl}${backgroundImagePath}` : null;

  const banner = await generateWelcomeBanner({
    kind,
    avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
    guildName: member.guild.name,
    backgroundImage,
    backgroundColor: kind === 'welcome' ? config.backgroundColor : config.goodbyeBackgroundColor,
    backgroundOverlay: kind === 'welcome' ? config.backgroundOverlay : config.goodbyeBackgroundOverlay,
  });
  const attachment = new AttachmentBuilder(banner, { name: 'welcome.png' });

  const useEmbed = kind === 'welcome' ? config.useEmbed : config.goodbyeUseEmbed;
  if (!useEmbed) {
    // Repli sans embed (ex: ancienne ligne en base) — plus vraiment
    // atteignable depuis le dashboard, qui force toujours l'embed.
    await channel.send({ content: description, files: [attachment] });
    return;
  }

  const embedTitle = kind === 'welcome' ? config.embedTitle : config.goodbyeEmbedTitle;
  const embedFooter = kind === 'welcome' ? config.embedFooter : config.goodbyeEmbedFooter;
  const sidebarColor = kind === 'welcome' ? config.sidebarColor : config.goodbyeSidebarColor;

  const embed = new EmbedBuilder().setColor(hexToInt(sidebarColor)).setDescription(description).setImage('attachment://welcome.png');
  if (embedTitle) embed.setTitle(applyPlaceholders(embedTitle, member, false));
  if (embedFooter) embed.setFooter({ text: applyPlaceholders(embedFooter, member, false) });

  // Mentionner dans l'embed seul ne notifie pas le membre — on ajoute un
  // ping séparé en content quand l'option est activée.
  await channel.send({
    content: mention ? `<@${member.id}>` : undefined,
    embeds: [embed],
    files: [attachment],
  });
}

export const welcomeModule: BotModuleHandler = {
  name: 'welcome',
  register(client: BotClient) {
    client.on(Events.GuildMemberAdd, (member) => {
      handleJoinOrLeave(member, 'welcome').catch((err) => console.error('welcome module (join) failed:', err));
    });
    client.on(Events.GuildMemberRemove, (member) => {
      if (!member.guild) return;
      handleJoinOrLeave(member as GuildMember, 'goodbye').catch((err) =>
        console.error('welcome module (leave) failed:', err)
      );
    });
  },
};
