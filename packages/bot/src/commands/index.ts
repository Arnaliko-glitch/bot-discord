import type { SlashCommand } from './types.js';
import { niveauCommand } from './niveau.js';
import { classementCommand } from './classement.js';
import { panelTicketCommand } from './panelTicket.js';
import { statistiquesCommand } from './statistiques.js';
import { testTagLogCommand } from './testTagLog.js';
import { testAddXpCommand } from './testAddXp.js';
import { testTagAnnounceCommand } from './testTagAnnounce.js';

// Commandes de développement — jamais déployées en production (voir
// deploy-commands.ts, qui utilise directement ce tableau).
const devCommands: SlashCommand[] =
  process.env.NODE_ENV === 'production' ? [] : [testTagLogCommand, testAddXpCommand, testTagAnnounceCommand];

export const commands: SlashCommand[] = [
  niveauCommand,
  classementCommand,
  panelTicketCommand,
  statistiquesCommand,
  ...devCommands,
];
