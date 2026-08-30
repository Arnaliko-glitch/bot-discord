import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from './types.js';
import { resetUserXp } from '../modules/levels/xp.js';

// Commande de développement : réinitialise l'xp d'un membre via le même
// chemin que le reset automatique (départ/ban, voir modules/levels/xpReset.ts).
// N'est déployée qu'en dev (voir commands/index.ts), jamais en production.
export const testResetXpCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('test-reset-xp')
    .setDescription("[DEV] Réinitialise l'xp d'un membre pour tester")
    .addUserOption((option) => option.setName('membre').setDescription('Membre à réinitialiser (vous par défaut)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Cette commande n\'est utilisable que sur un serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    const targetUser = interaction.options.getUser('membre') ?? interaction.user;
    await resetUserXp(guild.id, targetUser.id);
    await interaction.reply({ content: `Xp de ${targetUser} réinitialisée.`, flags: MessageFlags.Ephemeral });
  },
};
