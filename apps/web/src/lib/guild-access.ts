import { fetchUserGuilds, getSession, hasManageGuild, type SessionData } from './auth';

// Utilisé en tête de chaque route API /api/guilds/[id]/* — lève si
// l'utilisateur n'est pas connecté ou n'a pas la permission "Gérer le
// serveur" sur cette guilde précise.
export async function requireGuildAccess(guildId: string): Promise<SessionData> {
  const session = await getSession();
  if (!session) throw new Error('Non connecté');
  const guilds = await fetchUserGuilds(session.accessToken);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild || !hasManageGuild(guild.permissions)) throw new Error('Accès refusé');
  return session;
}
