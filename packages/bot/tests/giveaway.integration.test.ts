import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { prisma } from '@discord-bot-dashboard/database';
import { PermissionFlagsBits, type ButtonInteraction, type ChatInputCommandInteraction, type Client, type Guild } from 'discord.js';
import { giveawayCommand } from '../src/commands/giveaway.js';
import { handleGiveawayDraftInteraction } from '../src/modules/giveaways/builder.js';
import { finishGiveaway, handleGiveawayInteraction, handleGiveawayRemoval, sweepGiveaways, withGiveawayLock } from '../src/modules/giveaways/index.js';

const embedText = (payload: any): string => payload.embeds?.map((embed: any) => (embed.toJSON?.() ?? embed).description).join('\n') ?? payload.content;

config({ path: new URL('../../../.env', import.meta.url) });

test('giveaway complet sur PostgreSQL local, sans publier sur Discord', async (t) => {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Ce test exige une base locale.');
  const guildId = `giveaway-test-${randomUUID()}`;
  const edits: unknown[] = [];
  const sent: unknown[] = [];
  const directMessages: { recipientId: string; payload: any }[] = [];
  let failDirectMessages = true;
  const blockedRecipients = new Set<string>();
  let failEdits = false;
  let failAnnouncements = false;
  const attemptedNonces: string[] = [];
  const channel = {
    id: 'test-channel', isTextBased: () => true, isSendable: () => true, isThread: () => false,
    permissionsFor: () => ({ has: (permission: unknown) => permission !== PermissionFlagsBits.MentionEveryone }),
    messages: { edit: async (_id: string, payload: unknown) => { if (failEdits) throw new Error('Discord hors ligne'); edits.push(payload); } },
    send: async (payload: unknown) => {
      const nonce = (payload as { nonce?: string }).nonce;
      if (nonce) {
        attemptedNonces.push(nonce);
        if (failAnnouncements) throw new Error('Envoi de l’annonce impossible');
      }
      sent.push(payload);
      return { id: String(123456789012345677n + BigInt(sent.length)), url: 'https://discord.com/test', delete: async () => undefined };
    },
  };
  const client = { channels: { fetch: async () => channel }, guilds: { cache: new Map() },
    users: { fetch: async (recipientId: string) => ({ send: async (payload: any) => {
      if (blockedRecipients.has(recipientId)) throw Object.assign(new Error('MP fermés'), { code: 50007 });
      if (failDirectMessages) throw new Error('MP temporairement indisponibles');
      directMessages.push({ recipientId, payload });
      return { id: String(directMessages.length) };
    } }) },
  } as unknown as Client;
  const guild = {
    id: guildId, name: 'Serveur de test', client, channels: { fetch: async () => channel },
    roles: { fetch: async (id: string) => ({ id, mentionable: true }) },
    members: { me: {}, fetch: async ({ user }: { user: string }) => {
      if (user === 'departed') throw Object.assign(new Error('Unknown Member'), { code: 10007 });
      return { user: { bot: false } };
    } },
  } as unknown as Guild;
  Object.assign(channel, { guild });
  client.guilds.cache.set(guildId, guild);
  await prisma.guild.create({ data: { id: guildId, name: 'Giveaway integration test' } });
  const id = `giveaway-${randomUUID()}`;
  const replies: string[] = [];
  const interactionReplies: any[] = [];
  const button = (userId: string, overrides = {}) => ({
    customId: `giveaway:${id}`, user: { id: userId }, guildId, client,
    message: { id: '123456789012345678' }, deferReply: async () => undefined, deferUpdate: async () => undefined,
    editReply: async (payload: any) => {
      interactionReplies.push(payload);
      replies.push(payload.embeds?.map((embed: any) => `${embed.toJSON().description}\n${embed.toJSON().footer?.text ?? ''}`).join('\n') ?? payload.content);
      return { id: `reply-${userId}` };
    }, ...overrides,
  }) as unknown as ButtonInteraction;
  async function quietSweep() {
    const originalError = console.error;
    console.error = () => undefined;
    try { await sweepGiveaways(client); } finally { console.error = originalError; }
  }
  const removal = (userId: string, admin: boolean, overrides = {}) => ({
    customId: `giveaway-remove:${id}`, guildId, client, user: { id: 'host' }, inGuild: () => true,
    memberPermissions: { has: (permission: bigint) => permission === PermissionFlagsBits.Administrator ? admin : true },
    isButton: () => false, fields: { getSelectedUsers: () => ({ first: () => ({ id: userId }) }) },
    deferReply: async () => undefined, reply: async (payload: any) => { replies.push(embedText(payload)); },
    editReply: async (payload: any) => { replies.push(embedText(payload)); }, ...overrides,
  }) as any;

  try {
    await t.test('création : la pièce jointe est copiée dans le message du bot', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response(Buffer.from('test-image'), { status: 200 })) as typeof fetch;
      try {
        await giveawayCommand.execute({
          id, guildId, guild, channelId: channel.id, user: { id: 'host' }, inGuild: () => true,
          memberPermissions: { has: (permission: bigint) => permission === PermissionFlagsBits.ManageGuild },
          deferReply: async () => undefined, editReply: async () => undefined,
          reply: async () => undefined,
          options: {
            getSubcommand: () => 'creer', getString: (name: string) => name === 'lot' ? 'Lot de test' : '1h',
            getInteger: () => 1, getChannel: () => null,
            getAttachment: () => ({ url: 'https://cdn.discordapp.com/test.png', name: 'lot.png', contentType: 'image/png', size: 10 }),
          },
        } as unknown as ChatInputCommandInteraction);
        assert.equal(sent.length, 0, 'La préparation ne publie rien avant le lancement');
        const draftModal = (action: string, fields: unknown) => ({
          customId: `giveaway-draft:${id}:${action}`, guildId, user: { id: 'host' },
          memberPermissions: { has: () => true }, isModalSubmit: () => true, isFromMessage: () => true,
          fields, update: async () => undefined,
        }) as any;
        await handleGiveawayDraftInteraction(draftModal('title-submit', {
          getTextInputValue: (field: string) => field === 'title' ? 'Mon giveaway' : 'Bonne chance !',
        }));
        await handleGiveawayDraftInteraction(draftModal('images-submit', {
          getUploadedFiles: () => ({ first: () => ({ url: 'https://cdn.discordapp.com/test.png', name: 'lot.png', contentType: 'image/png', size: 10 }) }),
        }));
        await handleGiveawayDraftInteraction(draftModal('mentions-submit', {
          getSelectedRoles: () => new Map([['123456789012345679', {}]]),
        }));
        await handleGiveawayDraftInteraction({
          customId: `giveaway-draft:${id}:advanced`, guildId, user: { id: 'host' },
          memberPermissions: { has: () => true }, isModalSubmit: () => false, isChannelSelectMenu: () => false,
          isStringSelectMenu: () => true, values: ['participants'], update: async () => undefined, followUp: async () => undefined,
        } as any);
        await handleGiveawayDraftInteraction({
          id: 'launch-id', customId: `giveaway-draft:${id}:launch`, guildId, guild, client,
          user: { id: 'host' }, memberPermissions: { has: () => true },
          isModalSubmit: () => false, isChannelSelectMenu: () => false, isStringSelectMenu: () => false, isButton: () => true,
          deferUpdate: async () => undefined, editReply: async () => undefined,
        } as unknown as ButtonInteraction);
      } finally { globalThis.fetch = originalFetch; }
      assert.equal(sent.length, 1);
      const payload = sent[0] as { files: { name: string; attachment: Buffer }[]; embeds: { toJSON: () => { image: { url: string } } }[] };
      assert.equal(payload.files[0].name, 'giveaway.png');
      assert.equal(payload.files[0].attachment.toString(), 'test-image');
      assert.equal(payload.embeds[0].toJSON().image.url, 'attachment://giveaway.png');
      assert.equal(payload.files[1].name, 'thumbnail.png');
      const stored = await prisma.giveaway.findUniqueOrThrow({ where: { id } });
      assert.equal(stored.imageName, 'giveaway.png');
      assert.equal(stored.thumbnailName, 'thumbnail.png');
      assert.equal(stored.title, 'Mon giveaway');
      assert.equal(stored.description, 'Bonne chance !');
      assert.deepEqual(stored.mentionRoleIds, ['123456789012345679']);
      assert.equal(stored.showParticipants, false);
      const posted = sent[0] as any;
      assert.equal(posted.content, '<@&123456789012345679>');
      assert.deepEqual(posted.allowedMentions, { parse: [], roles: ['123456789012345679'] });
      assert.equal(posted.components[0].toJSON().components.length, 1);
    });

    await t.test('participation, retrait et clics concurrents', async () => {
      await handleGiveawayInteraction(button('alice'));
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id } }), 1);
      assert.equal(interactionReplies.at(-1).embeds[0].toJSON().description, '✅ Vous participez à présent au giveaway !');
      assert.equal(interactionReplies.at(-1).embeds[0].toJSON().color, 0xed4245);
      const edited = edits.at(-1) as any;
      assert.deepEqual(edited.allowedMentions, { parse: [] });
      assert.equal(edited.components[0].toJSON().components.length, 1);
      await handleGiveawayInteraction(button('alice'));
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id } }), 1);
      assert.match(replies.at(-1)!, /Vous participez déjà/);
      assert.equal(interactionReplies.at(-1).components[0].toJSON().components[0].label, 'Se désinscrire');
      await handleGiveawayInteraction(button('bob', { customId: `giveaway-leave:${id}:alice` }));
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id } }), 1);
      await handleGiveawayInteraction(button('alice', { customId: `giveaway-leave:${id}:alice`, message: { id: 'reply-alice' } }));
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id } }), 0);
      await handleGiveawayInteraction(button('alice', { customId: `giveaway-leave:${id}:alice` }));
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id } }), 0);
      await Promise.all([1, 2, 3].map(() => handleGiveawayInteraction(button('alice'))));
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id, userId: 'alice' } }), 1);
      await handleGiveawayInteraction(button('bob'));
      await handleGiveawayInteraction(button('departed'));
      await handleGiveawayInteraction(button('alice', { customId: `giveaway-participants:${id}` }));
      assert.match(replies.at(-1)!, /Participants \(3\)/);
      assert.match(replies.at(-1)!, /<@alice>/);
      await handleGiveawayInteraction(button('intruder', { guildId: 'other-guild' }));
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id } }), 3);
    });

    await t.test('3000 participants : navigation, choix de page et accès privé', async () => {
      await prisma.giveawayEntry.createMany({ data: Array.from({ length: 2997 }, (_, index) => ({ giveawayId: id, userId: `pagination-${String(index).padStart(4, '0')}` })) });
      try {
        const pageButton = (page: string, overrides = {}) => button('alice', {
          customId: `giveaway-participants-page:${id}:${page}:alice`, message: { id: 'private-list' },
          isButton: () => true, isModalSubmit: () => false, ...overrides,
        });
        await handleGiveawayInteraction(button('alice', { customId: `giveaway-participants:${id}` }));
        let view = interactionReplies.at(-1);
        assert.match(view.embeds[0].toJSON().footer.text, /Participants \(3000\) • Page 1\/120/);
        assert.equal(view.embeds[0].toJSON().description.split('\n').filter((line: string) => line.startsWith('• ')).length, 25);
        let navigation = view.components[0].toJSON().components;
        assert.equal(navigation[0].disabled, true);
        assert.equal(navigation[1].label, 'Page');
        assert.equal(navigation[2].disabled, false);
        await handleGiveawayInteraction(pageButton('1'));
        assert.match(interactionReplies.at(-1).embeds[0].toJSON().footer.text, /Page 2\/120 • 26–50/);
        let modal: any;
        await handleGiveawayInteraction(pageButton('choose', { showModal: async (value: any) => { modal = value.toJSON(); } }));
        assert.equal(modal.title, 'Choisir une page');
        await handleGiveawayInteraction(pageButton('submit', {
          isModalSubmit: () => true, fields: { getTextInputValue: () => '120' },
        }));
        view = interactionReplies.at(-1);
        assert.match(view.embeds[0].toJSON().footer.text, /Page 120\/120 • 2976–3000/);
        navigation = view.components[0].toJSON().components;
        assert.equal(navigation[0].disabled, false);
        assert.equal(navigation[2].disabled, true);
        let error: any;
        await handleGiveawayInteraction(pageButton('submit', { isModalSubmit: () => true,
          fields: { getTextInputValue: () => '121' }, followUp: async (payload: any) => { error = payload; } }));
        assert.match(embedText(error), /entre 1 et 120/);
        await handleGiveawayInteraction(pageButton('1', { user: { id: 'bob' }, reply: async (payload: any) => { error = payload; } }));
        assert.equal(error.flags, 64);
        assert.match(embedText(error), /propre liste/);
      } finally {
        await prisma.giveawayEntry.deleteMany({ where: { giveawayId: id, userId: { startsWith: 'pagination-' } } });
      }
      await handleGiveawayInteraction(button('alice', { customId: `giveaway-participants-page:${id}:119:alice`, isModalSubmit: () => false }));
      assert.match(interactionReplies.at(-1).embeds[0].toJSON().footer.text, /Page 1\/1/);
    });

    await t.test('retrait réservé aux admins, même si le créateur possède Gérer le serveur', async () => {
      await handleGiveawayRemoval(removal('bob', false));
      assert.match(replies.at(-1)!, /Seuls les administrateurs/);
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id, userId: 'bob' } }), 1);
      let participantList: any;
      await handleGiveawayInteraction(button('host', { customId: `giveaway-participants:${id}`,
        memberPermissions: { has: () => false }, editReply: async (payload: unknown) => { participantList = payload; } }));
      assert.deepEqual(participantList.components, []);
      await handleGiveawayInteraction(button('host', { customId: `giveaway-participants:${id}`,
        memberPermissions: { has: () => true }, editReply: async (payload: unknown) => { participantList = payload; } }));
      assert.equal(participantList.components[0].toJSON().components[0].label, 'Retirer un participant');
      let modal: any;
      await handleGiveawayRemoval(removal('bob', true, { isButton: () => true,
        showModal: async (value: any) => { modal = value.toJSON(); } }));
      assert.equal(modal.components[0].component.type, 5);
      await handleGiveawayRemoval(removal('bob', true, { guildId: 'other-guild' }));
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id, userId: 'bob' } }), 1);
      await handleGiveawayRemoval(removal('bob', true));
      assert.match(replies.at(-1)!, /participant a été retiré/);
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id, userId: 'bob' } }), 0);
      await handleGiveawayInteraction(button('bob'));
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id, userId: 'bob' } }), 1);
    });

    await t.test('expiration : un nouveau clic est refusé avant même le balayage', async () => {
      await prisma.giveaway.update({ where: { id }, data: { endsAt: new Date(Date.now() - 1000) } });
      await handleGiveawayInteraction(button('late'));
      assert.match(replies.at(-1)!, /terminé/);
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id, userId: 'late' } }), 0);
      await handleGiveawayRemoval(removal('bob', true));
      assert.match(replies.at(-1)!, /terminé/);
      assert.equal(await prisma.giveawayEntry.count({ where: { giveawayId: id, userId: 'bob' } }), 1);
    });

    await t.test('reprise après arrêt : le tirage est conservé malgré une panne Discord', async () => {
      failEdits = true;
      failAnnouncements = true;
      await quietSweep();
      const ended = await prisma.giveaway.findUniqueOrThrow({ where: { id } });
      assert.ok(interactionReplies.some((reply) => reply.embeds?.[0].toJSON().description === '💡 Le giveaway est terminé !'
        && reply.components.length === 0));
      assert.equal(ended.status, 'ended');
      assert.equal(ended.needsSync, true);
      assert.equal(ended.winnerIds.length, 1);
      assert.ok(['alice', 'bob'].includes(ended.winnerIds[0]));
      assert.ok(ended.announcementNonce);
      assert.equal(ended.announcementMessageId, null);
      failEdits = false;
      await quietSweep();
      const recovered = await prisma.giveaway.findUniqueOrThrow({ where: { id } });
      assert.equal(recovered.needsSync, false);
      assert.deepEqual(recovered.winnerIds, ended.winnerIds);
      assert.equal(recovered.announcementMessageId, null);
      assert.equal(sent.length, 1);
      await handleGiveawayInteraction(button('alice'));
      assert.match(replies.at(-1)!, /terminé/);
    });

    await t.test('l’annonce se publie une seule fois après rétablissement sans permission everyone', async () => {
      failAnnouncements = false;
      failDirectMessages = false;
      await sweepGiveaways(client);
      const announced = await prisma.giveaway.findUniqueOrThrow({ where: { id } });
      assert.ok(announced.announcementMessageId);
      assert.equal(sent.length, 2);
      const payload = sent[1] as { content: string; nonce: string; enforceNonce: boolean; allowedMentions: unknown };
      assert.match(embedText(payload), /^🎉 Félicitations/);
      assert.ok(!payload.content.includes('@everyone'));
      assert.match(embedText(payload), /Lot de test/);
      assert.deepEqual(payload.allowedMentions, { parse: [], users: announced.winnerIds });
      assert.equal(payload.enforceNonce, true);
      assert.equal(new Set(attemptedNonces).size, 1);
      await sweepGiveaways(client);
      assert.equal(sent.length, 2);
    });

    await t.test('fin automatique : deux embeds uniquement au créateur, sans doublon', async () => {
      const giveaway = await prisma.giveaway.findUniqueOrThrow({ where: { id } });
      assert.equal(directMessages.length, 1);
      const host = directMessages.find((message) => message.recipientId === 'host')!;
      assert.equal(host.payload.embeds[0].title, 'Récompense à donner !');
      assert.match(host.payload.embeds[0].description, /Lot de test/);
      assert.equal(host.payload.embeds.length, 2);
      assert.match(host.payload.embeds[0].description, /Serveur de test/);
      for (const userId of ['alice', 'bob', 'departed']) {
        const messages = directMessages.filter((message) => message.recipientId === userId);
        assert.equal(messages.length, 0);
      }
      assert.equal(host.payload.embeds[1].title, 'Plop ! 👋');
      assert.equal(host.payload.embeds[1].description, `Le giveaway créé sur le serveur **Serveur de test** est maintenant terminé !\n\nLe gagnant est <@${giveaway.winnerIds[0]}>.\nLa récompense promise était : **Lot de test**.`);
      assert.ok(host.payload.embeds.every((embed: any) => embed.color === 0xed4245));
      assert.match(host.payload.embeds[0].url, /discord.com\/channels/);
      assert.deepEqual(host.payload.allowedMentions, { parse: [] });
      assert.equal(host.payload.enforceNonce, true);
      assert.equal(await prisma.giveawayNotification.count({ where: { giveawayId: id, status: 'sent' } }), 1);
      await sweepGiveaways(client);
      assert.equal(directMessages.length, 1);
    });

    await t.test('le nouveau tirage exclut le gagnant précédent et les membres partis', async () => {
      blockedRecipients.add('host');
      const previous = await prisma.giveaway.findUniqueOrThrow({ where: { id } });
      await withGiveawayLock(id, () => finishGiveaway(guild, previous, true));
      const rerolled = await prisma.giveaway.findUniqueOrThrow({ where: { id } });
      assert.equal(rerolled.winnerIds.length, 1);
      assert.ok(['alice', 'bob'].includes(rerolled.winnerIds[0]));
      assert.notEqual(rerolled.winnerIds[0], previous.winnerIds[0]);
      assert.notEqual(rerolled.announcementNonce, previous.announcementNonce);
      assert.notEqual(rerolled.announcementMessageId, previous.announcementMessageId);
      assert.equal(sent.length, 3);
      assert.ok(edits.length > 0);
      assert.equal(directMessages.length, 1);
      assert.equal(await prisma.giveawayNotification.count({ where: { giveawayId: id, status: 'blocked' } }), 1);
    });

    await t.test('commande terminer : premier embed seul si le créateur termine, sinon les deux', async () => {
      blockedRecipients.delete('host');
      for (const actor of ['host', 'other-admin']) {
        const messageId = actor === 'host' ? '123456789012345681' : '123456789012345682';
        const manual = await prisma.giveaway.create({ data: {
          id: `${id}-${actor}`, guildId, channelId: channel.id, messageId, hostId: 'host',
          prize: 'Lot manuel', winnerCount: 1, endsAt: new Date(Date.now() + 60_000),
          entries: { create: { userId: 'alice' } },
        } });
        const previousCount = directMessages.length;
        await giveawayCommand.execute({ guildId, guild, user: { id: actor }, inGuild: () => true,
          memberPermissions: { has: () => true }, options: { getSubcommand: () => 'terminer', getString: () => messageId },
          deferReply: async () => undefined, editReply: async () => undefined,
        } as unknown as ChatInputCommandInteraction);
        assert.equal((await prisma.giveaway.findUniqueOrThrow({ where: { id: manual.id } })).status, 'ended');
        assert.equal(directMessages.length, previousCount + 1);
        const notification = directMessages.at(-1)!;
        assert.equal(notification.recipientId, 'host');
        assert.equal(notification.payload.embeds.length, actor === 'host' ? 1 : 2);
        assert.equal(notification.payload.embeds[0].title, 'Récompense à donner !');
      }
    });

    await t.test('un giveaway sans participant se termine sans mention everyone', async () => {
      blockedRecipients.add('host');
      const empty = await prisma.giveaway.create({ data: {
        id: `${id}-empty`, guildId, channelId: channel.id, messageId: '123456789012345680', hostId: 'host',
        prize: 'Lot vide', winnerCount: 1, endsAt: new Date(Date.now() - 1000),
      } });
      await withGiveawayLock(empty.id, () => finishGiveaway(guild, empty));
      const payload = sent.at(-1) as { content: string; allowedMentions: unknown };
      assert.match(embedText(payload), /Aucun participant éligible/);
      assert.ok(!payload.content.includes('@everyone'));
      assert.deepEqual(payload.allowedMentions, { parse: [], users: [] });
      assert.equal((await prisma.giveaway.findUniqueOrThrow({ where: { id: empty.id } })).status, 'ended');
      assert.equal(await prisma.giveawayNotification.count({ where: { giveawayId: empty.id, status: 'blocked' } }), 1);
    });
  } finally {
    await prisma.guild.delete({ where: { id: guildId } });
    await prisma.$disconnect();
  }
});
