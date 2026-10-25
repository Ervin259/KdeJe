#!/bin/sh
# KdeJe – denná šifrovaná záloha databázy Supabase na Synology NAS
# Spúšťa Plánovač úloh (Task Scheduler) na Synology, potrebuje Container Manager (Docker).
# Návod: docs/zalohy.md
set -eu

DIR="${KDEJE_BACKUP_DIR:-/volume1/zalohy/kdeje}"        # kam ukladať zálohy
ENV_FILE="${KDEJE_ENV_FILE:-$DIR/.kdeje-zaloha.env}"     # DB_URL a HESLO (súbor len pre admina, chmod 600)
KEEP_DAYS="${KDEJE_KEEP_DAYS:-30}"                       # koľko dní zálohy držať

. "$ENV_FILE"   # nastaví DB_URL a HESLO
: "${DB_URL:?Chýba DB_URL v $ENV_FILE}"
: "${HESLO:?Chýba HESLO v $ENV_FILE}"

STAMP=$(date +%Y-%m-%d_%H%M)
OUT="$DIR/kdeje-$STAMP.sql.gz.enc"
mkdir -p "$DIR"

# pg_dump z oficiálneho obrazu Postgres 17 (zvládne aj staršiu verziu servera)
docker run --rm -e DB_URL="$DB_URL" postgres:17-alpine \
  sh -c 'pg_dump "$DB_URL" --no-owner --no-privileges --schema=public --schema=auth' \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:HESLO -out "$OUT"

# kontrola, že záloha nie je prázdna
[ "$(wc -c < "$OUT")" -gt 1000 ] || { echo "Záloha je podozrivo malá: $OUT" >&2; exit 1; }

# staré zálohy preč
find "$DIR" -name 'kdeje-*.sql.gz.enc' -mtime +"$KEEP_DAYS" -delete

echo "OK $OUT ($(du -h "$OUT" | cut -f1))"
