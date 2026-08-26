#!/bin/sh
# Sauvegarde quotidienne de la base Postgres, à heure fixe — lancé en boucle
# par le service `backup` de docker-compose.yml, pas destiné à être appelé
# autrement (utilise pg_dump/PGHOST/PGUSER/... hérités de l'image
# postgres:16-alpine et des variables d'environnement du service).
set -eu

BACKUP_DIR=/backups
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
# Heure (0-23) de la sauvegarde quotidienne, dans le fuseau du conteneur
# (UTC par défaut sur l'image postgres:16-alpine).
BACKUP_HOUR="${BACKUP_HOUR:-3}"

run_backup() {
  timestamp=$(date +%Y-%m-%d_%H-%M-%S)
  file="$BACKUP_DIR/${PGDATABASE}_${timestamp}.sql.gz"

  echo "[$timestamp] Sauvegarde de la base vers $file..."
  if pg_dump | gzip > "$file"; then
    echo "[$timestamp] Sauvegarde terminée."
  else
    echo "[$timestamp] Échec de la sauvegarde." >&2
    rm -f "$file"
  fi

  # Ne garde que les N derniers jours pour ne pas remplir le disque
  # indéfiniment — ajuster via BACKUP_RETENTION_DAYS dans .env.
  find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
}

while true; do
  # Secondes jusqu'à la prochaine occurrence de BACKUP_HOUR:00 — aujourd'hui
  # si pas encore passée, sinon demain. "10#" force la base 10 (évite une
  # erreur si l'heure/minute a un zéro devant, ex: "08" en octal invalide).
  now_seconds_today=$(( 10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S) ))
  target_seconds_today=$(( BACKUP_HOUR * 3600 ))

  if [ "$now_seconds_today" -lt "$target_seconds_today" ]; then
    wait=$((target_seconds_today - now_seconds_today))
  else
    wait=$((86400 - now_seconds_today + target_seconds_today))
  fi

  echo "Prochaine sauvegarde dans ${wait}s (vers ${BACKUP_HOUR}h00)."
  sleep "$wait"
  run_backup
done
