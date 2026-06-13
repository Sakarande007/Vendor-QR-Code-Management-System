# Production deployment (VPS + Docker)

Deploy the Vendor QR Invoice system for **pinwardbarcode.in**:

| URL | Service |
|-----|---------|
| `https://www.pinwardbarcode.in` | React SPA (nginx) |
| `https://api.pinwardbarcode.in` | Express API |

Stack: **MySQL 8**, **Redis 7**, **API**, **static web**, **nginx gateway** (virtual hosts).

---

## 1. Server requirements

- Ubuntu 22.04+ (or similar Linux VPS)
- Docker Engine 24+ and Docker Compose v2
- 2 GB RAM minimum (4 GB recommended)
- Ports **80** and **443** open (or **8080** if Caddy/nginx terminates TLS on the host)

---

## 2. DNS

Create **A records** pointing to your VPS IP:

| Host | Points to |
|------|-----------|
| `pinwardbarcode.in` | VPS IP |
| `www.pinwardbarcode.in` | VPS IP |
| `api.pinwardbarcode.in` | VPS IP |

`pinwardbarcode.in` can redirect to `www` via Caddy (see `deploy/caddy/Caddyfile.example`).

---

## 3. Clone and configure

```bash
sudo mkdir -p /opt/vendor-qr
sudo chown "$USER":"$USER" /opt/vendor-qr
cd /opt/vendor-qr
git clone <your-repo-url> .
```

### Root `.env` (compose)

```bash
cp deploy/env/compose.env.example .env
```

Edit `.env` — set domains, secrets, and Vite build vars. Generate secrets:

```bash
# 64-char hex encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Random JWT secrets (use different values for access vs refresh)
openssl rand -base64 48
```

Important values:

| Variable | Value |
|----------|-------|
| `FRONTEND_DOMAIN` | `www.pinwardbarcode.in pinwardbarcode.in` |
| `API_DOMAIN` | `api.pinwardbarcode.in` |
| `VITE_API_URL` | `https://api.pinwardbarcode.in` |
| `CLIENT_URL` | `https://www.pinwardbarcode.in` |
| `API_BASE_URL` | `https://api.pinwardbarcode.in` |
| `COOKIE_SAME_SITE` | `none` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_DOMAIN` | `.pinwardbarcode.in` |
| `CORS_ORIGINS` | `https://pinwardbarcode.in` |

### API runtime env

```bash
cp deploy/env/api.env.example deploy/env/api.env
```

Adjust logging, SMTP, pool sizes if needed. Compose overrides DB/Redis hosts and secrets from `.env`.

---

## 4. Build and start

```bash
chmod +x deploy/scripts/deploy.sh
./deploy/scripts/deploy.sh
```

Or manually:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

First boot:

- MySQL loads `Server/config/schema.sql` into a fresh volume.
- API runs `ensureInvoiceSchema` / `ensureMasterSchema` on startup.

Verify:

```bash
docker compose -f docker-compose.prod.yml --env-file .env ps
curl -s http://127.0.0.1/api/health   # via gateway on HTTP_PORT
```

---

## 5. HTTPS

### Option A — Caddy on the host (recommended)

1. Set `HTTP_PORT=8080` in `.env` so the gateway does not bind host `:80`.
2. Install [Caddy](https://caddyserver.com/docs/install).
3. Copy and edit `deploy/caddy/Caddyfile.example` → `/etc/caddy/Caddyfile`.
4. `sudo systemctl reload caddy`

Caddy obtains Let's Encrypt certificates automatically.

### Option B — Certbot + nginx on the host

Terminate TLS on the host and reverse-proxy to `127.0.0.1:${HTTP_PORT}` with `X-Forwarded-Proto https`.

### Option C — Cloudflare

Orange-cloud DNS; set `TRUST_PROXY=1` on the API (default in `api.env.example`).

---

## 6. First admin user

After MySQL is up, create a superadmin (adjust email/password hash):

```bash
docker compose -f docker-compose.prod.yml exec mysql mysql -u vendorqr -p vendor_qr_invoice
```

See [PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the full bootstrap SQL / bcrypt hash steps.

---

## 7. CI/CD (GitHub Actions)

Workflow: [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml)

| Job | Purpose |
|-----|---------|
| `test` | `npm ci`, syntax check, client build |
| `build-images` | Push `api` and `web` images to `ghcr.io/<repo>/api` and `web` |
| `deploy` | Optional SSH deploy when `DEPLOY_ENABLED=true` |

### Enable deploy job

Repository **Variables**:

- `DEPLOY_ENABLED` = `true`
- `VITE_API_URL` = `https://api.pinwardbarcode.in` (optional, for web image build)

Repository **Secrets**:

- `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- `VPS_APP_PATH` (optional, default `/opt/vendor-qr`)

On the VPS `.env`, set image names instead of building locally:

```env
API_IMAGE=ghcr.io/your-org/your-repo/api:latest
WEB_IMAGE=ghcr.io/your-org/your-repo/web:latest
```

Deploy script on VPS:

```bash
docker compose -f docker-compose.prod.yml --env-file .env pull api web
docker compose -f docker-compose.prod.yml --env-file .env up -d --remove-orphans
```

---

## 8. Operations

| Task | Command |
|------|---------|
| Logs | `docker compose -f docker-compose.prod.yml logs -f api` |
| Restart API | `docker compose -f docker-compose.prod.yml restart api` |
| Rebuild web (branding change) | `docker compose -f docker-compose.prod.yml --env-file .env up -d --build web` |
| DB backup | `docker compose -f docker-compose.prod.yml exec mysql mysqldump -u vendorqr -p vendor_qr_invoice > backup.sql` |
| Stop stack | `docker compose -f docker-compose.prod.yml down` |

**Rebuild web** after any `VITE_*` change — those values are baked in at build time.

---

## 9. Local development

Dev Redis only:

```bash
docker compose up -d
cd Server && npm run dev
cd Client && npm run dev
```

---

## 10. Troubleshooting

| Issue | Check |
|-------|--------|
| Login works locally but not in prod | `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`, `COOKIE_DOMAIN=.pinwardbarcode.in`, HTTPS on both hosts |
| CORS errors | `CLIENT_URL` is `https://www.pinwardbarcode.in`; `CORS_ORIGINS` includes `https://pinwardbarcode.in` |
| API 502 | `docker compose logs api`; MySQL/Redis health |
| Blank invoice logo | `VITE_COMPANY_LOGO_URL=/paranjape-logo.png`; rebuild `web` image |
| Health check fails | `curl http://127.0.0.1:5000/api/health` inside `api` container |

---

## File reference

| Path | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Production stack |
| `deploy/env/compose.env.example` | Root `.env` template |
| `deploy/env/api.env.example` | API container env template |
| `deploy/nginx/default.conf.template` | Gateway virtual hosts |
| `Server/Dockerfile` | API image |
| `Client/Dockerfile` | SPA build + nginx |
| `deploy/scripts/deploy.sh` | One-shot deploy helper |
