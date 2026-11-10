#!/usr/bin/env bash
# Copia de seguridad diaria. Uso: DB_USER=... DB_PASSWORD=... ./db/backup.sh /ruta/backups
set -euo pipefail
DESTINO="${1:?Indicá la carpeta de destino}"
mkdir -p "$DESTINO"
ARCHIVO="$DESTINO/portal_escuela_$(date +%Y%m%d_%H%M%S).sql.gz"
MYSQL_PWD="$DB_PASSWORD" mysqldump -u"$DB_USER" --single-transaction --routines portal_escuela | gzip > "$ARCHIVO"
find "$DESTINO" -name 'portal_escuela_*.sql.gz' -mtime +30 -delete
echo "Backup: $ARCHIVO"
