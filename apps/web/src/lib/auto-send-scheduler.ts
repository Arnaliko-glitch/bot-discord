import { prisma } from '@discord-bot-dashboard/database';
import { sendSavedMessage } from '@/lib/send-saved-message';

const TICK_MS = 30_000;

async function tick() {
  const due = await prisma.savedMessage.findMany({
    where: { autoSendEnabled: true, autoSendNextAt: { lte: new Date() } },
  });

  for (const message of due) {
    const intervalMin = message.autoSendIntervalMin;
    if (!intervalMin || intervalMin <= 0) continue;

    // Toujours un nouveau message (mode "resend"), jamais une édition — un
    // envoi automatique est censé rebondir en bas du salon à chaque fois.
    await sendSavedMessage(message, 'resend').catch((err) => console.error('Envoi automatique échoué:', err));

    // Reprogrammé même si l'envoi a échoué (salon supprimé, message vide...)
    // pour ne pas marteler Discord en boucle toutes les 30s sur une erreur
    // qui ne se résoudra pas toute seule.
    await prisma.savedMessage
      .update({
        where: { id: message.id },
        data: { autoSendNextAt: new Date(Date.now() + intervalMin * 60_000) },
      })
      .catch((err) => console.error('Replanification envoi automatique échouée:', err));
  }
}

// Démarré une seule fois au lancement du serveur (voir instrumentation.ts) —
// un seul process web tourne en continu dans ce déploiement (pas de scaling
// horizontal), donc pas de risque de double envoi par plusieurs instances.
export function startAutoSendScheduler() {
  setInterval(() => {
    tick().catch((err) => console.error('Planificateur d\'envoi automatique échoué:', err));
  }, TICK_MS);
}
