import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  type Interaction,
  type Message,
} from 'discord.js';
import type { BotModule } from '@discord-bot-dashboard/shared';

export interface BotModuleHandler {
  name: BotModule;
  register: (client: BotClient) => void;
}

export class BotClient extends Client {
  modules = new Collection<BotModule, BotModuleHandler>();

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    });
  }

  async isModuleEnabled(guildId: string, module: BotModule): Promise<boolean> {
    const { prisma } = await import('@discord-bot-dashboard/database');
    const config = await prisma.moduleConfig.findUnique({
      where: { guildId_module: { guildId, module } },
    });
    return config?.enabled ?? true;
  }
}

export type CommandContext = {
  client: BotClient;
  interaction?: Interaction;
  message?: Message;
};
