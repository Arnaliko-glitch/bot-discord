import type { BotModuleHandler } from '../../client.js';
import { createLogEntry } from '../../utils/guild.js';

export const loggingModule: BotModuleHandler = {
  name: 'logging',
  register(client) {
    client.on('messageDelete', async (message) => {
      if (!message.guild || message.author?.bot) return;
      if (!(await client.isModuleEnabled(message.guild.id, 'logging'))) return;

      await createLogEntry(message.guild.id, 'message_delete', {
        actorId: message.author?.id,
        actorName: message.author?.tag,
        channelId: message.channel.id,
        metadata: { content: message.content?.slice(0, 500) },
      });
    });

    client.on('messageUpdate', async (oldMessage, newMessage) => {
      if (!newMessage.guild || newMessage.author?.bot) return;
      if (oldMessage.content === newMessage.content) return;
      if (!(await client.isModuleEnabled(newMessage.guild.id, 'logging'))) return;

      await createLogEntry(newMessage.guild.id, 'message_edit', {
        actorId: newMessage.author?.id,
        actorName: newMessage.author?.tag,
        channelId: newMessage.channel.id,
        metadata: {
          before: oldMessage.content?.slice(0, 300),
          after: newMessage.content?.slice(0, 300),
        },
      });
    });
  },
};
