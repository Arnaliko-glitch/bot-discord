# Discord Bot Dashboard

Bot Discord modulaire avec tableau de bord web — welcome messages, tickets, XP/niveaux, rôles automatiques, logs et gestion des permissions.

## Architecture

Monorepo npm workspaces :

```
discord-bot-dashboard/
├── packages/
│   ├── shared/      # Types et utilitaires partagés
│   ├── database/    # Prisma ORM + schéma PostgreSQL
│   └── bot/         # Bot Discord (discord.js v14)
├── apps/
│   └── web/         # Dashboard Next.js 14 (App Router)
├── nginx/           # Config reverse proxy
├── docker-compose.yml
├── Dockerfile
├── ecosystem.config.js
└── install.sh
```

## Prérequis

- **Node.js** 20+
- **PostgreSQL** 14+
- **Compte Discord Developer** — [discord.com/developers/applications](https://discord.com/developers/applications)

---

## Configuration Discord Developer Portal

### 1. Créer une application

1. Allez sur [Discord Developer Portal](https://discord.com/developers/applications)
2. **New Application** → nommez-la (ex: `Mon Bot Dashboard`)
3. Notez le **Application ID** (= `DISCORD_CLIENT_ID`)

### 2. Configurer le Bot

1. Onglet **Bot** → **Reset Token** → copiez le token (`DISCORD_BOT_TOKEN`)
2. Activez les **Privileged Gateway Intents** :
   - ✅ Server Members Intent
   - ✅ Message Content Intent
3. Intents requis : `Guilds`, `GuildMembers`, `GuildMessages`, `MessageContent`, `GuildMessageReactions`

### 3. OAuth2

1. Onglet **OAuth2** → **General**
2. Ajoutez une **Redirect URI** :
   - Dev : `http://localhost:3000/api/auth/callback`
   - Prod : `https://votre-domaine.com/api/auth/callback`
3. Copiez le **Client Secret** (`DISCORD_CLIENT_SECRET`)
4. Scopes OAuth requis pour le dashboard : `identify`, `guilds`

### 4. Inviter le bot

Utilisez ce lien (remplacez `CLIENT_ID`) :

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

Permissions recommandées : Administrateur (ou au minimum : Gérer les salons, Gérer les rôles, Envoyer des messages, Gérer les messages, Lire l'historique).

---

## Installation locale

### 1. Cloner et configurer

```bash
cd C:\Users\Remi\Projects\discord-bot-dashboard
copy .env.example .env
# Éditez .env avec vos identifiants Discord
```

### 2. Installer les dépendances

```bash
npm install
npm run db:generate
```

### 3. Base de données

Assurez-vous que PostgreSQL tourne, puis :

```bash
npm run db:deploy   # applique les migrations (recommandé)
# ou npm run db:push pour un schéma sans historique de migration
npm run db:seed     # optionnel — données de démo
```

### 4. Lancer en développement

```bash
# Bot + Web simultanément
npm run dev

# Ou séparément :
npm run dev:bot   # Bot Discord
npm run dev:web   # Dashboard → http://localhost:3000
```

---

## Déploiement Docker

```bash
# Configurer .env
copy .env.example .env

# Lancer tous les services
docker compose up -d --build
```

Services :
| Service   | Description                    | Port    |
|-----------|--------------------------------|---------|
| postgres  | Base de données                | 5432    |
| bot       | Bot Discord                    | —       |
| web       | Dashboard Next.js              | 3000    |
| nginx     | Reverse proxy                  | 80      |

Accès : `http://localhost` (via Nginx)

Arrêter : `docker compose down`

---

## Déploiement VPS (PM2 + Nginx)

Sur un serveur Linux (Ubuntu/Debian) :

```bash
sudo bash install.sh
```

Puis éditez `/opt/discord-bot-dashboard/.env` et redémarrez :

```bash
pm2 restart all
```

---

## Fonctionnalités

### Dashboard Web

| Module | Description |
|--------|-------------|
| 🎨 Welcome | Messages bienvenue/au revoir (texte ou embed) avec aperçu live |
| 🎫 Tickets | Catégorie, rôle support, salon du panel, confirmation de fermeture, transcripts, suppression auto du salon |
| ⭐ XP | XP min/max, cooldown, annonces level-up |
| 🏅 Rôles niveau | Attribution automatique par palier |
| 🤖 Modules | Activer/désactiver chaque module |
| 📊 Stats | Vue d'ensemble du serveur |
| 👥 Utilisateurs | Classement XP avec barre de progression |
| 📜 Logs | Historique des actions |
| 🔒 Permissions | Gestion des admins dashboard |

### Bot Discord

- `/ticket panel` — Créer un panel de tickets
- `/ticket close` — Fermer un ticket
- `/rank [user]` — Voir le niveau XP
- `/modules <module> <enabled>` — Toggle module (admin)

Modules : welcome, tickets, xp, levelRoles, logging — tous respectent les paramètres en base.

---

## Variables d'environnement

Voir `.env.example` pour la liste complète.

| Variable | Description |
|----------|-------------|
| `DISCORD_CLIENT_ID` | ID application Discord |
| `DISCORD_CLIENT_SECRET` | Secret OAuth2 |
| `DISCORD_BOT_TOKEN` | Token du bot |
| `DISCORD_REDIRECT_URI` | URL callback OAuth |
| `SESSION_SECRET` | Clé session JWT (32+ chars) |
| `DATABASE_URL` | Connexion PostgreSQL |
| `NEXT_PUBLIC_APP_URL` | URL publique du dashboard |

---

## Commandes utiles

```bash
npm run dev          # Dev bot + web
npm run build        # Build production
npm run db:migrate   # Créer/appliquer une migration (dev)
npm run db:deploy    # Appliquer les migrations (prod)
npm run db:studio    # Interface Prisma Studio
npm run start:bot    # Bot production
npm run start:web    # Web production
```

---

## Licence

MIT — Projet créé pour Remi.
