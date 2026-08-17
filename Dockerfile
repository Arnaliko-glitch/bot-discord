# syntax=docker/dockerfile:1
# Image multi-stage pour le monorepo pnpm — deux cibles finales : `web`
# (dashboard Next.js) et `bot` (client discord.js). node:20-slim (Debian,
# pas alpine) : @napi-rs/canvas (packages/bot, génération des bannières)
# est une dépendance native, plus sûre à builder/exécuter sur glibc.

FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

# --- Installation des dépendances (couche mise en cache tant que les
# manifests ne changent pas) ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/bot/package.json packages/bot/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# --- Build complet (web + bot + client Prisma) ---
FROM deps AS builder
COPY . .
# `build` (pas juste `prisma generate` seul) : compile aussi dist/index.js
# du package database, requis par web/bot qui en dépendent en workspace:*.
RUN pnpm --filter @discord-bot-dashboard/database build
RUN pnpm --filter web build
RUN pnpm --filter bot build
# Déploiement autonome du bot (dépendances de production uniquement,
# résolues correctement malgré les packages workspace:*) — voir la doc pnpm
# sur `pnpm deploy`, pensé pour exactement ce cas de figure.
RUN pnpm --filter bot deploy --prod /deploy/bot

# --- Image finale : dashboard web (mode "standalone" Next.js) ---
FROM base AS web
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# --- Image finale : bot Discord ---
FROM base AS bot
ENV NODE_ENV=production
COPY --from=builder /deploy/bot ./
# Les polices/assets ne font pas partie du build TypeScript (dist/) et ne
# sont pas repris par `pnpm deploy` — copiés séparément.
COPY --from=builder /app/packages/bot/assets ./assets
CMD ["node", "dist/index.js"]

# --- Cible utilitaire : appliquer le schéma Prisma (voir README) ---
# Basée sur `builder`, qui a le CLI Prisma installé — contrairement aux
# images `web`/`bot` ci-dessus, allégées au strict nécessaire à l'exécution.
FROM builder AS migrate
WORKDIR /app/packages/database
CMD ["npx", "prisma", "db", "push"]
