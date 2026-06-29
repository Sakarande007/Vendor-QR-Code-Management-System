# Domain setup: erpdigitalbarcode.in

Use this guide to point **GoDaddy DNS** at your Hostinger VPS and switch the app from `pinwardbarcode.in` to `erpdigitalbarcode.in`.

| URL | Purpose |
|-----|---------|
| `https://www.erpdigitalbarcode.in` | Vendor portal (React) |
| `https://api.erpdigitalbarcode.in` | API |
| `https://erpdigitalbarcode.in` | Redirects to www (via Caddy) |

Replace `YOUR_VPS_IP` with your server’s public IP (from Hostinger hPanel → VPS → IP address).

---

## 1. GoDaddy DNS records

In **GoDaddy → DNS Management → erpdigitalbarcode.in → DNS Records**, click **Add New Record** three times:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| **A** | `@` | `YOUR_VPS_IP` | 600 (or default) |
| **A** | `www` | `YOUR_VPS_IP` | 600 |
| **A** | `api` | `YOUR_VPS_IP` | 600 |

- **Name `@`** = apex `erpdigitalbarcode.in`
- Do **not** use CNAME for `@` on GoDaddy if you already have other records; A records are fine.

Wait 5–30 minutes, then verify on the VPS:

```bash
dig +short www.erpdigitalbarcode.in
dig +short api.erpdigitalbarcode.in
```

Both should return your VPS IP.

---

## 2. Update VPS `.env` (project root)

```bash
cd /var/www/vendorqr/Vendor-QR-Code-Management-System
nano .env
```

Set (or replace) these lines:

```env
FRONTEND_DOMAIN=www.erpdigitalbarcode.in erpdigitalbarcode.in
API_DOMAIN=api.erpdigitalbarcode.in
HTTP_PORT=8080

VITE_API_URL=https://api.erpdigitalbarcode.in
CLIENT_URL=https://www.erpdigitalbarcode.in
API_BASE_URL=https://api.erpdigitalbarcode.in
COOKIE_DOMAIN=.erpdigitalbarcode.in
COOKIE_SAME_SITE=none
COOKIE_SECURE=true
CORS_ORIGINS=https://erpdigitalbarcode.in
```

Keep your existing passwords and JWT secrets unchanged.

---

## 3. Update `deploy/env/api.env`

```bash
nano deploy/env/api.env
```

```env
CLIENT_URL=https://www.erpdigitalbarcode.in
API_BASE_URL=https://api.erpdigitalbarcode.in
COOKIE_DOMAIN=.erpdigitalbarcode.in
COOKIE_SAME_SITE=none
COOKIE_SECURE=true
```

---

## 4. Rebuild web + restart services

`VITE_API_URL` is baked into the frontend at build time:

```bash
cd /var/www/vendorqr/Vendor-QR-Code-Management-System
docker compose -f docker-compose.prod.yml --env-file .env up -d --build web
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate api gateway
```

---

## 5. Caddy HTTPS

```bash
cp /var/www/vendorqr/Vendor-QR-Code-Management-System/deploy/caddy/Caddyfile.example /etc/caddy/Caddyfile
systemctl reload caddy
systemctl status caddy
```

Test:

```bash
curl -s https://api.erpdigitalbarcode.in/api/health
curl -I https://www.erpdigitalbarcode.in
```

---

## 6. Troubleshooting

| Issue | Fix |
|-------|-----|
| Site not loading | DNS not propagated; check A records |
| Login fails on refresh | `COOKIE_DOMAIN=.erpdigitalbarcode.in`, HTTPS on both hosts |
| API calls wrong URL | Rebuild `web` after changing `VITE_API_URL` |
| SSL error | Caddy must be running; ports 80/443 open on VPS firewall |
