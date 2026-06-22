# WordOps GUI

A lightweight web admin panel for [WordOps](https://wordops.net).

- **Backend:** Pure PHP 8.x — no Composer, no frameworks (S3 via hand-rolled SigV4)
- **Frontend:** React + Vite — compiled locally, deployed as static files
- **Auth:** Single admin — login form, password hash in config, HMAC session token
- **Design:** Illustration style — bold borders, flat shadows, warm palette

## Install on a WordOps server

The frontend is prebuilt by CI into a release tarball laid out exactly as the site
webroot. The panel uses **query-string API routing** (`/api/index.php?p=/...`) and a
**hash-router** frontend, so it needs **no nginx edits** and nothing built on the server.

Requires WordOps on Ubuntu/Debian (systemd).

```bash
# 1. Create a PHP site for the panel (this configures nginx + PHP-FPM for you)
wo site create panel.example.com --php82 --le      # --le = Let's Encrypt SSL (DNS must point here)

# 2. Drop the prebuilt app into the webroot.
#    Run the whole pipe as root so tar can write; --no-overwrite-dir avoids a
#    "Cannot utime" error on the existing htdocs directory.
cd /var/www/panel.example.com/htdocs
rm -f index.html index.php                          # remove the WordOps placeholder
sudo sh -c 'wget -qO- https://github.com/saqi-sn/WordOps---Dashboard/releases/latest/download/wordops-gui.tar.gz | tar xz --no-overwrite-dir'

# 3. Run the installer (handles all privilege/security setup — see below)
sudo bash install.sh
```

Then open `https://panel.example.com`. **On first visit you create the admin
account** (username, password, email) right in the browser — no passwords to edit
by hand. Configure **S3 backups** anytime from the panel's **Settings** page.
Admin credentials and S3 settings live in `api/data/settings.json` (gitignored,
never shipped); `config.php` holds only paths.

### What `install.sh` does (security model)

`wo` and `/var/www` management need root, but Ubuntu's php-fpm refuses to run a pool as
root, and giving the shared `www-data` user `sudo wo` would let **any** website on the box
escalate to root. So the installer isolates the panel:

- creates a dedicated **non-root** user `wopanel` with its own php-fpm pool, serving only the panel;
- **scoped sudoers** — *only* `wopanel` may `sudo wo`; other sites cannot escalate;
- **ACLs** grant `wopanel` access to `/var/www` so the file manager works across all sites;
- disables systemd `ProtectSystem` for php-fpm so `wo` can write `/etc/nginx` (unix perms still apply);
- repoints the panel's nginx vhost to the `wopanel` pool, validates (`php-fpm -t`/`nginx -t`),
  and rolls back cleanly on any failure.

It falls back to a `sudo wo` rule scoped to `www-data` (with a security warning) only if the
dedicated pool can't be set up.

**Hardening:** the panel can act as root, so it's your highest-value target — use a strong
admin password, keep it HTTPS-only, and restrict access by IP/firewall where possible.

**Caveat:** the installer edits the panel's WordOps-managed vhost. If you run
`wo site update <panel-domain>` or a WordOps upgrade regenerates that vhost, re-run
`sudo bash install.sh` to restore the repoint.

### Upgrading

```bash
cd /var/www/panel.example.com/htdocs
sudo sh -c 'wget -qO- https://github.com/saqi-sn/WordOps---Dashboard/releases/latest/download/wordops-gui.tar.gz | tar xz --no-overwrite-dir'
sudo chown -R wopanel:www-data api          # keep new files owned by the panel pool
```
Your `api/config.php` is never shipped in the tarball, so it's preserved.

> Releases are produced by `.github/workflows/release.yml` on every `v*` tag:
> `git tag vX.Y.Z && git push --tags`.

## Run locally (development)

```bash
cd frontend
npm install
npm run dev        # Vite dev server; proxies /api to VITE_API_PROXY (default localhost:8080)
```

Point the dev proxy at a backend by copying `frontend/.env.example` to `.env.local` and
setting `VITE_API_PROXY` (a real WordOps server, or a local `php -S` running `backend/`).

Build the static bundle:
```bash
npm run build      # -> frontend/dist/
```

Backend has no build step or dependencies — it's vanilla PHP. To smoke-test it without a
WordOps box, run `php -S 127.0.0.1:8080 backend/index.php` with a test `backend/config.php`.

## Stack

| Layer | Tech | Where it runs |
|-------|------|---------------|
| Frontend | React + Vite | Your machine (build) → server (static files) |
| Backend | PHP 8.x | Server (PHP-FPM via WordOps) |
| Web server | Nginx | Server (managed by WordOps) |
| Commands | WordOps CLI (`wo`) | Server |

## Features

- Site list with status, PHP version, cache type, SSL info
- Site create (guarded) + delete (typed-confirm)
- Per-site backups: create, list, download, delete + manual push to S3 (S3-compatible)
- Jailed file manager under `/var/www` — browse, edit, upload, download, rename, delete
- Stack service status (Nginx, PHP, MySQL, Redis) with start/stop/restart controls
- Log viewer (Nginx, PHP, MySQL)
- System disk usage and uptime
