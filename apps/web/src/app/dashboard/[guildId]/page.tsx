import { getBotIdentity } from '@/lib/discord-bot';

export default async function GuildHomePage() {
  const bot = await getBotIdentity();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Accueil</h1>

      <div className="card">
        <h2 className="text-lg font-semibold text-white">Bienvenue dans le panneau d&apos;administration du bot {bot.name}</h2>
        <p className="mt-1 text-sm text-gray-500">
          Choisissez un module dans le menu à gauche pour commencer à le configurer.
        </p>
      </div>

      {/* Statistiques du serveur sous forme de tuiles — prévu plus tard. */}
    </div>
  );
}
