import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import { levelForXp, levelProgress } from '@discord-bot-dashboard/shared';
import type { SlashCommand } from './types.js';
import { grantXp } from '../modules/levels/xp.js';

export const ajouterNiveauxCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('ajouter-niveaux')
    .setDescription('Ajoute des niveaux à un membre (administrateurs uniquement)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addUserOption((option) => option.setName('membre').setDescription('Membre à créditer').setRequired(true))
    .addIntegerOption((option) => option
      .setName('niveaux').setDescription('Nombre de niveaux à ajouter (1 à 1000)')
      .setRequired(true).setMinValue(1).setMaxValue(1000)) as SlashCommandBuilder,

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Cette commande est utilisable uniquement sur un serveur.', flags: MessageFlags.Ephemeral });
      return;
    }
    // Vérifier aussi à l'exécution : les permissions de commande sont modifiables sur Discord.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Cette commande est réservée aux administrateurs.', flags: MessageFlags.Ephemeral });
      return;
    }

    const levels = interaction.options.getInteger('niveaux', true);
    if (!Number.isInteger(levels) || levels < 1 || levels > 1000) {
      await interaction.reply({ content: 'Indiquez un nombre de niveaux compris entre 1 et 1000.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getUser('membre', true);
    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member || member.user.bot) {
      await interaction.editReply('Choisissez un membre du serveur qui ne soit pas un bot.');
      return;
    }
    const settings = await prisma.xpSettings.findUnique({ where: { guildId: guild.id } });
    if (!settings?.enabled) {
      await interaction.editReply("Le module de niveaux n'est pas activé sur ce serveur.");
      return;
    }
    const current = await prisma.userXp.findUnique({
      where: { guildId_discordUserId: { guildId: guild.id, discordUserId: member.id } },
    });
    const xp = current?.xp ?? 0;
    const oldLevel = levelForXp(xp, settings.curveStyle, settings.curveMultiplier, settings.maxLevel);
    const targetLevel = settings.maxLevel > 0 ? Math.min(oldLevel + levels, settings.maxLevel) : oldLevel + levels;
    if (targetLevel <= oldLevel) {
      await interaction.editReply(`${member} a déjà atteint le niveau maximum (${settings.maxLevel}).`);
      return;
    }
    // Compléter la progression actuelle puis atteindre le seuil du niveau demandé.
    const { currentLevelXp: targetXp } = levelProgress(xp, targetLevel, settings.curveStyle, settings.curveMultiplier);
    if (!Number.isSafeInteger(targetXp) || targetXp > 2_147_483_647 || targetXp <= xp) {
      await interaction.editReply("Cet ajout dépasse la capacité d'XP. Choisissez un nombre de niveaux plus petit.");
      return;
    }
    const amount = targetXp - xp;
    await grantXp(member, settings, amount, interaction.channelId);
    await interaction.editReply({
      content: `${member} : +${targetLevel - oldLevel} niveau(x), du niveau ${oldLevel} au niveau ${targetLevel} (+${amount} XP).`,
      allowedMentions: { parse: [] },
    });
  },
};
