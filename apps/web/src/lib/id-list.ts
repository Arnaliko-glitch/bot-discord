// Valide un tableau d'ids (rôles, salons...) reçu d'une requête PUT/POST —
// ne garde que les chaînes, plafonné pour éviter un tableau abusif.
export function parseIdList(value: unknown, max = 50): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, max);
}
