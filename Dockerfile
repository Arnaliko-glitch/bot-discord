# syntax=docker/dockerfile:1

# ─── Base ──────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# ─── Dependencies ────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/bot/package.json ./packages/bot/
COPY apps/web/package.json ./apps/web/
RUN npm ci

# ─── Builder ───────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL=postgresql://postgres:postgres@postgres:5432/discord_bot_dashboard?schema=public

RUN npm run db:generate
RUN npm run build -w @discord-bot-dashboard/shared
RUN npm run build -w @discord-bot-dashboard/database
RUN npm run build -w @discord-bot-dashboard/bot
RUN npm run build -w @discord-bot-dashboard/web

# ─── Bot Runner ────────────────────────────────────────────────────
FROM base AS bot
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./
CMD ["node", "packages/bot/dist/index.js"]

# ─── Web Runner ────────────────────────────────────────────────────
FROM base AS web
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
