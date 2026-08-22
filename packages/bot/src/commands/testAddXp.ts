import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { XpSettings } from '@discord-bot-dashboard/database';
import { levelForXp, xpForLevel } from '@discord-bot-dashboard/shared';
import type { SlashCommand } from './types.js';
import { grantXp } from '../modules/levels/xp.js';

// Xp cumulée nécessaire pour ajouter N niveaux à partir de l'xp actuelle —
// même formule que le bot (xpForLevel), pas la peine de la deviner à la main
// à chaque test.
function xpToAddLevels(currentXp: number, settings: XpSettings, levelsToAdd: number): number {
  const currentLevel = levelForXp(currentXp, settings.curveStyle, settings.curveMultiplier, settings.maxLevel);
  const targetLevel = currentLevel + levelsToAdd;
  let cumulative = 0;
  for (let level = 1; level <= targetLevel; level++) cumulative += xpForLevel(level, settings.curveStyle, settings.curveMultiplier);
  return Math.max(0, cumulative - currentXp);
}

// Commande de développement : accorde de l'xp (brute ou par nombre de
// niveaux) via le même chemin que le bot (grantXp) — déclenche donc aussi
// bien les passages de niveau que les récompenses, comme un vrai gain.
// N'est déployée qu'en dev (voir commands/index.ts), jamais en production.
export const testAddXpCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('test-add-xp')
    .setDescription("[DEV] Ajoute de l'xp ou des niveaux à un membre pour tester")
    .addUserOption((option) => option.setName('membre').setDescription('Membre à créditer (vous par défaut)'))
    .addIntegerOption((option) => option.setName('xp').setDescription("Quantité d'xp à ajouter"))
    .addIntegerOption((option) => option.setName('niveaux').setDescription('Nombre de niveaux à ajouter'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Cette commande n\'est utilisable que sur un serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    const xpOption = interaction.options.getInteger('xp');
    const levelsOption = interaction.options.getInteger('niveaux');
    if (!xpOption && !levelsOption) {
      await interaction.reply({ content: 'Précisez au moins "xp" ou "niveaux".', flags: MessageFlags.Ephemeral });
      return;
    }

    const targetUser = interaction.options.getUser('membre') ?? interaction.user;
    const member = guild.members.cache.get(targetUser.id) ?? (await guild.members.fetch(targetUser.id).catch(() => null));
    if (!member) {
      await interaction.reply({ content: 'Membre introuvable sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await prisma.xpSettings.findUnique({ where: { guildId: guild.id } });
    if (!settings) {
      await interaction.reply({ content: "Le module Niveaux n'est pas configuré sur ce serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let amount = xpOption ?? 0;
    if (levelsOption) {
      const current = await prisma.userXp.findUnique({
        where: { guildId_discordUserId: { guildId: guild.id, discordUserId: member.id } },
      });
      amount += xpToAddLevels(current?.xp ?? 0, settings, levelsOption);
    }

    await grantXp(member, settings, amount, interaction.channelId);
    await interaction.editReply(`+${amount} xp ajoutés à ${member} — vérifiez le passage de niveau/les récompenses.`);
  },
};
