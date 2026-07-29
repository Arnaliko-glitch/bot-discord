#!/usr/bin/env bash
set -euo pipefail

# Discord Bot Dashboard - Script d'installation VPS (Ubuntu/Debian)
# Usage: sudo bash install.sh

APP_DIR="/opt/discord-bot-dashboard"
REPO_URL="${REPO_URL:-https://github.com/your-user/discord-bot-dashboard.git}"
DOMAIN="${DOMAIN:-localhost}"

echo "🚀 Installation Discord Bot Dashboard"

# Dépendances système
apt-get update
apt-get install -y curl git nginx postgresql postgresql-contrib

# Node.js 20
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# PM2
npm install -g pm2

# PostgreSQL
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'discord_bot_dashboard'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE discord_bot_dashboard;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" 2>/dev/null || true

# Clone ou mise à jour
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR" && git pull
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# Configuration environnement
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Éditez $APP_DIR/.env avec vos identifiants Discord"
fi

# Installation
npm ci
npm run db:generate
npm run db:push
npm run build

# Nginx
cp nginx/nginx.conf /etc/nginx/sites-available/discord-bot-dashboard
ln -sf /etc/nginx/sites-available/discord-bot-dashboard /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# PM2
pm2 delete ecosystem.config.js 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

echo ""
echo "✅ Installation terminée!"
echo ""
echo "Prochaines étapes:"
echo "  1. Éditez $APP_DIR/.env"
echo "  2. Configurez votre application Discord (voir README.md)"
echo "  3. Redémarrez: pm2 restart all"
echo "  4. Accédez au dashboard: http://$DOMAIN"
