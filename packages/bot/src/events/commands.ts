import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import type { BotClient } from '../client.js';

const commands = [
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gestion des tickets')
    .addSubcommand((sub) => sub.setName('panel').setDescription('Créer un panel de tickets'))
    .addSubcommand((sub) => sub.setName('close').setDescription('Fermer le ticket actuel')),
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Voir le niveau XP')
    .addUserOption((opt) => opt.setName('user').setDescription('Utilisateur')),
  new SlashCommandBuilder()
    .setName('modules')
    .setDescription('Activer/désactiver un module (admin)')
    .addStringOption((opt) =>
      opt
        .setName('module')
        .setDescription('Module')
        .setRequired(true)
        .addChoices(
          { name: 'Welcome', value: 'welcome' },
          { name: 'Tickets', value: 'tickets' },
          { name: 'XP', value: 'xp' },
          { name: 'Level Roles', value: 'levelRoles' },
          { name: 'Logging', value: 'logging' }
        )
    )
    .addBooleanOption((opt) => opt.setName('enabled').setDescription('Activer ou désactiver').setRequired(true)),
].map((c) => c.toJSON());

export async function registerSlashCommands(client: BotClient) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!token || !clientId) return;

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Commandes slash enregistrées');
  } catch (error) {
    console.error('Erreur enregistrement commandes:', error);
  }

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'modules') return;
    if (!interaction.memberPermissions?.has('Administrator')) {
      await interaction.reply({ content: '❌ Permission administrateur requise.', ephemeral: true });
      return;
    }

    const module = interaction.options.getString('module', true);
    const enabled = interaction.options.getBoolean('enabled', true);

    const { prisma } = await import('@discord-bot-dashboard/database');
    await prisma.moduleConfig.upsert({
      where: { guildId_module: { guildId: interaction.guild!.id, module } },
      create: { guildId: interaction.guild!.id, module, enabled },
      update: { enabled },
    });

    await interaction.reply({
      content: `✅ Module **${module}** ${enabled ? 'activé' : 'désactivé'}.`,
      ephemeral: true,
    });
  });
}
