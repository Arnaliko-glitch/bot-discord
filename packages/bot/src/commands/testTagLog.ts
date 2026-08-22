import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { SlashCommand } from './types.js';
import { logTagEvent } from '../modules/serverTag.js';

// Commande de développement : simule un ajout/retrait du tag du serveur sans
// avoir à réellement changer son profil Discord — n'est déployée qu'en dev
// (voir commands/index.ts), jamais en production.
export const testTagLogCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('test-tag-log')
    .setDescription('[DEV] Simule un log d\'ajout/retrait du tag du serveur')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Événement à simuler')
        .setRequired(true)
        .addChoices({ name: 'Tag ajouté', value: 'added' }, { name: 'Tag retiré', value: 'removed' })
    )
    .addUserOption((option) => option.setName('membre').setDescription('Membre à utiliser (vous par défaut)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Cette commande n\'est utilisable que sur un serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    const targetUser = interaction.options.getUser('membre') ?? interaction.user;
    const member = guild.members.cache.get(targetUser.id) ?? (await guild.members.fetch(targetUser.id).catch(() => null));
    if (!member) {
      await interaction.reply({ content: 'Membre introuvable sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    const added = interaction.options.getString('action', true) === 'added';
    await logTagEvent(guild, member, added);

    await interaction.reply({
      content: `Log simulé envoyé (${added ? 'tag ajouté' : 'tag retiré'}) — vérifiez le salon configuré dans le module Logs.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
