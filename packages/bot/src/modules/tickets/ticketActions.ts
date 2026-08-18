import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  RateLimitError,
  type ButtonInteraction,
  type Message,
  type ModalSubmitInteraction,
} from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { Ticket, TicketConfig } from '@discord-bot-dashboard/database';
import {
  CLOSED_PREFIX,
  REOPENED_PREFIX,
  TICKET_CLOSE_BUTTON_ID,
  TICKET_CLOSE_CONFIRM_NO,
  TICKET_CLOSE_CONFIRM_YES,
  TICKET_DELETE_BUTTON_ID,
  TICKET_DELETE_CONFIRM_NO,
  TICKET_DELETE_CONFIRM_YES,
  TICKET_REOPEN_BUTTON_ID,
  TICKET_REOPEN_CONFIRM_NO,
  TICKET_REOPEN_CONFIRM_YES,
} from './constants.js';

// Fermer/réouvrir/supprimer peut être déclenché depuis un bouton, une popup
// de raison ou une confirmation Oui/Non — les trois exposent les mêmes
// propriétés utilisées ici (channel, guild, user, client, deferUpdate).
export type TicketInteraction = ButtonInteraction | ModalSubmitInteraction;

const ACCENT_COLOR = 0x8a63f2;
const CLOSED_COLOR = 0xed4245;
const CONFIRM_COLOR = 0x57f287;

export function resolveDisplayName(interaction: TicketInteraction): string {
  const member = interaction.member;
  return member && 'displayName' in member ? member.displayName : interaction.user.username;
}

export function buildCloseRow(label: string = 'Fermer le ticket'): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(TICKET_CLOSE_BUTTON_ID).setLabel(label).setStyle(ButtonStyle.Primary)
  );
}

function buildClosedStateRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(TICKET_REOPEN_BUTTON_ID).setLabel('Réouvrir').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(TICKET_DELETE_BUTTON_ID).setLabel('Supprimer').setStyle(ButtonStyle.Danger)
  );
}

export function buildConfirmRow(
  yesId: string,
  noId: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(yesId).setLabel('Oui').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(noId).setLabel('Non').setStyle(ButtonStyle.Danger)
  );
}

export function buildConfirmEmbed(question: string): EmbedBuilder {
  return new EmbedBuilder().setColor(CONFIRM_COLOR).setDescription(question);
}

export const CLOSE_CONFIRM_ROW = () => buildConfirmRow(TICKET_CLOSE_CONFIRM_YES, TICKET_CLOSE_CONFIRM_NO);
export const REOPEN_CONFIRM_ROW = () => buildConfirmRow(TICKET_REOPEN_CONFIRM_YES, TICKET_REOPEN_CONFIRM_NO);
export const DELETE_CONFIRM_ROW = () => buildConfirmRow(TICKET_DELETE_CONFIRM_YES, TICKET_DELETE_CONFIRM_NO);

function swapPrefix(name: string, strip: string, add: string): string {
  const stripped = name.startsWith(strip) ? name.slice(strip.length) : name;
  return `${add}${stripped}`;
}

function openStateEmbed(guildName: string, guildIconUrl: string | undefined, reason: string | null): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(ACCENT_COLOR).setFooter({ text: `Ticket sur ${guildName}`, iconURL: guildIconUrl }).setTimestamp();
  if (reason) embed.setDescription(`**Raison :** ${reason}`);
  return embed;
}

// Sujet du salon (affiché à côté de son nom) — reflète toujours la dernière
// action effectuée sur le ticket. `<@id>` et `<t:...:F>` sont de la vraie
// syntaxe Discord (mention cliquable, date localisée automatiquement selon
// le client de chaque lecteur) — un texte brut "@pseudo" ne serait affiché
// ni en bleu ni avec le fond grisé de la date dans l'en-tête du salon.
function ticketTopic(action: string, actorId: string): string {
  const unixSeconds = Math.floor(Date.now() / 1000);
  return `Ticket ${action} par <@${actorId}> le <t:${unixSeconds}:F>`;
}

// Discord ne permet que 2 modifications (nom et/ou sujet) d'un même salon
// toutes les 10 minutes — regrouper nom + sujet dans un seul `.edit()` évite
// de consommer ce budget deux fois. Au-delà, avec `rejectOnRateLimit`
// configuré dans index.ts, la requête échoue tout de suite au lieu d'attendre
// en silence : on prévient alors l'utilisateur avec un horodatage Discord
// `<t:...:R>`, qui s'actualise tout seul côté client.
async function renameChannelOrNotify(
  interaction: TicketInteraction,
  channel: { edit(data: { name?: string; topic?: string }): Promise<unknown> },
  newName: string,
  topic: string
): Promise<boolean> {
  try {
    await channel.edit({ name: newName, topic });
    return true;
  } catch (err) {
    if (err instanceof RateLimitError) {
      const retryAt = Math.floor((Date.now() + err.retryAfter) / 1000);
      await interaction
        .followUp({
          embeds: [
            new EmbedBuilder()
              .setColor(CLOSED_COLOR)
              .setDescription(
                `❌ Le salon du ticket ne peut pas être modifié actuellement, dû à des limites de Discord sur la modification de salon, veuillez réessayer <t:${retryAt}:R>.`
              ),
          ],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => undefined);
      return false;
    }
    console.error('Renommage du salon de ticket échoué:', err);
    return true;
  }
}

// Édite le message porteur des boutons d'action (Fermer / Réouvrir /
// Supprimer) — si ce message a disparu ou ne peut plus être édité (supprimé
// manuellement, désynchronisé...), on en repost un neuf plutôt que de rester
// silencieux : le ticket ne doit jamais se retrouver sans bouton utilisable.
async function updateActionMessage(interaction: TicketInteraction, ticket: Ticket, embed: EmbedBuilder, row: ActionRowBuilder<ButtonBuilder>) {
  const channel = interaction.channel;
  if (!channel || !('send' in channel)) return;

  const message = ticket.activeCloseMessageId
    ? await channel.messages.fetch(ticket.activeCloseMessageId).catch(() => null)
    : null;

  if (message) {
    const edited = await (message as Message).edit({ embeds: [embed], components: [row] }).catch((err) => {
      console.error('Édition du message d\'action du ticket échouée:', err);
      return null;
    });
    if (edited) return;
  }

  const fresh = await channel.send({ embeds: [embed], components: [row] }).catch((err) => {
    console.error('Envoi du message d\'action du ticket échoué:', err);
    return null;
  });
  if (fresh) await prisma.ticket.update({ where: { id: ticket.id }, data: { activeCloseMessageId: fresh.id } });
}

async function logToTicketChannel(interaction: TicketInteraction, config: TicketConfig, embed: EmbedBuilder) {
  if (!config.logChannelId || !interaction.guild) return;
  const channel =
    interaction.guild.channels.cache.get(config.logChannelId) ??
    (await interaction.guild.channels.fetch(config.logChannelId).catch(() => null));
  if (channel?.isTextBased()) await channel.send({ embeds: [embed] }).catch(() => undefined);
}

// Fermeture — renomme "fermé-", retire l'accès du créateur, journalise dans
// le salon de récupération, prévient le créateur en MP si une raison a été
// donnée, et bascule le message d'action sur [Réouvrir]/[Supprimer].
export async function closeTicket(interaction: TicketInteraction, ticket: Ticket, config: TicketConfig, reason: string | null) {
  const channel = interaction.channel;
  if (!channel || !interaction.guild || !('send' in channel)) return;

  const closerName = resolveDisplayName(interaction);
  const isSelfClose = interaction.user.id === ticket.creatorId;
  // Les deux fetch sont indépendants — inutile d'attendre l'un pour lancer
  // l'autre (idem plus bas pour les effets de bord qui ne dépendent pas les
  // uns des autres : c'est ce qui rend l'action plus rapide à l'usage).
  const [creator, creatorMember] = await Promise.all([
    interaction.client.users.cache.get(ticket.creatorId) ??
      interaction.client.users.fetch(ticket.creatorId).catch(() => null),
    interaction.guild.members.cache.get(ticket.creatorId) ??
      interaction.guild.members.fetch(ticket.creatorId).catch(() => null),
  ]);
  const creatorDisplayName = creatorMember?.displayName ?? ticket.creatorName;

  const newName = swapPrefix(channel.isThread() ? channel.name : (channel as { name: string }).name, REOPENED_PREFIX, CLOSED_PREFIX);
  if ('edit' in channel) {
    const renamed = await renameChannelOrNotify(interaction, channel, newName, ticketTopic('fermé', interaction.user.id));
    if (!renamed) return;
  }

  const logEmbed = new EmbedBuilder()
    .setColor(CLOSED_COLOR)
    .setAuthor({
      name: isSelfClose ? `${closerName} a fermé son ticket.` : `${closerName} a fermé le ticket de ${creatorDisplayName}.`,
      iconURL: interaction.user.displayAvatarURL(),
    });
  if (!isSelfClose) logEmbed.setDescription(`**Raison :** ${reason ?? 'Aucune raison spécifiée (pas de MP)'}`);

  const closedEmbed = new EmbedBuilder()
    .setColor(CLOSED_COLOR)
    .setAuthor({ name: `Ticket fermé par ${closerName}` })
    .setFooter({ text: `Ticket sur ${interaction.guild.name}`, iconURL: interaction.guild.iconURL() ?? undefined })
    .setTimestamp();
  const lines = [ticket.subject ? `**Raison :** ${ticket.subject}` : null, reason ? `**Raison de fermeture :** ${reason}` : null].filter(
    Boolean
  );
  if (lines.length > 0) closedEmbed.setDescription(lines.join('\n'));

  await Promise.all([
    'permissionOverwrites' in channel
      ? channel.permissionOverwrites
          .edit(ticket.creatorId, { ViewChannel: false })
          .catch((err) => console.error('Retrait accès créateur échoué:', err))
      : Promise.resolve(),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'closed', closedBy: interaction.user.id, closedAt: new Date(), closeReason: reason, updatedAt: new Date() },
    }),
    logToTicketChannel(interaction, config, logEmbed),
    reason
      ? creator
          ?.send({
            embeds: [
              new EmbedBuilder()
                .setColor(CLOSED_COLOR)
                .setDescription(`🔒 Votre ticket a été fermé par **${closerName}**.\n\n**Raison :** ${reason}`),
            ],
          })
          .catch(() => undefined)
      : Promise.resolve(),
    updateActionMessage(interaction, ticket, closedEmbed, buildClosedStateRow()),
  ]);

  await interaction
    .followUp({
      embeds: [new EmbedBuilder().setColor(CONFIRM_COLOR).setDescription('✅ Le ticket a bien été fermé !')],
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => undefined);

  const noticeEmbed = new EmbedBuilder()
    .setColor(CLOSED_COLOR)
    .setAuthor({ name: `${closerName} vient de fermer le ticket.`, iconURL: interaction.user.displayAvatarURL() });
  if (reason) noticeEmbed.setDescription(`**Raison :** ${reason}`);
  await channel.send({ embeds: [noticeEmbed] }).catch(() => undefined);
}

// Réouverture — renomme "réouvert-", restaure l'accès du créateur, journalise.
export async function reopenTicket(interaction: TicketInteraction, ticket: Ticket, config: TicketConfig) {
  const channel = interaction.channel;
  if (!channel || !interaction.guild || !('send' in channel)) return;

  const reopenerName = resolveDisplayName(interaction);
  const creatorMember =
    interaction.guild.members.cache.get(ticket.creatorId) ??
    (await interaction.guild.members.fetch(ticket.creatorId).catch(() => null));
  const creatorDisplayName = creatorMember?.displayName ?? ticket.creatorName;

  const newName = swapPrefix(channel.isThread() ? channel.name : (channel as { name: string }).name, CLOSED_PREFIX, REOPENED_PREFIX);
  if ('edit' in channel) {
    const renamed = await renameChannelOrNotify(interaction, channel, newName, ticketTopic('réouvert', interaction.user.id));
    if (!renamed) return;
  }

  const reopenedEmbed = new EmbedBuilder()
    .setColor(CONFIRM_COLOR)
    .setAuthor({ name: `Ticket réouvert par ${reopenerName}` })
    .setFooter({ text: `Ticket sur ${interaction.guild.name}`, iconURL: interaction.guild.iconURL() ?? undefined })
    .setTimestamp();
  if (ticket.subject) reopenedEmbed.setDescription(`**Raison :** ${ticket.subject}`);

  await Promise.all([
    'permissionOverwrites' in channel
      ? channel.permissionOverwrites
          .edit(ticket.creatorId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true })
          .catch((err) => console.error('Restauration accès créateur échouée:', err))
      : Promise.resolve(),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'open', reopenedAt: new Date(), updatedAt: new Date() },
    }),
    logToTicketChannel(
      interaction,
      config,
      new EmbedBuilder()
        .setColor(CONFIRM_COLOR)
        .setAuthor({ name: `${reopenerName} a réouvert le ticket de ${creatorDisplayName}.`, iconURL: interaction.user.displayAvatarURL() })
    ),
    updateActionMessage(interaction, ticket, reopenedEmbed, buildCloseRow('Refermer')),
  ]);

  await interaction
    .followUp({
      embeds: [new EmbedBuilder().setColor(CONFIRM_COLOR).setDescription('✅ Le ticket a bien été réouvert !')],
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => undefined);

  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(CONFIRM_COLOR)
          .setAuthor({ name: `${reopenerName} vient de réouvrir le ticket.`, iconURL: interaction.user.displayAvatarURL() }),
      ],
    })
    .catch(() => undefined);
}

// Suppression définitive — uniquement possible sur un ticket déjà fermé.
export async function deleteTicket(interaction: TicketInteraction, ticket: Ticket, config: TicketConfig) {
  const channel = interaction.channel;
  if (!channel || !interaction.guild || !('send' in channel)) return;

  const deleterName = resolveDisplayName(interaction);
  const [creator, creatorMember] = await Promise.all([
    interaction.client.users.cache.get(ticket.creatorId) ??
      interaction.client.users.fetch(ticket.creatorId).catch(() => null),
    interaction.guild.members.cache.get(ticket.creatorId) ??
      interaction.guild.members.fetch(ticket.creatorId).catch(() => null),
  ]);
  const creatorDisplayName = creatorMember?.displayName ?? ticket.creatorName;

  await Promise.all([
    prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'deleted', updatedAt: new Date() } }),
    logToTicketChannel(
      interaction,
      config,
      new EmbedBuilder()
        .setColor(CLOSED_COLOR)
        .setAuthor({
          name: `${deleterName} a supprimé le ticket fermé de ${creatorDisplayName} (@${creator?.username ?? ticket.creatorName}).`,
          iconURL: interaction.user.displayAvatarURL(),
        })
    ),
  ]);

  await channel.delete().catch((err) => console.error('Suppression ticket échouée:', err));
}

export function canModerateTicket(interaction: TicketInteraction, config: TicketConfig): boolean {
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  const roles = interaction.member?.roles;
  if (!roles) return false;
  const roleIds = Array.isArray(roles) ? roles : [...roles.cache.keys()];
  return config.moderatorRoleIds.some((roleId: string) => roleIds.includes(roleId));
}

export { openStateEmbed, ticketTopic };
