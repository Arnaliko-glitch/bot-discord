import { AttachmentBuilder, EmbedBuilder, Events, type GuildMember } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../../client.js';
import { generateWelcomeBanner } from '../../utils/welcomeBanner.js';

// `userAsMention` ne veut PAS dire "notifier le membre" — une mention dans
// une description d'embed ne ping personne, elle s'affiche juste en bleu.
// Vrai uniquement pour le corps du message (Discord y résout les mentions) ;
// toujours faux pour titre/pied de page (texte brut, pas de résolution).
// Le ping réel est un mécanisme séparé (voir handleJoinOrLeave, `content`).
function applyPlaceholders(template: string, member: GuildMember, userAsMention: boolean) {
  return template
    .replaceAll('{user}', userAsMention ? `<@${member.id}>` : member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{server.membercount}', String(member.guild.memberCount));
}

function hexToInt(hex: string): number {
  const parsed = parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(parsed) ? 0xed4245 : parsed;
}

// "il y a X secondes/minutes/heures/jours/mois/années" — unité la plus
// grande qui donne au moins 1 (ex: 45 jours → "1 mois", pas "45 jours").
function formatRelativeDuration(from: Date): string {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - from.getTime()) / 1000));
  const units: [string, string, number][] = [
    ['an', 'ans', 60 * 60 * 24 * 365],
    ['mois', 'mois', 60 * 60 * 24 * 30],
    ['jour', 'jours', 60 * 60 * 24],
    ['heure', 'heures', 60 * 60],
    ['minute', 'minutes', 60],
    ['seconde', 'secondes', 1],
  ];
  for (const [singular, plural, secondsInUnit] of units) {
    const value = Math.floor(totalSeconds / secondsInUnit);
    if (value >= 1) return `${value} ${value > 1 ? plural : singular}`;
  }
  return 'moins d\'une seconde';
}

async function handleJoinOrLeave(member: GuildMember, kind: 'welcome' | 'goodbye') {
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config || !config.moduleEnabled) return;

  const enabled = kind === 'welcome' ? config.enabled : config.goodbyeEnabled;
  const channelId = kind === 'welcome' ? config.channelId : config.goodbyeChannelId;
  // Ping réel séparé (voir plus bas) — n'affecte pas le rendu de {user} dans
  // le texte, qui est toujours une mention (cosmétique, ne notifie pas).
  // Aucun sens au départ : le membre n'est plus sur le serveur pour le recevoir.
  const shouldPing = kind === 'welcome' && config.mentionUser;
  const template = kind === 'welcome' ? config.message : config.goodbyeMessage;
  const description = applyPlaceholders(template, member, true);

  if (kind === 'welcome' && config.dmWelcome) {
    await member.send({ content: description }).catch(() => undefined); // DM fermé : on ignore.
  }

  if (!enabled || !channelId) return;

  const channel = member.guild.channels.cache.get(channelId) ?? (await member.guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased()) return;

  const backgroundImagePath = kind === 'welcome' ? config.backgroundImage : config.goodbyeBackgroundImage;
  // Chemin relatif (/uploads/...) stocké par le dashboard : le bot tourne
  // dans un process séparé, il lui faut l'URL complète du serveur web pour aller la charger.
  // Une URL externe collée directement dans le dashboard est déjà absolue —
  // on ne la préfixe pas, sinon on obtient une URL invalide.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const backgroundImage = !backgroundImagePath
    ? null
    : /^https?:\/\//i.test(backgroundImagePath)
      ? backgroundImagePath
      : `${appUrl}${backgroundImagePath}`;

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
    // atteignable depuis le dashboard, qui force toujours l'embed. Ici {user}
    // finit en contenu de message brut (pas dans un embed), donc une mention
    // notifie réellement — on suit `shouldPing` plutôt que le forcer.
    await channel.send({ content: applyPlaceholders(template, member, shouldPing), files: [attachment] });
    return;
  }

  const embedTitle = kind === 'welcome' ? config.embedTitle : config.goodbyeEmbedTitle;
  const embedFooter = kind === 'welcome' ? config.embedFooter : config.goodbyeEmbedFooter;
  const sidebarColor = kind === 'welcome' ? config.sidebarColor : config.goodbyeSidebarColor;

  const embed = new EmbedBuilder().setColor(hexToInt(sidebarColor)).setDescription(description).setImage('attachment://welcome.png');
  if (embedTitle) embed.setTitle(applyPlaceholders(embedTitle, member, false));

  // Pied de page : ancienneté du membre au départ (member.joinedAt reste
  // renseigné sur l'objet reçu par GuildMemberRemove, sauf cas rare de
  // données partielles) combinée au pied de page personnalisé s'il y en a un.
  const customFooter = embedFooter ? applyPlaceholders(embedFooter, member, false) : null;
  const joinDurationFooter = kind === 'goodbye' && member.joinedAt ? `Avait rejoint le serveur il y a ${formatRelativeDuration(member.joinedAt)}` : null;
  const footerText = [joinDurationFooter, customFooter].filter(Boolean).join(' • ');
  if (footerText) embed.setFooter({ text: footerText });

  // Mentionner dans l'embed seul ne notifie pas le membre — on ajoute un
  // vrai ping séparé en content, seulement si l'option est activée.
  await channel.send({
    content: shouldPing ? `<@${member.id}>` : undefined,
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
