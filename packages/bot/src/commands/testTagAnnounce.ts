import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { SlashCommand } from './types.js';
import { announceTagReward } from '../modules/serverTag.js';

// Commande de développement : simule l'annonce de récompense envoyée quand un
// membre obtient le rôle de tag du serveur, sans avoir à réellement activer
// le tag sur son profil Discord — n'est déployée qu'en dev (voir
// commands/index.ts), jamais en production.
export const testTagAnnounceCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('test-tag-announce')
    .setDescription("[DEV] Simule l'annonce de récompense pour le tag du serveur")
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

    const config = await prisma.serverTagConfig.findUnique({ where: { guildId: guild.id } });
    if (!config?.announceChannelId || !config.roleId) {
      await interaction.reply({
        content: "Configurez un salon d'annonce et un rôle dans le module Tag du serveur avant de tester.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await announceTagReward(guild, member, config);
    await interaction.reply({
      content: 'Annonce simulée envoyée — vérifiez le salon configuré dans le module Tag du serveur.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
