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
const GRID_COLUMNS = 2;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Un émoji rond coloré s'affiche pareil sur mobile et desktop (contrairement
// aux blocs de code ```ansi, pas reconnus sur mobile). Sa largeur de rendu
// n'est pas exactement celle d'un caractère monospace, mais sur 3 colonnes
// (au lieu de 5) chaque ligne reste assez étroite pour ne plus déborder du
// cadre de l'embed ni se faire retourner à la ligne par Discord.
function statusDot(net: number): string {
  return net > 0 ? '🟢' : net < 0 ? '🔴' : '⚪';
}

// Grille compacte plutôt qu'une liste de 30 lignes — chaque case "dd/mm ±N"
// alignée en colonnes (bloc de code simple, sans langage, pour un alignement
// fiable sur mobile comme sur desktop).
function buildActivityGrid(days: { date: Date; net: number }[]): string {
  const cells = days.map((d) => {
    const label = d.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
    const value = (d.net > 0 ? `+${d.net}` : `${d.net}`).padStart(3, ' ');
    return `${label} ${statusDot(d.net)}${value}`;
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
  return '```\n' + rows.join('\n') + '\n```';
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
    const netTotalText = netTotal > 0 ? `+${netTotal}` : `${netTotal}`;

    const embed = new EmbedBuilder()
      .setColor(netTotal > 0 ? 0x57f287 : netTotal < 0 ? 0xed4245 : 0x99aab5)
      .setTitle('📊 Statistiques du serveur (30 jours)')
      .addFields(
        { name: 'Membres', value: `**${memberCount.toLocaleString('fr-FR')}**`, inline: true },
        { name: `Variation (${ACTIVITY_DAYS} jours)`, value: `${statusDot(netTotal)} **${netTotalText}**`, inline: true }
      )
      .setDescription(buildActivityGrid(days))
      .setFooter({ text: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
