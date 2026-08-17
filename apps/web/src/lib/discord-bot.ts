export interface BotIdentity {
  name: string;
  avatarUrl: string | null;
}

// Utilisé dans les aperçus du dashboard (ex: WelcomeConfigPage) pour
// afficher le vrai nom/avatar du bot plutôt qu'un texte générique.
export async function getBotIdentity(): Promise<BotIdentity> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { name: 'Votre Bot', avatarUrl: null };

  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { name: 'Votre Bot', avatarUrl: null };
    const data = (await res.json()) as { id: string; username: string; avatar: string | null };
    const avatarUrl = data.avatar
      ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=64`
      : null;
    return { name: data.username, avatarUrl };
  } catch {
    return { name: 'Votre Bot', avatarUrl: null };
  }
}
