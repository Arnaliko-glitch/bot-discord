// Les emojis personnalisés sont stockés au format Discord affiché
// (<a:nom:id> ou <:nom:id>, voir EmojiPickerPanel côté dashboard) — on en
// extrait l'id, seul identifiant stable (le nom peut changer si le serveur
// renomme l'emoji, l'id jamais). Retourne null pour un emoji Unicode brut.
export function extractCustomEmojiId(stored: string): string | null {
  const custom = /^<a?:\w+:(\d+)>$/.exec(stored);
  return custom ? custom[1] : null;
}
