export async function register() {
  // Un seul .env à la racine du monorepo, partagé avec packages/bot — évite
  // de dupliquer les secrets dans apps/web/.env.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { config } = await import('dotenv');
    const path = await import('node:path');
    config({ path: path.resolve(process.cwd(), '../../.env') });

    // Lancé ici (pas dans une route) pour démarrer une seule fois avec le
    // serveur, plutôt qu'à la première requête reçue.
    const { startAutoSendScheduler } = await import('@/lib/auto-send-scheduler');
    startAutoSendScheduler();
  }
}
