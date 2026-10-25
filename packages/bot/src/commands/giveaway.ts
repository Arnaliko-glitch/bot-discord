import {
  AttachmentBuilder, ChannelType, InteractionContextType, MessageFlags,
  PermissionFlagsBits, SlashCommandBuilder, type ButtonInteraction,
} from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { SlashCommand } from './types.js';
import { finishGiveaway, giveawayMessage, syncGiveawayMessage, withGiveawayLock } from '../modules/giveaways/index.js';
import { startGiveawayDraft, type GiveawayDraft } from '../modules/giveaways/builder.js';
import { giveawayImageExtension, parseGiveawayDuration } from '../modules/giveaways/utils.js';

import { giveawayReply } from '../modules/giveaways/presentation.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function publishGiveaway(interaction: ButtonInteraction, draft: GiveawayDraft) {
  const duration = parseGiveawayDuration(draft.duration);
  if (duration === null) {
    await interaction.editReply(giveawayReply('Durée invalide : utilise par exemple 30s, 10m, 24h ou 1j 2h (de 10 secondes à 30 jours).'));
    return;
  }
  const prize = draft.prize.trim();
  if (!prize) {
    await interaction.editReply(giveawayReply('Le lot ne peut pas être vide.'));
    return;
  }
  const channelId = draft.channelId;
  const channel = await interaction.guild!.channels.fetch(channelId);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    await interaction.editReply(giveawayReply('Choisis un salon textuel dans lequel le bot peut publier.'));
    return;
  }
  const image = draft.attachment;
  const permissions = channel.permissionsFor(interaction.guild!.members.me!);
  const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks,
    channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages,
    ...(image || draft.thumbnail ? [PermissionFlagsBits.AttachFiles] : [])];
  if (!permissions?.has(required)) {
    await interaction.editReply(giveawayReply('Il manque au bot la permission de voir le salon, envoyer des messages, intégrer des liens ou joindre des fichiers.'));
    return;
  }
  for (const roleId of draft.mentionRoleIds) {
    const role = await interaction.guild!.roles.fetch(roleId);
    if (!role || (!role.mentionable && !permissions.has(PermissionFlagsBits.MentionEveryone))) {
      await interaction.editReply(giveawayReply('Un rôle sélectionné est introuvable ou ne peut pas être mentionné par le bot dans ce salon. Modifie les mentions ou les permissions.'));
      return;
    }
  }

  const attachments: AttachmentBuilder[] = [];
  let imageName: string | null = null;
  let thumbnailName: string | null = null;
  for (const [kind, file] of [['giveaway', image], ['thumbnail', draft.thumbnail]] as const) {
    if (!file) continue;
    const extension = giveawayImageExtension(file);
    if (!extension || file.size > MAX_IMAGE_BYTES) {
      await interaction.editReply(giveawayReply('Joins une image PNG, JPG, GIF ou WebP de 8 Mo maximum dans le champ image.'));
      return;
    }
    // On copie le fichier sur le message du bot : l'URL signée de la pièce
    // jointe à la commande ne doit pas devenir l'image permanente de l'embed.
    const response = await fetch(file.url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Téléchargement de l'image : HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      await interaction.editReply(giveawayReply('Cette image dépasse la limite de 8 Mo.'));
      return;
    }
    const name = `${kind}.${extension}`;
    if (kind === 'giveaway') imageName = name;
    else thumbnailName = name;
    attachments.push(new AttachmentBuilder(buffer, { name }));
  }

  const data = {
    id: draft.id, guildId: interaction.guildId!, channelId: channel.id,
    hostId: interaction.user.id, prize,
    winnerCount: draft.winnerCount, title: draft.title, description: draft.description,
    mentionRoleIds: draft.mentionRoleIds, showParticipants: draft.showParticipants,
    endsAt: new Date(Date.now() + duration), imageName, thumbnailName,
    status: 'active', winnerIds: [] as string[],
  };
  await withGiveawayLock(data.id, async () => {
    const message = await channel.send({ ...giveawayMessage(data, 0), files: attachments,
      allowedMentions: { parse: [], roles: draft.mentionRoleIds } });
    try {
      await prisma.giveaway.create({ data: { ...data, messageId: message.id, needsSync: false } });
    } catch (error) {
      await message.delete().catch((cleanupError) => console.error('Suppression du giveaway non enregistré impossible :', cleanupError));
      throw error;
    }
    draft.published = true;
    await interaction.editReply({ ...giveawayReply(`🎉 Giveaway créé : ${message.url}`), components: [] });
  });
}

export const giveawayCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Crée et gère les giveaways du serveur')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('creer').setDescription('Publie un giveaway avec un bouton de participation')
      .addStringOption((option) => option.setName('lot').setDescription('Le lot à gagner').setMaxLength(200))
      .addStringOption((option) => option.setName('duree').setDescription('Nombre + unité : s=secondes, m=minutes, h=heures, j=jours. Ex. 30s, 10m, 24h, 7j (10s à 30j)').setMaxLength(60))
      .addIntegerOption((option) => option.setName('gagnants').setDescription('Nombre de gagnants (1 par défaut)').setMinValue(1).setMaxValue(20))
      .addAttachmentOption((option) => option.setName('image').setDescription('Image affichée en grand dans l’embed (PNG, JPG, GIF, WebP ; 8 Mo max)'))
      .addChannelOption((option) => option.setName('salon').setDescription('Salon de publication (salon actuel par défaut)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((sub) => sub.setName('terminer').setDescription('Termine un giveaway et tire les gagnants immédiatement')
      .addStringOption((option) => option.setName('message').setDescription('Lien ou identifiant du message du giveaway').setRequired(true)))
    .addSubcommand((sub) => sub.setName('relancer').setDescription('Retire au sort en excluant les gagnants du dernier tirage')
      .addStringOption((option) => option.setName('message').setDescription('Lien ou identifiant du message du giveaway terminé').setRequired(true)))
    .addSubcommand((sub) => sub.setName('annuler').setDescription('Annule un giveaway sans désigner de gagnant')
      .addStringOption((option) => option.setName('message').setDescription('Lien ou identifiant du message du giveaway').setRequired(true))) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ ...giveawayReply('La permission « Gérer le serveur » est requise pour gérer les giveaways.'), flags: MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getSubcommand();
    if (action === 'creer') return startGiveawayDraft(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const input = interaction.options.getString('message', true).trim();
    const messageId = input.match(/^(?:https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/channels\/\d+\/\d+\/)?(\d{17,20})$/)?.[1];
    const giveaway = messageId ? await prisma.giveaway.findFirst({ where: { guildId: interaction.guildId!, messageId } }) : null;
    if (!giveaway) {
      await interaction.editReply(giveawayReply('Giveaway introuvable sur ce serveur. Fournis le lien de son message ou son identifiant.'));
      return;
    }
    await withGiveawayLock(giveaway.id, async () => {
      const current = await prisma.giveaway.findUniqueOrThrow({ where: { id: giveaway.id } });
      if (action === 'relancer' ? current.status !== 'ended' : current.status !== 'active') {
        await interaction.editReply(giveawayReply(action === 'relancer' ? 'Le giveaway doit être terminé pour refaire un tirage.' : 'Ce giveaway est déjà terminé ou annulé.'));
        return;
      }
      if (action === 'annuler') {
        await prisma.giveaway.update({ where: { id: current.id }, data: { status: 'cancelled', endedAt: new Date(), needsSync: true } });
        await syncGiveawayMessage(interaction.client, current.id).catch((error) => console.error('Synchronisation giveaway différée :', error));
      } else {
        try {
          await finishGiveaway(interaction.guild!, current, action === 'relancer', {
            notifyCreatorOfEnd: !(action === 'terminer' && interaction.user.id === current.hostId),
          });
        }
        catch (error) {
          if (error instanceof Error && error.message === 'Aucun autre participant éligible pour un nouveau tirage.') {
            await interaction.editReply(giveawayReply(error.message));
            return;
          }
          throw error;
        }
      }
      await interaction.editReply(giveawayReply(action === 'annuler' ? 'Giveaway annulé.' : action === 'relancer' ? 'Nouveau tirage enregistré ! Le message du giveaway est mis à jour.' : 'Giveaway terminé ! Le résultat est enregistré et le message est mis à jour.'));
    });
  },
};
