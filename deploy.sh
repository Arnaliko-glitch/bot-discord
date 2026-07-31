cat > deploy.sh << 'EOF'
#!/bin/bash
set -e  # arrête le script si une commande échoue

echo "==> Pull des derniers changements"
git pull

echo "==> Installation des dépendances (devDependencies incluses)"
unset NODE_ENV
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

echo "==> Chargement des variables d'environnement pour PM2"
set -o allexport
source .env
set +o allexport

echo "==> Redémarrage des process PM2"
pm2 restart discord-bot discord-web --update-env

echo "==> Déploiement terminé"
pm2 list
EOF

chmod +x deploy.sh