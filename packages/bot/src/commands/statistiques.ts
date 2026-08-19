import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { SlashCommand } from './types.js';

const ACTIVITY_DAYS = 30;
const GRID_COLUMNS = 5;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Couleurs ANSI supportées par les blocs de code Discord (```ansi) — la
// seule façon d'obtenir du texte réellement coloré dans un message.
const ESC = String.fromCharCode(27);
const ANSI_GREEN = 32;
const ANSI_RED = 31;
const ANSI_WHITE = 37;

function ansi(code: number, text: string, bold = false): string {
  return `${ESC}[${bold ? '1;' : ''}${code}m${text}${ESC}[0m`;
}

// Grille compacte plutôt qu'une liste de 30 lignes — chaque case "dd/mm ±N"
// alignée en colonnes, coloriée en ANSI (vert/rouge/blanc selon le signe).
function buildActivityGrid(days: { date: Date; net: number }[]): string {
  const cells = days.map((d) => {
    const label = d.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
    const value = (d.net > 0 ? `+${d.net}` : `${d.net}`).padStart(2, ' ');
    const color = d.net > 0 ? ANSI_GREEN : d.net < 0 ? ANSI_RED : ANSI_WHITE;
    return `${label} ${ansi(color, value)}`;
  });

  // Remplissage colonne par colonne (la colonne 1 lit 20/07, 21/07, 22/07...
  // de haut en bas) plutôt que ligne par ligne — plus naturel à suivre
  // chronologiquement. Espace serré entre chaque date et son chiffre
  // (collés dans la même case), mais plus large entre deux colonnes.
  const rowCount = Math.ceil(cells.length / GRID_COLUMNS);
  const rows: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const line: string[] = [];
    for (let c = 0; c < GRID_COLUMNS; c++) {
      const cell = cells[c * rowCount + r];
      if (cell) line.push(cell);
    }
    rows.push(line.join('   '));
  }
  return '```ansi\n' + rows.join('\n') + '\n```';
}

// Réservée aux admins ("Gérer le serveur", même permission que l'accès au
// dashboard) — vue d'ensemble membres + variation jour par jour sur 30 jours.
export const statistiquesCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('statistiques')
    .setDescription('Statistiques du serveur : membres et variation sur 30 jours (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Cette commande n\'est utilisable que sur un serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Fetch complet (pas seulement le cache) pour un compte de membres fiable
    // — appel rare (commande admin, pas un hook par message), sans souci
    // même sur un petit serveur.
    const members = await guild.members.fetch().catch(() => guild.members.cache);
    const memberCount = members.filter((m) => !m.user.bot).size;

    const today = startOfUtcDay(new Date());
    const rangeStart = new Date(today);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - (ACTIVITY_DAYS - 1));

    const rows = await prisma.dailyMemberStat.findMany({
      where: { guildId: guild.id, date: { gte: rangeStart } },
      orderBy: { date: 'asc' },
    });
    const byDate = new Map(rows.map((r) => [isoDate(r.date), r]));

    const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - (ACTIVITY_DAYS - 1 - i));
      const key = isoDate(d);
      const row = byDate.get(key);
      const joins = row?.joins ?? 0;
      const leaves = row?.leaves ?? 0;
      return { date: d, joins, leaves, net: joins - leaves };
    });

    const netTotal = days.reduce((sum, d) => sum + d.net, 0);
    const netTotalColor = netTotal > 0 ? ANSI_GREEN : netTotal < 0 ? ANSI_RED : ANSI_WHITE;
    const netTotalText = netTotal > 0 ? `+${netTotal}` : `${netTotal}`;

    const embed = new EmbedBuilder()
      .setColor(netTotal > 0 ? 0x57f287 : netTotal < 0 ? 0xed4245 : 0x99aab5)
      .setTitle('📊 Statistiques du serveur (30 jours)')
      .addFields(
        {
          name: 'Membres',
          value: '```ansi\n' + ansi(ANSI_WHITE, memberCount.toLocaleString('fr-FR'), true) + '\n```',
          inline: true,
        },
        {
          name: `Variation (${ACTIVITY_DAYS} jours)`,
          value: '```ansi\n' + ansi(netTotalColor, netTotalText, true) + '\n```',
          inline: true,
        }
      )
      .setDescription(buildActivityGrid(days))
      .setFooter({ text: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
