import { prisma } from '../src/index.js';
import { BOT_MODULES } from '@discord-bot-dashboard/shared';

async function main() {
  console.log('🌱 Seeding database with demo guild...');

  const demoGuildId = process.env.DEMO_GUILD_ID ?? '000000000000000000';

  await prisma.guild.upsert({
    where: { id: demoGuildId },
    create: {
      id: demoGuildId,
      name: 'Serveur Démo',
      ownerId: '111111111111111111',
      settings: { create: {} },
      welcomeConfig: {
        create: {
          enabled: true,
          welcomeMessage: 'Bienvenue {user} sur **{server}** !',
          embedTitle: '🎉 Nouveau membre',
          embedDescription: 'Salut {user}, ravi de te voir ici ! Membre n°{memberCount}.',
          embedColor: '#5865F2',
        },
      },
      ticketConfig: { create: { enabled: true } },
      xpSettings: { create: { enabled: true } },
      moduleConfigs: {
        create: BOT_MODULES.map((module) => ({ module, enabled: true })),
      },
      levelRoles: {
        create: [
          { level: 5, roleId: '222222222222222222' },
          { level: 10, roleId: '333333333333333333' },
        ],
      },
      userXp: {
        create: [
          { discordUserId: '444444444444444444', username: 'Alice', xp: 1250, level: 8, messageCount: 420 },
          { discordUserId: '555555555555555555', username: 'Bob', xp: 890, level: 6, messageCount: 310 },
          { discordUserId: '666666666666666666', username: 'Charlie', xp: 450, level: 4, messageCount: 180 },
        ],
      },
      logEntries: {
        create: [
          {
            type: 'member_join',
            actorId: '444444444444444444',
            actorName: 'Alice',
            metadata: { source: 'seed' },
          },
          {
            type: 'message_delete',
            actorId: '555555555555555555',
            actorName: 'Bob',
            channelId: '777777777777777777',
            reason: 'Spam',
          },
          {
            type: 'level_up',
            actorId: '666666666666666666',
            actorName: 'Charlie',
            metadata: { level: 4 },
          },
        ],
      },
      dashboardPermissions: {
        create: {
          discordId: '111111111111111111',
          username: 'Remi',
          level: 'owner',
        },
      },
    },
    update: {},
  });

  console.log('✅ Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
