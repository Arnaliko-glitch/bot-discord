import type { BotClient } from '../client.js';
import { welcomeModule } from './welcome/index.js';
import { ticketsModule } from './tickets/index.js';
import { xpModule } from './xp/index.js';
import { levelRolesModule } from './level-roles/index.js';
import { loggingModule } from './logging/index.js';

const modules = [welcomeModule, ticketsModule, xpModule, levelRolesModule, loggingModule];

export async function loadModules(client: BotClient): Promise<void> {
  for (const mod of modules) {
    client.modules.set(mod.name, mod);
    mod.register(client);
    console.log(`📦 Module chargé: ${mod.name}`);
  }
}
