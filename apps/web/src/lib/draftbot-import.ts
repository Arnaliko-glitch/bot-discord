import { xpForLevel } from '@discord-bot-dashboard/shared';

export interface DraftBotMember {
  discordUserId: string;
  displayName: string;
  level: number;
  currentLevelXp: number;
  levelXp: number;
  totalXp: number;
}

interface DraftBotApiUser {
  id: string;
  username?: string;
  displayName?: string;
  level: number;
  currentLevelXp: string | number;
  levelXp: string | number;
  totalXp: string | number;
}

interface DraftBotApiResponse {
  guild?: { name?: string };
  users: DraftBotApiUser[];
  total: number;
}

// Accepte soit un ID de serveur brut, soit un lien complet
// (https://www.draftbot.fr/levels/{id}) — ne garde que les chiffres finaux.
export function parseDraftBotServerId(input: string): string | null {
  const match = /(\d{15,25})\s*$/.exec(input.trim());
  return match ? match[1] : null;
}

// Garde-fou anti-boucle infinie si l'API renvoie un `total` aberrant —
// largement au-dessus de ce qu'un vrai serveur peut avoir (~3000 membres classés).
const MAX_PAGES = 30;

async function fetchPage(draftbotServerId: string, page: number): Promise<DraftBotApiResponse | null> {
  const res = await fetch(`https://api.draftbot.fr/activities/levels/${draftbotServerId}?page=${page}&locale=fr`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

// Récupère tout le classement de niveaux public d'un serveur DraftBot (toutes
// les pages) — seuls les membres ayant une vraie progression (totalXp > 0)
// sont conservés, les membres jamais actifs n'ont rien à migrer.
export async function fetchDraftBotLevels(
  draftbotServerId: string
): Promise<{ guildName: string | null; members: DraftBotMember[] }> {
  const first = await fetchPage(draftbotServerId, 0);
  if (!first || !Array.isArray(first.users)) {
    throw new Error('Serveur introuvable sur DraftBot (lien invalide, ou classement de niveaux désactivé).');
  }

  const members: DraftBotMember[] = [];
  const collect = (res: DraftBotApiResponse) => {
    for (const u of res.users) {
      const totalXp = Number(u.totalXp) || 0;
      if (totalXp <= 0) continue;
      members.push({
        discordUserId: String(u.id),
        displayName: String(u.displayName ?? u.username ?? u.id),
        level: Number(u.level) || 0,
        currentLevelXp: Number(u.currentLevelXp) || 0,
        levelXp: Number(u.levelXp) || 0,
        totalXp,
      });
    }
  };
  collect(first);

  const totalPages = Math.min(first.total ?? 1, MAX_PAGES);
  for (let page = 1; page < totalPages; page++) {
    const res = await fetchPage(draftbotServerId, page);
    if (res) collect(res);
  }

  return { guildName: first.guild?.name ?? null, members };
}

// Convertit un niveau DraftBot vers l'xp équivalente selon NOTRE courbe — les
// deux bots n'utilisent pas la même formule, copier l'xp brute donnerait un
// niveau totalement différent une fois recalculé chez nous. On préserve donc
// le niveau (ce qui compte réellement pour les membres) et on approxime la
// progression dans le niveau courant via le ratio currentLevelXp/levelXp
// que DraftBot fournit.
export function convertToLocalXp(
  member: DraftBotMember,
  curveStyle: string,
  curveMultiplier: number
): { level: number; xp: number } {
  let cumulative = 0;
  for (let l = 1; l <= member.level; l++) cumulative += xpForLevel(l, curveStyle, curveMultiplier);
  const nextLevelXp = xpForLevel(member.level + 1, curveStyle, curveMultiplier);
  const ratio = member.levelXp > 0 ? Math.min(1, Math.max(0, member.currentLevelXp / member.levelXp)) : 0;
  const xp = cumulative + Math.round(ratio * nextLevelXp);
  return { level: member.level, xp };
}
