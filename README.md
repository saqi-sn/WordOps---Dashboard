# WordOps GUI

A lightweight web admin panel for [WordOps](https://wordops.net).

- **Backend:** Pure PHP 8.x — no Composer, no frameworks (S3 via hand-rolled SigV4)
- **Frontend:** React + Vite — compiled locally, deployed as static files
- **Auth:** Single admin — login form, password hash in config, HMAC session token
- **Design:** Illustration style — bold borders, flat shadows, warm palette

## Install (no git, no build, no installs on the server)

The frontend is prebuilt by CI into a release tarball laid out exactly as the site
webroot. The panel uses **query-string API routing** (`/api/index.php?p=/...`) and a
**hash-router** frontend, so it needs **zero nginx changes** on a default WordOps PHP site.

```bash
# 1. Create a PHP site on WordOps (this configures nginx + PHP-FPM for you)
wo site create panel.example.com --php82

# 2. Drop the prebuilt app into the webroot
cd /var/www/panel.example.com/htdocs
rm -f index.html index.php            # remove the WordOps placeholder
wget -qO- https://github.com/saqi-sn/WordOps---Dashboard/releases/latest/download/wordops-gui.tar.gz | tar xz
# now: htdocs/index.html, htdocs/assets/, htdocs/api/*.php

# 3. Create the config (the only manual step — it holds your secrets)
cp api/config.example.php api/config.php
php -r "echo password_hash('YOUR_PASSWORD', PASSWORD_DEFAULT), PHP_EOL;"   # -> ADMIN_PASS_HASH
openssl rand -hex 32                                                       # -> SESSION_SECRET
nano api/config.php
```

### Privileges (required once)

`wo` and `/var/www` file ops run as root, but a WordOps PHP-site pool runs unprivileged.
Pick one:

- **Pool as root** — set `user = root` / `group = root` in
  `/etc/php/8.x/fpm/pool.d/panel.example.com.conf`, then `wo stack restart php`.
- **Passwordless sudo for wo** — add a sudoers rule for the `wo` binary only and set
  `WO_BIN` in `config.php` to `sudo /usr/local/bin/wo` (file-manager writes still need a
  root-capable pool).

Then open `https://panel.example.com` and log in. Done — no nginx edits, nothing built or
installed on the server.

> Releases are produced by `.github/workflows/release.yml` on every `v*` tag. To cut one:
> `git tag v0.1.0 && git push --tags`.

See `CLAUDE.md` for the full spec.

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
