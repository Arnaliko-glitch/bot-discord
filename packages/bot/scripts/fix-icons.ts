import { prisma } from '@discord-bot-dashboard/database';

function extractIconHash(icon: string | null): string | null {
  if (!icon) return null;
  if (!icon.startsWith('http')) return icon; // déjà un hash brut, rien à faire

  // Exemple : https://cdn.discordapp.com/icons/123456789/abcdef123456.png?size=128
  const match = icon.match(/\/icons\/\d+\/([a-zA-Z0-9_]+)\.(png|jpg|jpeg|gif|webp)/);
  return match ? match[1] : null;
}

async function main() {
  const guilds = await prisma.guild.findMany({
    select: { id: true, name: true, icon: true },
  });

  let fixed = 0;

  for (const guild of guilds) {
    if (guild.icon && guild.icon.startsWith('http')) {
      const hash = extractIconHash(guild.icon);
      await prisma.guild.update({
        where: { id: guild.id },
        data: { icon: hash },
      });
      console.log(`✔ ${guild.name} (${guild.id}) : "${guild.icon}" → "${hash}"`);
      fixed++;
    }
  }

  console.log(`\nTerminé — ${fixed} serveur(s) corrigé(s) sur ${guilds.length}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});