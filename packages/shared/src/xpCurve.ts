// Formule d'xp partagée entre le dashboard (aperçu), le bot (calcul réel) et
// la page publique de classement — l'xp nécessaire pour passer du niveau n-1
// au niveau n, pondérée par le multiplicateur. Le niveau 1 vaut pile 100 xp.
export function xpForLevel(level: number, curveStyle: string, multiplier: number): number {
  const n = level - 1;
  const base = curveStyle === 'linear' ? 100 + 100 * n : 5 * n * n + 50 * n + 100;
  return Math.round(base * multiplier);
}

// Niveau atteint pour un total d'xp donné, plafonné à maxLevel si défini (>0).
export function levelForXp(totalXp: number, curveStyle: string, multiplier: number, maxLevel: number): number {
  let level = 0;
  let cumulative = 0;
  while (maxLevel <= 0 || level < maxLevel) {
    const needed = xpForLevel(level + 1, curveStyle, multiplier);
    if (cumulative + needed > totalXp) break;
    cumulative += needed;
    level += 1;
  }
  return level;
}

// Bornes de progression dans le niveau courant — utilisées par /niveau et la
// page publique de classement.
export function levelProgress(
  totalXp: number,
  level: number,
  curveStyle: string,
  multiplier: number
): { currentLevelXp: number; xpIntoLevel: number; xpForNextLevel: number } {
  let currentLevelXp = 0;
  for (let l = 1; l <= level; l++) currentLevelXp += xpForLevel(l, curveStyle, multiplier);
  const xpForNextLevel = xpForLevel(level + 1, curveStyle, multiplier);
  return { currentLevelXp, xpIntoLevel: totalXp - currentLevelXp, xpForNextLevel };
}
