import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
// Injecter une base en mémoire avant le chargement du module : aucune connexion réelle.
const prisma = {
  xpSettings: { findUnique: async (): Promise<any> => null },
  userXp: {
    findUnique: async (): Promise<any> => null,
    upsert: async (_args: any): Promise<any> => null,
    update: async (_args: any): Promise<any> => null,
  },
  levelRole: { findMany: async (): Promise<any[]> => [] },
};
(globalThis as any).prisma = prisma;
const { ajouterNiveauxCommand } = await import('../src/commands/ajouterNiveaux.js');

test('la commande est réservée aux administrateurs et refuse un appel sans permission', async () => {
  assert.equal(ajouterNiveauxCommand.data.toJSON().default_member_permissions, String(PermissionFlagsBits.Administrator));
  let reply: any;
  await ajouterNiveauxCommand.execute({
    guild: { id: 'guild' }, memberPermissions: { has: () => false },
    reply: async (value: any) => { reply = value; },
  } as any);
  assert.match(reply.content, /administrateurs/);
  assert.equal(reply.flags, 64);
});

test('ajouts de niveaux : progression, plafond, module désactivé et capacité de stockage', async (t) => {
  for (const scenario of [
    { name: 'nouveau membre', xp: 0, levels: 2, maxLevel: 0, expectedXp: 255, expectedLevel: 2 },
    { name: 'progression partielle', xp: 150, levels: 2, maxLevel: 0, expectedXp: 475, expectedLevel: 3 },
    { name: 'plafond', xp: 150, levels: 5, maxLevel: 2, expectedXp: 255, expectedLevel: 2 },
    { name: 'maximum atteint', xp: 255, levels: 1, maxLevel: 2, error: /déjà atteint/ },
    { name: 'module désactivé', xp: 0, levels: 1, maxLevel: 0, enabled: false, error: /pas activé/ },
    { name: 'dépassement entier SQL', xp: 0, levels: 1000, maxLevel: 0, multiplier: 10, error: /capacité/ },
    { name: 'ajout négatif', xp: 150, levels: -1, maxLevel: 0, error: /compris entre/ },
  ]) {
    await t.test(scenario.name, async (t) => {
      const settings = { enabled: true, curveStyle: 'exponential', curveMultiplier: 1,
        levelUpAnnounceMode: 'disabled', ...scenario };
      settings.curveMultiplier = scenario.multiplier ?? 1;
      t.mock.method(prisma.xpSettings, 'findUnique', async () => settings);
      t.mock.method(prisma.userXp, 'findUnique', async () => scenario.xp ? { xp: scenario.xp } : null);
      let storedXp = scenario.xp;
      let storedLevel = 0;
      const upsert = t.mock.method(prisma.userXp, 'upsert', async ({ update }: any) => {
        storedXp += update.xp.increment;
        return { xp: storedXp, level: 0 };
      });
      t.mock.method(prisma.userXp, 'update', async ({ data }: any) => { storedLevel = data.level; });
      const rewards = t.mock.method(prisma.levelRole, 'findMany', async () => []);
      const guild: any = { id: 'guild', members: { fetch: async () => member } };
      const member = { id: 'member', guild, user: { bot: false, username: 'Alice' }, displayName: 'Alice',
        toString: () => '<@member>' };
      let reply: any;
      await ajouterNiveauxCommand.execute({
        guild, channelId: 'channel', memberPermissions: { has: () => true },
        options: { getInteger: () => scenario.levels, getUser: () => ({ id: member.id }) },
        deferReply: async (value: any) => { assert.equal(value.flags, 64); },
        editReply: async (value: any) => { reply = value; },
        reply: async (value: any) => { reply = value; },
      } as any);
      if (scenario.error) {
        assert.match(typeof reply === 'string' ? reply : reply.content, scenario.error);
        assert.equal(upsert.mock.callCount(), 0);
      } else {
        assert.equal(storedXp, scenario.expectedXp);
        assert.equal(storedLevel, scenario.expectedLevel);
        assert.equal(rewards.mock.callCount(), 1);
        assert.match(reply.content, new RegExp(`au niveau ${scenario.expectedLevel}`));
      }
    });
  }
});
