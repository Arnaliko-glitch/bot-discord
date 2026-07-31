#!/bin/bash
set -e  # arrête le script si une commande échoue

echo "==> Pull des derniers changements"
git pull

echo "==> Installation des dépendances"
npm install

echo "==> Génération du client Prisma"
npm run db:generate

echo "==> Build du dashboard web"
cd apps/web
npm run build
cd ../..

echo "==> Build du bot"
cd packages/bot
npm run build
cd ../..

echo "==> Redémarrage des process PM2"
pm2 restart discord-bot discord-web

echo "==> Déploiement terminé"
pm2 list