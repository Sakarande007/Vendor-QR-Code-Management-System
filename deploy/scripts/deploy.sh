#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy deploy/env/compose.env.example to .env and fill in values."
  exit 1
fi

if [[ ! -f deploy/env/api.env ]]; then
  cp deploy/env/api.env.example deploy/env/api.env
  echo "Created deploy/env/api.env from example."
fi

echo "Building and starting production stack..."
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo ""
echo "Waiting for API health..."
for i in {1..30}; do
  if docker compose -f docker-compose.prod.yml --env-file .env exec -T api curl -fsS http://127.0.0.1:5000/api/health >/dev/null 2>&1; then
    echo "API is healthy."
    break
  fi
  sleep 2
done

echo ""
echo "Stack status:"
docker compose -f docker-compose.prod.yml --env-file .env ps

echo ""
echo "Next steps:"
echo "  1. Point DNS: FRONTEND_DOMAIN and API_DOMAIN → this server"
echo "  2. Add HTTPS (Caddy/Certbot) in front of gateway port ${HTTP_PORT:-80}"
echo "  3. Run migrations if needed: docker compose -f docker-compose.prod.yml exec mysql mysql -u vendorqr -p vendor_qr_invoice < Server/config/migrations/002_invoice_system_id.sql"
echo "  4. Create admin user (see PROJECT_GUIDE.md)"
