# Discord Bot Dashboard

Monorepo pnpm : tableau de bord web (Next.js) + bot Discord (discord.js), configuration partagée via une base Postgres (Prisma).

- `apps/web` — dashboard Next.js 14
- `packages/bot` — bot Discord (discord.js v14)
- `packages/database` — schéma Prisma + client partagé
- `packages/shared` — types partagés

## Fonctionnalités

- **Arrivées et départs** — message et bannière générée dynamiquement (avatar cerclé, fond en image uploadée ou URL, ou couleur), variables `{user}` / `{server}` / `{server.membercount}`, mention du membre découplée du simple affichage.
- **Niveaux** — XP par message et en vocal (courbe et cooldown configurables), classement (`/niveau`, `/classement`, page publique `/leaderboard/[guildId]`), récompenses de rôle par palier (permanentes ou temporaires).
- **Messages** — composeur de messages interactifs : embeds multiples, galerie d'images, boutons (ouvrir un ticket ou rediriger vers un lien), aperçu fidèle au rendu Discord, brouillons.
- **Tickets** — création via bouton ou `/panel-ticket`, validation/refus, fermeture et réouverture avec motif.
- **Tag du serveur** — attribue automatiquement un rôle aux membres qui affichent le tag ("identité de serveur") de ce serveur sur leur profil Discord.
- **Accueil** — nombre de membres et graphique de variation nette (arrivées/départs) sur 30/60/90 jours, résumé `/statistiques` en salon.

## Développement local

Prérequis : Node.js 20+, pnpm 9, un Postgres accessible localement.

```bash
pnpm install
cp .env.example .env   # puis renseigner les valeurs
pnpm --filter @discord-bot-dashboard/database db:push   # synchronise le schéma
pnpm dev                                                  # web + bot en parallèle
```

Le dashboard tourne sur `http://localhost:3000`.

## Déploiement (Docker Compose)

Prérequis : Docker + Docker Compose sur le serveur.

```bash
cp .env.example .env   # puis renseigner les valeurs (voir ci-dessous)
docker compose up -d --build
```

Au premier lancement, applique le schéma à la base (le service `postgres` doit être démarré) :

```bash
docker compose run --rm migrate
```

### Variables d'environnement

Voir `.env.example` pour la liste complète et leur usage. Points d'attention :

- `DISCORD_REDIRECT_URI` doit correspondre exactement à l'URL de callback OAuth enregistrée dans le [portail développeur Discord](https://discord.com/developers/applications) de ton application.
- `DATABASE_URL` n'a pas besoin d'être ajustée pour Docker Compose : `docker-compose.yml` la reconstruit automatiquement à partir de `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` pour pointer vers le service `postgres`. Elle n'est utilisée telle quelle qu'en développement local (`pnpm dev`).
- `nginx/nginx.conf` fait un reverse proxy simple vers le dashboard sur le port `NGINX_PORT` (80 par défaut) — adapte `server_name` à ton domaine et ajoute un bloc HTTPS (ex: certbot) si besoin.

### Mettre à jour un déploiement existant

```bash
git pull
docker compose up -d --build
docker compose run --rm migrate
```
