import type { SlashCommand } from './types.js';
import { niveauCommand } from './niveau.js';
import { classementCommand } from './classement.js';
import { panelTicketCommand } from './panelTicket.js';
import { statistiquesCommand } from './statistiques.js';

export const commands: SlashCommand[] = [niveauCommand, classementCommand, panelTicketCommand, statistiquesCommand];
