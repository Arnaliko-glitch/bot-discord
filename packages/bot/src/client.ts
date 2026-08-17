import { Client } from 'discord.js';

export type BotClient = Client<true>;

export interface BotModuleHandler {
  name: string;
  register(client: BotClient): void;
}
