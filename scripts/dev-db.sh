#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-up}"

case "$ACTION" in
  up)
    docker compose up -d postgres
    echo "Waiting for Postgres to be ready..."
    until docker compose exec postgres pg_isready -U padel -d padel_league >/dev/null 2>&1; do
      sleep 1
    done
    echo "Postgres ready at localhost:5432 (db: padel_league, user: padel)"
    ;;
  down)
    docker compose down
    ;;
  reset)
    docker compose down -v
    docker compose up -d postgres
    echo "Waiting for Postgres to be ready..."
    until docker compose exec postgres pg_isready -U padel -d padel_league >/dev/null 2>&1; do
      sleep 1
    done
    echo "Postgres ready at localhost:5432 (db: padel_league, user: padel)"
    ;;
  *)
    echo "usage: dev-db.sh [up|down|reset]"
    exit 1
    ;;
esac
