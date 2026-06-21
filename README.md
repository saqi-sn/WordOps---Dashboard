# WordOps GUI

A lightweight web admin panel for [WordOps](https://wordops.net).

- **Backend:** Pure PHP 8.x — no Composer, no frameworks (S3 via hand-rolled SigV4)
- **Frontend:** React + Vite — compiled locally, deployed as static files
- **Auth:** Single admin — login form, password hash in config, HMAC session token
- **Design:** Illustration style — bold borders, flat shadows, warm palette

## Quick Start

See `CLAUDE.md` for the full spec Claude Code uses to build this.

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
