import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giveawayImageExtension, parseGiveawayDuration, shuffleParticipants } from '../src/modules/giveaways/utils.js';
import { giveawayCommand } from '../src/commands/giveaway.js';
import { giveawayAnnouncement, giveawayMessage, withGiveawayLock } from '../src/modules/giveaways/index.js';
import { handleGiveawayDraftInteraction } from '../src/modules/giveaways/builder.js';
import { initializeGiveawayEmojis } from '../src/modules/giveaways/emojis.js';
import { type ChatInputCommandInteraction, type ButtonInteraction, type ModalSubmitInteraction } from 'discord.js';

const embedText = (payload: any): string => payload.embeds?.map((embed: any) => (embed.toJSON?.() ?? embed).description).join('\n') ?? payload.content;

test('durées composées, bornes et saisies incorrectes', () => {
  assert.equal(parseGiveawayDuration('1j 2h 30m'), 95_400_000);
  assert.equal(parseGiveawayDuration(' 30S '), 30_000);
  assert.equal(parseGiveawayDuration('30j'), 2_592_000_000);
  for (const input of ['', '24', '-1h', '1.5h', '0s', '9s', '31j', '10m texte', '1e3s']) {
    assert.equal(parseGiveawayDuration(input), null, input);
  }
});

test('le mélange ne produit ni doublons ni participants inconnus et ne modifie pas la source', () => {
  const source = ['a', 'b', 'c', 'a'];
  for (let i = 0; i < 50; i++) assert.deepEqual(shuffleParticipants(source).sort(), ['a', 'b', 'c']);
  assert.deepEqual(source, ['a', 'b', 'c', 'a']);
  assert.deepEqual(shuffleParticipants([]), []);
});

test('seuls les formats image pris en charge sont acceptés', () => {
  assert.equal(giveawayImageExtension({ contentType: 'image/png', name: 'lot.png' }), 'png');
  assert.equal(giveawayImageExtension({ contentType: null, name: 'LOT.JPEG' }), 'jpg');
  assert.equal(giveawayImageExtension({ contentType: 'application/pdf', name: 'lot.png' }), null);
  assert.equal(giveawayImageExtension({ contentType: 'image/svg+xml', name: 'lot.svg' }), null);
});

test('la commande déclare image comme pièce jointe facultative', () => {
  const command = giveawayCommand.data.toJSON();
  const create = command.options!.find((option) => option.name === 'creer');
  assert.ok(create && 'options' in create);
  const image = create.options!.find((option) => option.name === 'image');
  assert.equal(image?.type, 11);
  assert.notEqual(image?.required, true);
  const duration = create.options!.find((option) => option.name === 'duree');
  assert.match(duration!.description, /s=secondes, m=minutes, h=heures, j=jours/);
});

test('l’annonce mentionne uniquement les gagnants, avec le lot et un lien vers le giveaway', () => {
  const data = { guildId: '1', channelId: '2', messageId: '3', prize: 'Nitro @here', winnerIds: ['4'] };
  const announcement = giveawayAnnouncement(data);
  assert.match(embedText(announcement), /^🎉 Félicitations <@4> ! Tu remportes/);
  assert.ok(!embedText(announcement).includes('@everyone'));
  assert.match(embedText(announcement), /Nitro/);
  assert.match(embedText(announcement), /discord.com\/channels\/1\/2\/3/);
  assert.ok(!embedText(announcement).includes('@here'));
  assert.deepEqual(announcement.allowedMentions, { parse: [], users: ['4'] });
  const multiple = giveawayAnnouncement({ ...data, winnerIds: ['4', '5'] });
  assert.match(embedText(multiple), /<@4>, <@5> ! Vous remportez/);
  const empty = giveawayAnnouncement({ ...data, winnerIds: [] });
  assert.ok(!embedText(empty).includes('@everyone'));
  assert.deepEqual(empty.allowedMentions, { parse: [], users: [] });
});

test('l’embed conserve sa pièce jointe et ferme le bouton à la fin', () => {
  const giveaway = { id: 'test', prize: 'Nitro', hostId: '123', winnerCount: 1,
    endsAt: new Date('2026-10-24T12:00:00Z'), status: 'active', winnerIds: [] as string[], imageName: 'giveaway.png' };
  const active = giveawayMessage(giveaway, 4);
  assert.equal(active.embeds[0].toJSON().image?.url, 'attachment://giveaway.png');
  assert.equal(active.components[0].toJSON().components[1].label, 'Participants (4)');
  assert.equal(active.components[0].toJSON().components[0].disabled, false);
  const ended = giveawayMessage({ ...giveaway, status: 'ended', winnerIds: ['456'] }, 4);
  assert.match(ended.embeds[0].toJSON().description!, /<@456>/);
  assert.equal(ended.components[0].toJSON().components[0].disabled, true);
  assert.equal(ended.embeds[0].toJSON().image?.url, 'attachment://giveaway.png');
});

test('création privée : récompense, aperçu, images, suppression et annulation', async () => {
  await initializeGiveawayEmojis({ application: { emojis: { fetch: async () => ({ find: () => ({ id: '123456789012345678', name: 'giveaway_mentions' }) }) } } } as any);
  let modal: any;
  let payload: any;
  const identity = { user: { id: 'host' }, guildId: 'guild', memberPermissions: { has: () => true } };
  await giveawayCommand.execute({ ...identity, id: 'draft-test', channelId: 'channel', inGuild: () => true,
    options: { getSubcommand: () => 'creer', getChannel: () => null, getString: () => null,
      getInteger: () => null, getAttachment: () => null },
    showModal: async (value: any) => { modal = value.toJSON(); },
  } as unknown as ChatInputCommandInteraction);
  assert.equal(modal.title, 'Récompense personnalisée');
  const submit = (action: string, fields: any) => ({ ...identity, customId: `giveaway-draft:draft-test:${action}`,
    isModalSubmit: () => true, isFromMessage: () => true, fields,
    reply: async (value: any) => { payload = value; }, update: async (value: any) => { payload = value; },
  }) as unknown as ModalSubmitInteraction;
  await handleGiveawayDraftInteraction(submit('initial', { getTextInputValue: () => 'Nitro' }));
  assert.equal(payload.flags, 64);
  assert.match(payload.embeds[0].toJSON().description, /3j après le lancement/);
  assert.equal(payload.components[0].toJSON().components.length, 5);
  const advancedOptions = payload.components[1].toJSON().components[0].options;
  assert.equal(advancedOptions[0].emoji.name, '🖼️');
  assert.equal(advancedOptions[1].emoji.id, '123456789012345678');
  assert.equal(advancedOptions[2].emoji.name, '✅');
  const button = (action: string, extra = {}) => ({ ...identity, customId: `giveaway-draft:draft-test:${action}`,
    isModalSubmit: () => false, isChannelSelectMenu: () => false, isStringSelectMenu: () => false, isButton: () => true,
    update: async (value: any) => { payload = value; }, reply: async (value: any) => { payload = value; }, ...extra,
  }) as unknown as ButtonInteraction;
  await handleGiveawayDraftInteraction(button('cancel', { user: { id: 'intruder' } }));
  assert.match(embedText(payload), /Seul le créateur/);
  await handleGiveawayDraftInteraction(submit('duration-submit', { getTextInputValue: () => '31j' }));
  assert.match(embedText(payload), /Durée invalide/);
  await handleGiveawayDraftInteraction({ ...button('advanced'), isStringSelectMenu: () => true,
    values: ['images'],
    showModal: async (value: any) => { modal = value.toJSON(); } } as any);
  assert.equal(modal.components.length, 2);
  assert.equal(modal.components[0].component.type, 19);
  const image = { url: 'https://cdn.discordapp.com/image.png', name: 'image.png', contentType: 'image/png', size: 100 };
  await handleGiveawayDraftInteraction(submit('images-submit', { getUploadedFiles: () => ({ first: () => image }) }));
  assert.equal(payload.embeds[0].toJSON().image.url, image.url);
  assert.equal(payload.embeds[0].toJSON().thumbnail.url, image.url);
  await handleGiveawayDraftInteraction(submit('images-submit', { getUploadedFiles: () => null }));
  assert.equal(payload.embeds[0].toJSON().image, undefined);
  await handleGiveawayDraftInteraction({ ...button('advanced'), isStringSelectMenu: () => true, values: ['mentions'],
    showModal: async (value: any) => { modal = value.toJSON(); } } as any);
  assert.equal(modal.title, 'Mentions');
  assert.equal(modal.components[0].component.type, 6);
  await handleGiveawayDraftInteraction(submit('mentions-submit', { getSelectedRoles: () => new Map([['123', {}]]) }));
  assert.equal(payload.content, '<@&123>');
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  await handleGiveawayDraftInteraction(submit('title-submit', { getTextInputValue: (key: string) => key === 'title' ? 'Titre' : 'Bonne chance\nÀ tous' }));
  assert.match(payload.embeds[0].toJSON().description, /^> Bonne chance\n> À tous\n\n\*\*Récompense/);
  const confirmations: any[] = [];
  const toggleParticipants = () => handleGiveawayDraftInteraction({ ...button('advanced'), isStringSelectMenu: () => true,
    values: ['participants'], followUp: async (value: any) => { confirmations.push(value); } } as any);
  await toggleParticipants();
  assert.equal(payload.components[1].toJSON().components[0].options[2].label, 'Afficher le bouton Participants');
  assert.equal(payload.components[1].toJSON().components[0].options[2].emoji.name, '❌');
  assert.equal(confirmations[0].flags, 64);
  assert.equal(confirmations[0].embeds[0].toJSON().color, 0xed4245);
  assert.match(confirmations[0].embeds[0].toJSON().description, /\*\*désactivé\*\*/);
  await toggleParticipants();
  assert.equal(payload.components[1].toJSON().components[0].options[2].label, 'Masquer le bouton Participants');
  assert.equal(payload.components[1].toJSON().components[0].options[2].emoji.name, '✅');
  assert.equal(confirmations[1].flags, 64);
  assert.match(confirmations[1].embeds[0].toJSON().description, /\*\*activé\*\*/);
  await handleGiveawayDraftInteraction(submit('winners-submit', { getTextInputValue: () => '3' }));
  assert.match(payload.embeds[0].toJSON().description, /Gagnants :\*\* 3/);
  await handleGiveawayDraftInteraction(button('cancel'));
  assert.deepEqual(payload.components, []);
  await handleGiveawayDraftInteraction(button('launch'));
  assert.match(embedText(payload), /expiré/);
});

test('les clics et le tirage se suivent, même après une erreur', async () => {
  const order: string[] = [];
  const first = withGiveawayLock('lock-test', async () => { order.push('join'); throw new Error('Discord indisponible'); });
  const second = withGiveawayLock('lock-test', async () => { order.push('draw'); return 'ok'; });
  await assert.rejects(first);
  assert.equal(await second, 'ok');
  assert.deepEqual(order, ['join', 'draw']);
});
