# Discord Bot Dashboard

Monorepo pnpm : tableau de bord web (Next.js) + bot Discord (discord.js), configuration partagée via une base Postgres (Prisma).

- `apps/web` — dashboard Next.js 14
- `packages/bot` — bot Discord (discord.js v14)
- `packages/database` — schéma Prisma + client partagé
- `packages/shared` — types partagés

## Fonctionnalités

- **Arrivées et départs** — message et bannière générée dynamiquement (avatar cerclé, fond en image uploadée ou URL, ou couleur), variables `{user}` / `{server}` / `{server.membercount}`, mention du membre découplée du simple affichage.
- **Niveaux** — XP par message et en vocal (courbe et cooldown configurables), classement (`/niveau`, `/classement`, page publique paginée `/leaderboard/[guildId]`, activable/désactivable), récompenses de rôle par palier (permanentes ou temporaires), import de l'historique XP depuis DraftBot.
- **Messages** — composeur de messages interactifs : contenu, embeds multiples (auteur + icône, titre cliquable, champs, footer + icône, vignette et image), galerie d'images autonome, boutons (ouvrir un ticket ou rediriger vers un lien), aperçu fidèle au rendu Discord, brouillons.
- **Rôles-réactions** — panneaux où réagir avec un emoji donne un rôle (et le retire au retrait de la réaction) ; contenu, image et/ou embed au choix, synchronisation automatique des réactions à chaque republication.
- **Tickets** — création via bouton ou `/panel-ticket`, validation/refus, fermeture et réouverture avec motif, suppression automatique optionnelle quand un membre du staff ferme le ticket.
- **Salons privés** — salon "hub" qui crée un salon vocal temporaire à la jonction (façon DraftBot), avec panneau de boutons dans le salon créé (fermer/ouvrir, privé, renommer, limite, purge, transfert/réquisition, listes blanche/noire), permissions de création configurables (catégorie ou salon hub, droits Discord du propriétaire), rôles modérateurs et intouchables, nettoyage automatique des salons vides et orphelins.
- **Tag du serveur** — attribue automatiquement un rôle aux membres qui affichent le tag ("identité de serveur") de ce serveur sur leur profil Discord.
- **Logs** — salon de logs pour les événements du tag du serveur (ajout/retrait), catégories supplémentaires à venir ; salons de statistiques (vocaux ou textuels, créés depuis le dashboard) renommés périodiquement pour afficher le nombre de membres du serveur.
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

### Ajouter des niveaux depuis Discord

Les administrateurs peuvent utiliser `/ajouter-niveaux membre:@Membre niveaux:3`
pour accorder des niveaux à un membre (de 1 à 1000 par commande). Le module
Niveaux doit être activé. L'ajout complète la progression actuelle jusqu'au
niveau cible et respecte le niveau maximum configuré. Les annonces et les
récompenses de passage de niveau habituelles sont déclenchées ; la confirmation
de la commande est privée.

Après installation, enregistrer la commande avec
`pnpm --filter @discord-bot-dashboard/bot deploy-commands --command ajouter-niveaux`
et redémarrer le bot en production.

### Giveaways depuis Discord

La commande `/giveaway` est réservée aux membres ayant la permission
**Gérer le serveur**. La participation par bouton est ouverte aux membres du salon.

```text
/giveaway creer
```

La commande ouvre le formulaire « Récompense personnalisée », puis un aperçu
privé avec les boutons **Titre & description**, **Durée**, **Récompense**,
**Gagnants** et **Salon**. Le menu **Configurer des options avancées…** permet
d'ajouter une vignette et une grande image par envoi de fichiers (PNG, JPG,
GIF ou WebP, 8 Mo maximum par fichier). Les champs laissés vides retirent les
images précédentes. Le bot copie les fichiers sur son propre message.
**Lancer le giveaway** publie dans le salon choisi et démarre le compte à
rebours ; **Annuler** abandonne la préparation. L'aperçu expire après 14 minutes
ou un redémarrage du bot. Par défaut : 3 jours, 1 gagnant, salon actuel.
Les paramètres `lot`, `duree`, `image`, `gagnants` et `salon` restent disponibles
pour préremplir cet aperçu. Le bouton **Participants (nombre)** affiche une
liste privée des participants et le total, à raison de 25 participants par page.
Les boutons **Précédent**, **Suivant** et **Page** permettent de parcourir
toute la liste ou d'aller directement à une page donnée.
Le menu avancé permet aussi de masquer ou afficher ce bouton et de choisir
jusqu'à 10 rôles à mentionner au lancement.
Les mentions apparaissent au-dessus du message ; les mises à jour du giveaway
ne renvoient pas de notification. Le bot doit pouvoir mentionner les rôles
choisis dans le salon de publication. La description s'affiche en citation,
séparée de la récompense par une ligne vide.
Dans la liste privée des participants, seuls les membres ayant la permission
**Administrateur** voient **Retirer un participant**. Cette permission est
vérifiée aussi à la validation du formulaire ; être le créateur du giveaway
ou posséder **Gérer le serveur** ne suffit pas. Le retrait est possible tant
que le giveaway est en cours. Le membre n'est pas notifié et peut se réinscrire.

À la fin du tirage, le créateur reçoit un MP récapitulatif avec la récompense à
remettre et les gagnants, uniquement lorsqu'il y a un gagnant, ainsi qu'un deuxième
embed annonçant la fin du tirage. Si le créateur termine lui-même le giveaway
avec `/giveaway terminer`, il ne reçoit que « Récompense à donner ! ».
Les autres participants ne reçoivent pas de MP : les résultats sont annoncés
dans le salon du giveaway. Les embeds privés sont rouges.
Les envois sont enregistrés en base
et les erreurs temporaires sont réessayées après une panne ou un redémarrage.
Les MP fermés ne bloquent ni le tirage ni l'annonce publique. Les giveaways
déjà terminés avant cette fonctionnalité ne déclenchent pas de MP rétroactif.
Les durées acceptent `s`, `m`, `h`, `j` ou `d`, ainsi que des combinaisons
comme `1j 2h`, de 10 secondes à 30 jours. Le nombre de gagnants va de 1 à 20.

Un clic sur le bouton inscrit le membre. Un second affiche une réponse privée
avec **Se désinscrire**, qui permet de confirmer le retrait. Les confirmations
et la liste des participants sont affichées dans des embeds rouges.
Le message proposant **Se désinscrire** est remplacé par « Le giveaway est terminé ! »
à la fin du tirage, tant que sa réponse privée est encore modifiable par Discord
(15 minutes après le clic, et sans redémarrage du bot).
Le bot contrôle les échéances toutes les 10 secondes, tire au sort sans doublon et écarte les
membres ayant quitté le serveur. S'il reste moins de participants éligibles
que de gagnants demandés, il désigne tous les participants éligibles restants.
Le résultat apparaît dans le message du giveaway. Un message séparé dans le
même salon mentionne uniquement les gagnants et indique le lot remporté, avec
un lien vers le giveaway. Les mentions `@everyone`, `@here` et les rôles sont
désactivés dans l'annonce. Sans participant éligible, le message de fin est
publié sans mention. Un nouveau tirage publie une
nouvelle annonce. Les annonces échouées sont réessayées après rétablissement ;
les anciens giveaways déjà terminés ne sont pas annoncés rétroactivement.
Les inscriptions et les
résultats sont conservés dans PostgreSQL : les fins manquées pendant un arrêt
sont rattrapées au démarrage, les éditions Discord échouées sont réessayées.

Autres commandes, avec le lien ou l'identifiant du message d'origine :

```text
/giveaway terminer message:[lien ou identifiant]
/giveaway annuler message:[lien ou identifiant]
/giveaway relancer message:[lien ou identifiant]
```

`relancer` fonctionne sur un giveaway terminé et exclut les gagnants du
dernier tirage. Si aucun autre participant n'est éligible, le résultat est conservé.

Installation sur un autre environnement local :

```bash
pnpm --filter @discord-bot-dashboard/database db:push
pnpm --filter @discord-bot-dashboard/database build
pnpm --filter @discord-bot-dashboard/bot deploy-commands --command giveaway
pnpm dev
```

Sous Windows, arrêter d'abord les processus du projet qui utilisent Prisma
avant la génération du client, puis les relancer. L'option `--command giveaway`
enregistre uniquement cette commande et conserve les autres. Pour limiter
l'enregistrement à un serveur de développement, renseigner `DISCORD_GUILD_ID`
dans `.env` avant de lancer `deploy-commands` ; sinon, l'enregistrement est global
sur l'application Discord configurée.

Vérifications : `pnpm --filter @discord-bot-dashboard/bot test:giveaway`.
Le test `test:giveaway:integration` exige un PostgreSQL local configuré dans
`.env` ; il utilise des données temporaires supprimées à la fin et simule
Discord sans y publier de message.

## Déploiement (Docker Compose)

Prérequis : Docker + Docker Compose sur le serveur, un nom de domaine qui pointe vers son IP (un sous-domaine gratuit type `<ip-avec-tirets>.sslip.io` fonctionne très bien, aucun DNS à configurer).

```bash
cp .env.example .env   # puis renseigner les valeurs (voir ci-dessous), y compris DOMAIN
```

### Bootstrap HTTPS (une seule fois, avant le tout premier démarrage)

`nginx` a besoin qu'un certificat existe déjà pour démarrer (son bloc HTTPS le référence directement) — on l'obtient donc une première fois en mode autonome, port 80 libre, avant de lancer le reste de la stack :

```bash
docker run -it --rm -p 80:80 \
  -v discord-bot-dashboard_certbot_conf:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d "$DOMAIN" --agree-tos -m ton-email@example.com --non-interactive
```

(remplace `discord-bot-dashboard_` par le nom réel du dossier du projet si différent — Docker Compose préfixe les volumes avec le nom du répertoire ; `docker volume ls` pour vérifier le nom exact si besoin).

### Premier démarrage

```bash
docker compose up -d --build
docker compose run --rm migrate
```

Le service `certbot` de la stack prend ensuite le relais tout seul pour le renouvellement (vérifie deux fois par jour, ne renouvelle réellement que dans les ~30 jours avant expiration) — plus rien à faire manuellement après ce premier bootstrap.

### Variables d'environnement

Voir `.env.example` pour la liste complète et leur usage. Points d'attention :

- `DOMAIN` (sans `https://` ni chemin), `DISCORD_REDIRECT_URI` et `NEXT_PUBLIC_APP_URL` doivent tous les trois pointer vers le même domaine, en HTTPS.
- `DISCORD_REDIRECT_URI` doit correspondre exactement à l'URL de callback OAuth enregistrée dans le [portail développeur Discord](https://discord.com/developers/applications) de ton application.
- `DATABASE_URL` n'a pas besoin d'être ajustée pour Docker Compose : `docker-compose.yml` la reconstruit automatiquement à partir de `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` pour pointer vers le service `postgres`. Elle n'est utilisée telle quelle qu'en développement local (`pnpm dev`).
- `nginx/nginx.conf.template` fait un reverse proxy HTTPS vers le dashboard (port 80 redirigé vers 443) — `${DOMAIN}` y est substitué automatiquement au démarrage du conteneur.

### Mettre à jour un déploiement existant

```bash
git pull
docker compose up -d --build
docker compose run --rm migrate
```

### Journées des statistiques membres

Le bot, `/statistiques` et le dashboard regroupent les arrivées et départs
selon `Europe/Paris` (UTC+2 en été, UTC+1 en hiver). La colonne
`DailyMemberStat.date` représente une date civile, encodée à `00:00Z` pour
servir de clé. Les horodatages réels des autres tables restent en UTC.

Les anciens compteurs ont été regroupés en UTC sans conserver les événements
individuels. Avant de déployer ce changement sur une base existante, sauvegarder
la base et reconstruire les journées depuis une source horodatée complète
(logs/messages d'arrivées et de départs, en excluant les bots). Comparer d'abord
les totaux de cette source avec les anciens compteurs UTC, puis recalculer les
jours parisiens, y compris les événements autour des bornes de la période.
Coordonner le recalcul avec le changement du bot pour éviter les doubles comptes
ou le mélange des deux fuseaux sur la journée de transition.

Ajouter deux heures aux dates ou aux champs `createdAt`/`updatedAt` ne permet pas
de retrouver l'heure des événements déjà agrégés. Sans source complète, un
recalcul exact de l'historique est impossible ; les anciennes valeurs ne doivent
pas être présentées comme un historique recalculé à l'heure de Paris.

L'outil ponctuel `scripts/apply-member-stats-paris.cjs` prend un audit JSON
(`guildId`, `rows` d'origine, `events` humains avec `id`, `kind` joins/leaves et
`at`). À exécuter depuis le répertoire du bot, avec
`member-stats-paris-plan.cjs` à côté du script : simulation par défaut,
écriture seulement avec `--apply`. Il vérifie les totaux, refuse les messages
proches de minuit et les historiques incomplets. Un reliquat sans messages
peut être conservé uniquement si le dernier incrément `updatedAt` d'origine
prouve qu'il précède minuit à Paris. L'écriture est transactionnelle et refuse
un audit devenu obsolète à cause de nouveaux événements ; réutiliser le même
audit après application ne décale pas une seconde fois les compteurs.

Tests de la reconstruction : `node --test scripts/member-stats-paris-plan.test.cjs`.

Tests des limites de journées et changements d'heure :
`pnpm --filter @discord-bot-dashboard/shared test`.

### Sauvegardes

Le service `backup` fait un `pg_dump` complet une fois par jour à heure fixe (`BACKUP_HOUR`, 3h UTC par défaut), sans action manuelle — démarre automatiquement avec `docker compose up -d`, un fichier compressé dans `./backups` sur l'hôte (ex: `discord_dashboard_2026-08-26_03-00-00.sql.gz`), les sauvegardes de plus de `BACKUP_RETENTION_DAYS` jours (7 par défaut) sont supprimées automatiquement.

Pour restaurer une sauvegarde :

```bash
gunzip -c backups/discord_dashboard_AAAA-MM-JJ_HH-MM-SS.sql.gz | docker compose exec -T postgres psql -U ${POSTGRES_USER:-discord_dashboard} -d ${POSTGRES_DB:-discord_dashboard}
```
