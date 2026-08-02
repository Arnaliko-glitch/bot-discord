import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getManagedGuilds } from '@/lib/guild-access';
import { guildIconUrl } from '@/lib/utils';
import Link from 'next/link';
import { Bot } from 'lucide-react';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const guilds = await getManagedGuilds();

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-bold">Mes serveurs</h1>
        <p className="mb-8 text-gray-400">Sélectionnez un serveur à configurer</p>

        {guilds.length === 0 ? (
          <div className="card text-center">
            <Bot className="mx-auto mb-4 h-12 w-12 text-gray-500" />
            <p className="mb-2 font-semibold">Aucun serveur disponible</p>
            <p className="mb-6 text-sm text-gray-400">
              Invitez le bot sur un serveur où vous êtes administrateur.
            </p>
            <a
              href={`https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands`}
              className="btn-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Inviter le bot
            </a>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {guilds.map((guild) => (
              <Link
                key={guild.id}
                href={`/dashboard/${guild.id}`}
                className="card flex items-center gap-4 transition hover:border-[var(--accent)]/50 hover:bg-[var(--card-hover)]"
              >
                <img src={guildIconUrl(guild.id, guild.icon, 128)} alt="" className="h-14 w-14 rounded-full" />
                <div>
                  <p className="font-semibold">{guild.name}</p>
                  <p className="text-sm text-gray-400">{guild.owner ? 'Propriétaire' : 'Administrateur'}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
