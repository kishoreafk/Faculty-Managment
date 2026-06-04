#!/bin/sh
set -e

echo "Waiting for MySQL to be ready..."
i=0
while [ $i -lt 30 ]; do
  if mysql -h mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  i=$((i+1))
  echo "  attempt $i..."
  sleep 2
done

mysql -h mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`"

# Schema is fully idempotent (CREATE TABLE IF NOT EXISTS, INSERT IGNORE,
# DROP IF EXISTS for SPs/functions/triggers, info_schema guards on ALTERs).
# Safe to re-run on every migration cycle.
echo "Applying schema.sql (idempotent)..."
mysql -h mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$DB_NAME" < /schema.sql
echo "Schema applied."

for f in /migrations/*.sql; do
  echo "Running $f"
  mysql -h mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$DB_NAME" < "$f" 2>&1 || true
done

echo "Migration complete."