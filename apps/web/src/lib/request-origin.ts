// Origine publique de l'app — priorité à NEXT_PUBLIC_APP_URL (toujours
// fiable) plutôt qu'à l'origine perçue de la requête (new URL(request.url)),
// qui peut refléter le nom d'hôte interne du conteneur derrière un reverse
// proxy (nginx) au lieu du vrai domaine public.
export function appOrigin(request: Request): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  return configured || new URL(request.url).origin;
}

// La connexion entre nginx et ce process est en clair (TLS terminé par
// nginx) — se fier au header transmis par le proxy plutôt qu'au protocole
// de la connexion interne pour savoir si le cookie de session doit être
// marqué "secure".
export function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) return forwardedProto === 'https';
  return new URL(request.url).protocol === 'https:';
}
