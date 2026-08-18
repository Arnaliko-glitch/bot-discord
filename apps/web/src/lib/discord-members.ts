export interface DiscordGuildMember {
  nick?: string | null;
  user: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar: string | null;
    bot?: boolean;
  };
}

// Même priorité que GuildMember.displayName côté discord.js : pseudo du
// serveur > nom global > pseudo Discord.
export function resolveDisplayName(member: DiscordGuildMember): string {
  return member.nick || member.user.global_name || member.user.username;
}

// Jusqu'à 1000 membres (une page, taille max de l'API Discord) — suffisant
// pour retrouver la plupart des membres à afficher/compléter dans le
// classement public sans payer une pagination complète à chaque requête.
export async function fetchGuildMembers(guildId: string, limit = 1000): Promise<DiscordGuildMember[]> {
  // Mis en cache 60s : cet appel ramène jusqu'à 1000 membres et alimente le
  // classement public, potentiellement consulté très souvent — sans cache,
  // chaque visite retéléchargerait la liste complète des membres à chaque fois.
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=${limit}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  return (await res.json()) as DiscordGuildMember[];
}

// Recherche native Discord (préfixe sur pseudo serveur / nom d'utilisateur)
// — fonctionne même sur des serveurs trop grands pour lister tous les
// membres d'un coup.
export async function searchGuildMembers(guildId: string, query: string, limit = 20): Promise<DiscordGuildMember[]> {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(query)}&limit=${limit}`,
    { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }, cache: 'no-store' }
  );
  if (!res.ok) return [];
  return (await res.json()) as DiscordGuildMember[];
}
