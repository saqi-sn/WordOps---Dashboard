#!/usr/bin/env bash
# OPTIONAL dev/rsync deploy. The recommended install is the prebuilt release tarball
# (see README) — wget + tar xz, nothing built on the server. Use this only when you
# want to push local changes straight to a box without cutting a release.
#
# Builds the frontend locally, rsyncs static files to the webroot + PHP API to /api.
# Needs ZERO nginx changes (query-string routing + hash router). config.php is never
# overwritten (excluded below).
#
# Usage:
#   SERVER=root@1.2.3.4 PANEL=panel.example.com ./deploy.sh
set -euo pipefail

SERVER="${SERVER:-user@your-server-ip}"
PANEL="${PANEL:-panel.yourdomain.com}"
WEBROOT="/var/www/${PANEL}/htdocs"

cd "$(dirname "$0")"

echo "==> Building frontend"
( cd frontend && npm install && npm run build )

echo "==> Deploying frontend → ${SERVER}:${WEBROOT}"
rsync -avz --delete \
  --exclude api \
  frontend/dist/ "${SERVER}:${WEBROOT}/"

echo "==> Deploying backend → ${SERVER}:${WEBROOT}/api"
# --exclude config.php: keep the server's real secrets untouched.
rsync -avz \
  --exclude config.php \
  backend/ "${SERVER}:${WEBROOT}/api/"

cat <<EOF

Deployed. No nginx changes needed.

First-time only, on the server:
  1) cp ${WEBROOT}/api/config.example.php ${WEBROOT}/api/config.php
     and fill in ADMIN_PASS_HASH / SESSION_SECRET / S3 / paths.
  2) Give PHP root privileges for wo + /var/www (pool user=root, or sudo wo).
     See README "Privileges".
EOF
