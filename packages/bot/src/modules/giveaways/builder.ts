import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, FileUploadBuilder, LabelBuilder, MessageFlags, ModalBuilder,
  PermissionFlagsBits, RoleSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type Attachment, type ButtonInteraction, type ChannelSelectMenuInteraction,
  type ChatInputCommandInteraction, type ModalSubmitInteraction, type StringSelectMenuInteraction,
} from 'discord.js';
import { publishGiveaway } from '../../commands/giveaway.js';
import { withGiveawayLock } from './index.js';
import { giveawayImageExtension, parseGiveawayDuration } from './utils.js';
import { GIVEAWAY_COLOR, giveawayReply } from './presentation.js';
import { giveawayMentionsEmoji } from './emojis.js';

export const GIVEAWAY_DRAFT_PREFIX = 'giveaway-draft:';
export interface GiveawayDraft {
  id: string; ownerId: string; guildId: string; channelId: string;
  title: string; description: string; prize: string; duration: string; winnerCount: number;
  attachment: Attachment | null; thumbnail: Attachment | null; expiresAt: number; published: boolean;
  mentionRoleIds: string[]; showParticipants: boolean;
}
const drafts = new Map<string, GiveawayDraft>();
const ttl = 14 * 60_000;
const cleanup = setInterval(() => {
  for (const [id, draft] of drafts) if (draft.expiresAt < Date.now()) drafts.delete(id);
}, 60_000);
cleanup.unref();

function customId(draft: GiveawayDraft, action: string) { return `${GIVEAWAY_DRAFT_PREFIX}${draft.id}:${action}`; }
function input(id: string, label: string, value: string, max: number, required = true, paragraph = false) {
  const field = new TextInputBuilder().setCustomId(id).setLabel(label).setMaxLength(max)
    .setRequired(required).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short);
  if (value) field.setValue(value);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(field);
}
function rewardModal(draft: GiveawayDraft, initial = false) {
  return new ModalBuilder().setCustomId(customId(draft, initial ? 'initial' : 'reward-submit'))
    .setTitle('Récompense personnalisée').addComponents(
      input('prize', 'Description de la récompense', draft.prize, 200, true, true));
}

export function giveawayDraftMessage(draft: GiveawayDraft) {
  const embed = new EmbedBuilder().setColor(0xed4245).setTitle(draft.title || draft.prize || 'Nouveau giveaway')
    .setDescription([draft.description ? `${draft.description.split('\n').map((line) => `> ${line}`).join('\n')}\n` : null, `**Récompense :** ${draft.prize || 'À définir'}`,
      `**${draft.winnerCount > 1 ? 'Gagnants' : 'Gagnant'} :** ${draft.winnerCount}`,
      `\n**Fin :** ${draft.duration} après le lancement`,
    ].filter(Boolean).join('\n'));
  if (draft.attachment) embed.setImage(draft.attachment.url);
  if (draft.thumbnail) embed.setThumbnail(draft.thumbnail.url);
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...[['title', 'Titre & description'], ['duration', 'Durée'], ['reward', 'Récompense'],
      ['winners', 'Gagnants'], ['channel', 'Salon']].map(([action, label]) => new ButtonBuilder()
      .setCustomId(customId(draft, action)).setLabel(label).setStyle(ButtonStyle.Secondary)));
  const advanced = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
    .setCustomId(customId(draft, 'advanced')).setPlaceholder('Configurer des options avancées…')
    .addOptions(
      { label: 'Ajouter des images', description: 'Vignette et grande image du giveaway', value: 'images', emoji: '🖼️' },
      { label: giveawayMentionsEmoji() ? 'Mentions' : '@ Mentions', description: 'Choisir les rôles à mentionner au lancement', value: 'mentions', emoji: giveawayMentionsEmoji() },
      { label: draft.showParticipants ? 'Masquer le bouton Participants' : 'Afficher le bouton Participants', value: 'participants', emoji: draft.showParticipants ? '✅' : '❌' },
    ));
  const launch = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId(draft, 'launch')).setLabel('Lancer le giveaway').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customId(draft, 'cancel')).setLabel('Annuler').setStyle(ButtonStyle.Danger));
  return { content: draft.mentionRoleIds.map((id) => `<@&${id}>`).join(' '), embeds: [embed],
    components: [buttons, advanced, launch], allowedMentions: { parse: [] as const } };
}

export async function startGiveawayDraft(interaction: ChatInputCommandInteraction) {
  const draft: GiveawayDraft = {
    id: interaction.id, ownerId: interaction.user.id, guildId: interaction.guildId!,
    channelId: interaction.options.getChannel('salon')?.id ?? interaction.channelId,
    title: '', description: '', prize: interaction.options.getString('lot')?.trim() ?? '',
    duration: interaction.options.getString('duree') ?? '3j', winnerCount: interaction.options.getInteger('gagnants') ?? 1,
    attachment: interaction.options.getAttachment('image'), thumbnail: null, expiresAt: Date.now() + ttl, published: false,
    mentionRoleIds: [], showParticipants: true,
  };
  if (parseGiveawayDuration(draft.duration) === null) {
    await interaction.reply({ ...giveawayReply('Durée invalide : utilise 30s, 10m, 24h ou 3j (10 secondes à 30 jours).'), flags: MessageFlags.Ephemeral });
    return;
  }
  drafts.set(draft.id, draft);
  if (!draft.prize) await interaction.showModal(rewardModal(draft, true));
  else await interaction.reply({ ...giveawayDraftMessage(draft), flags: MessageFlags.Ephemeral });
}

type DraftInteraction = ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction | ChannelSelectMenuInteraction;
export async function handleGiveawayDraftInteraction(interaction: DraftInteraction) {
  const [id, action] = interaction.customId.slice(GIVEAWAY_DRAFT_PREFIX.length).split(':');
  await withGiveawayLock(`draft:${id}`, async () => {
    const draft = drafts.get(id);
    if (!draft || draft.expiresAt < Date.now() || draft.published) {
      await interaction.reply({ ...giveawayReply('Cette préparation a expiré ou a déjà été lancée. Utilise /giveaway creer.'), flags: MessageFlags.Ephemeral });
      return;
    }
    if (draft.ownerId !== interaction.user.id || draft.guildId !== interaction.guildId
      || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ ...giveawayReply('Seul le créateur avec la permission « Gérer le serveur » peut configurer ce giveaway.'), flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.isModalSubmit()) {
      if (action === 'initial' || action === 'reward-submit') {
        const prize = interaction.fields.getTextInputValue('prize').trim();
        if (!prize) return invalid(interaction, 'La récompense ne peut pas être vide.');
        draft.prize = prize;
      } else if (action === 'title-submit') {
        draft.title = interaction.fields.getTextInputValue('title').trim();
        draft.description = interaction.fields.getTextInputValue('description').trim();
      } else if (action === 'duration-submit') {
        const duration = interaction.fields.getTextInputValue('duration').trim();
        if (parseGiveawayDuration(duration) === null) return invalid(interaction, 'Durée invalide : 10s à 30j, par exemple 3j ou 1j 2h.');
        draft.duration = duration;
      } else if (action === 'winners-submit') {
        const raw = interaction.fields.getTextInputValue('winners').trim();
        if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 20) return invalid(interaction, 'Choisis entre 1 et 20 gagnants.');
        draft.winnerCount = Number(raw);
      } else if (action === 'mentions-submit') {
        draft.mentionRoleIds = [...(interaction.fields.getSelectedRoles('roles')?.keys() ?? [])];
      } else if (action === 'images-submit') {
        const image = interaction.fields.getUploadedFiles('image')?.first() ?? null;
        const thumbnail = interaction.fields.getUploadedFiles('thumbnail')?.first() ?? null;
        if ([image, thumbnail].some((file) => file && (!giveawayImageExtension(file) || file.size > 8 * 1024 * 1024))) {
          return invalid(interaction, 'Choisis des images PNG, JPG, GIF ou WebP de 8 Mo maximum.');
        }
        draft.attachment = image;
        draft.thumbnail = thumbnail;
      }
      if (action === 'initial') await interaction.reply({ ...giveawayDraftMessage(draft), flags: MessageFlags.Ephemeral });
      else if (interaction.isFromMessage()) await interaction.update(giveawayDraftMessage(draft));
      return;
    }
    if (interaction.isChannelSelectMenu()) {
      draft.channelId = interaction.values[0];
      await interaction.update(giveawayDraftMessage(draft));
      return;
    }
    if (interaction.isStringSelectMenu() && action === 'advanced') {
      const selected = interaction.values[0];
      if (selected === 'participants') {
        draft.showParticipants = !draft.showParticipants;
        await interaction.update(giveawayDraftMessage(draft));
        await interaction.followUp({
          embeds: [new EmbedBuilder().setColor(GIVEAWAY_COLOR).setDescription(draft.showParticipants
            ? '✅ Le bouton Participants a été **activé**. Les membres pourront voir la liste des participants en cliquant sur ce bouton sous le message du giveaway.'
            : '✅ Le bouton Participants a été **désactivé**. Les membres ne pourront pas voir la liste des participants.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (selected === 'mentions') {
        const roles = new RoleSelectMenuBuilder().setCustomId('roles').setRequired(false)
          .setMinValues(0).setMaxValues(10).setPlaceholder('Choisir les rôles à mentionner');
        if (draft.mentionRoleIds.length) roles.setDefaultRoles(...draft.mentionRoleIds);
        await interaction.showModal(new ModalBuilder().setCustomId(customId(draft, 'mentions-submit')).setTitle('Mentions')
          .addLabelComponents(new LabelBuilder().setLabel('Rôles mentionnés (optionnels)')
            .setDescription('Utilise la recherche pour trouver un rôle. Vide : aucune mention.')
            .setRoleSelectMenuComponent(roles)));
        return;
      }
      if (selected !== 'images') return;
      const modal = new ModalBuilder().setCustomId(customId(draft, 'images-submit')).setTitle('Ajouter des images');
      for (const [key, label] of [['thumbnail', 'Vignette (optionnelle)'], ['image', 'Image (optionnelle)']]) {
        modal.addLabelComponents(new LabelBuilder().setLabel(label)
          .setDescription('PNG, JPG, GIF, WebP • 8 Mo max. Vide : supprime l’image actuelle.')
          .setFileUploadComponent(new FileUploadBuilder().setCustomId(key).setRequired(false).setMinValues(0).setMaxValues(1)));
      }
      await interaction.showModal(modal);
      return;
    }
    if (!interaction.isButton()) return;
    if (action === 'cancel') {
      drafts.delete(id);
      await interaction.update({ ...giveawayReply('Création du giveaway annulée.'), components: [] });
    } else if (action === 'launch') {
      await interaction.deferUpdate();
      await publishGiveaway(interaction, draft);
      if (draft.published) drafts.delete(id);
    } else if (action === 'channel') {
      await interaction.update({ ...giveawayDraftMessage(draft), components: [
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder()
          .setCustomId(customId(draft, 'channel-select')).setPlaceholder('Choisir le salon de publication')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
        new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(customId(draft, 'back'))
          .setLabel('Retour').setStyle(ButtonStyle.Secondary)),
      ] });
    } else if (action === 'back') await interaction.update(giveawayDraftMessage(draft));
    else if (action === 'reward') await interaction.showModal(rewardModal(draft));
    else {
      const modal = new ModalBuilder().setCustomId(customId(draft, `${action}-submit`));
      if (action === 'title') modal.setTitle('Titre & description').addComponents(
        input('title', 'Titre', draft.title || draft.prize, 200), input('description', 'Description (optionnelle)', draft.description, 2000, false, true));
      else if (action === 'duration') modal.setTitle('Durée du giveaway').addComponents(input('duration', 'Durée : 30s, 10m, 24h, 3j…', draft.duration, 60));
      else if (action === 'winners') modal.setTitle('Nombre de gagnants').addComponents(input('winners', 'Gagnants (1 à 20)', String(draft.winnerCount), 2));
      else return;
      await interaction.showModal(modal);
    }
  });
}
async function invalid(interaction: ModalSubmitInteraction, content: string) {
  await interaction.reply({ ...giveawayReply(content), flags: MessageFlags.Ephemeral });
}
