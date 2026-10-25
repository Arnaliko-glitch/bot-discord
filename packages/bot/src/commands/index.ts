import type { SlashCommand } from './types.js';
import { niveauCommand } from './niveau.js';
import { ajouterNiveauxCommand } from './ajouterNiveaux.js';
import { classementCommand } from './classement.js';
import { panelTicketCommand } from './panelTicket.js';
import { statistiquesCommand } from './statistiques.js';
import { testTagLogCommand } from './testTagLog.js';
import { testAddXpCommand } from './testAddXp.js';
import { testResetXpCommand } from './testResetXp.js';
import { testTagAnnounceCommand } from './testTagAnnounce.js';
import { testCardsCommand } from './testCards.js';
import { giveawayCommand } from './giveaway.js';

// Commandes de développement — jamais déployées en production (voir
// deploy-commands.ts, qui utilise directement ce tableau).
const devCommands: SlashCommand[] =
  process.env.NODE_ENV === 'production'
    ? []
    : [
        panelTicketCommand,
        testTagLogCommand,
        testAddXpCommand,
        testResetXpCommand,
        testTagAnnounceCommand,
        testCardsCommand,
      ];

export const commands: SlashCommand[] = [
  niveauCommand,
  ajouterNiveauxCommand,
  classementCommand,
  statistiquesCommand,
  giveawayCommand,
  ...devCommands,
];
