import {
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { SlashCommand } from './types.js';
import { generateWelcomeBanner } from '../utils/welcomeBanner.js';
import { generateCelebrationCard } from '../utils/celebrationCard.js';
import { generateRankCard } from '../utils/rankCard.js';
import { LEVEL_UP_ACCENT } from '../modules/levels/xp.js';
import { REWARD_FALLBACK_ACCENT } from '../modules/levels/rewards.js';

// Commande de développement : génère un exemplaire de chaque image générée
// par le bot (bienvenue, départ, montée de niveau, récompense de niveau,
// tag du serveur, carte /niveau) dans un seul message, pour vérifier d'un
// coup le rendu visuel (police, taille de texte...) sans avoir à déclencher
// chaque événement réel un par un. N'est déployée qu'en dev (voir
// commands/index.ts), jamais en production.
export const testCardsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('test-cards')
    .setDescription('[DEV] Génère un aperçu de toutes les cartes/bannières du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    const member = interaction.member;
    if (!guild || !member || !('displayName' in member)) {
      await interaction.reply({ content: 'Cette commande n\'est utilisable que sur un serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const sampleRole = member.roles.highest.id !== guild.id ? member.roles.highest : null;
    const rewardAccent = sampleRole?.color ? sampleRole.hexColor : REWARD_FALLBACK_ACCENT;
    const rewardRoleName = sampleRole?.name ?? 'Rôle exemple';

    const [welcome, goodbye, levelUp, levelReward, tagReward, rank] = await Promise.all([
      generateWelcomeBanner({ kind: 'welcome', avatarUrl, guildName: guild.name }),
      generateWelcomeBanner({ kind: 'goodbye', avatarUrl, guildName: guild.name }),
      generateCelebrationCard({ avatarUrl, accentColor: LEVEL_UP_ACCENT, line1: 'vous avez atteint', line2: 'le niveau 12' }),
      generateCelebrationCard({ avatarUrl, accentColor: rewardAccent, line1: 'vous recevez le rôle', line2: rewardRoleName, emoji: '🎉' }),
      generateCelebrationCard({ avatarUrl, accentColor: rewardAccent, line1: 'vous recevez le rôle', line2: rewardRoleName, emoji: '🎉' }),
      generateRankCard({
        avatarUrl,
        username: member.displayName,
        place: 1,
        level: 12,
        xpIntoLevel: 340,
        xpForNextLevel: 500,
      }),
    ]);

    const files = [
      { buffer: welcome, name: 'welcome.png', title: 'Arrivée' },
      { buffer: goodbye, name: 'goodbye.png', title: 'Départ' },
      { buffer: levelUp, name: 'levelup.png', title: 'Montée de niveau' },
      { buffer: levelReward, name: 'reward.png', title: 'Récompense de niveau' },
      { buffer: tagReward, name: 'tagreward.png', title: 'Tag du serveur' },
      { buffer: rank, name: 'rank.png', title: 'Carte /niveau' },
    ];

    const attachments = files.map((f) => new AttachmentBuilder(f.buffer, { name: f.name }));
    const embeds = files.map((f) =>
      new EmbedBuilder().setTitle(f.title).setImage(`attachment://${f.name}`).setColor(LEVEL_UP_ACCENT)
    );

    await interaction.editReply({ embeds, files: attachments });
  },
};
