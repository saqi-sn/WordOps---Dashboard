#!/usr/bin/env bash
# WordOps GUI — server installer.
#
# Run as root from the panel's htdocs AFTER extracting the release tarball:
#
#   cd /var/www/<panel-domain>/htdocs
#   sudo bash install.sh
#
# It performs the one-time root steps the panel needs so it works with ANY PHP
# version, whether PHP-FPM runs as www-data or as root — no nginx/pool edits:
#   1. passwordless sudoers rule so the web user can run `wo` as root
#   2. add the web user to `adm` so the Logs page can read /var/log/*
#   3. ensure /root/.gitconfig exists (WordOps needs it when run as root)
#   4. create api/config.php from the template if missing
#   5. fix webroot ownership
# The only manual step left is editing api/config.php (admin password + secret).
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "ERROR: run as root —  sudo bash install.sh"; exit 1; }

HTDOCS="$(pwd)"
API="$HTDOCS/api"
[ -f "$API/index.php" ] || { echo "ERROR: run this from the panel htdocs (api/index.php not found here)"; exit 1; }

# locate the wo binary
WO_BIN="$(command -v wo 2>/dev/null || true)"
[ -n "$WO_BIN" ] || WO_BIN="/usr/local/bin/wo"
[ -x "$WO_BIN" ] || { echo "ERROR: wo not found at $WO_BIN — is WordOps installed?"; exit 1; }

# web user: override with WEB_USER=... ; default to the WordOps default
WEB_USER="${WEB_USER:-www-data}"
id "$WEB_USER" >/dev/null 2>&1 || { echo "ERROR: user '$WEB_USER' does not exist (set WEB_USER=...)"; exit 1; }

echo ">> web user:  $WEB_USER"
echo ">> wo binary: $WO_BIN"
echo ">> htdocs:    $HTDOCS"

# 1. passwordless sudo for wo only
SUDOERS="/etc/sudoers.d/wordops-gui"
printf '%s ALL=(root) NOPASSWD: %s\n' "$WEB_USER" "$WO_BIN" > "$SUDOERS"
chmod 440 "$SUDOERS"
visudo -cf "$SUDOERS" >/dev/null && echo ">> [1/6] sudoers rule installed: $SUDOERS"

# 2. log read access (nginx/mysql logs are group adm)
usermod -aG adm "$WEB_USER" && echo ">> [2/6] $WEB_USER added to group adm (log access)"

# 3. wo copies ~/.gitconfig to /root/.gitconfig when run as root; make sure it exists
if [ ! -f /root/.gitconfig ]; then
  git config --global user.email "admin@$(hostname -f 2>/dev/null || echo localhost)" || true
  git config --global user.name  "WordOps GUI" || true
fi
echo ">> [3/6] /root/.gitconfig present"

# 4. WordOps hardens php-fpm with systemd ProtectSystem=full, which mounts /etc
# read-only for php-fpm AND every process it spawns (including `sudo wo`). That
# makes `wo site create` fail with "Read-only file system: /etc/nginx/...".
# Re-grant /etc as writable for the php-fpm service(s). Unix perms still apply —
# only the panel's root pool can write /etc; www-data sites remain blocked.
DROPIN_DONE=0
for unit in $(systemctl list-unit-files --no-legend 'php*-fpm.service' 2>/dev/null | awk '{print $1}'); do
  d="/etc/systemd/system/${unit}.d"
  mkdir -p "$d"
  printf '[Service]\nReadWritePaths=/etc\n' > "$d/wordops-gui.conf"
  DROPIN_DONE=1
done
if [ "$DROPIN_DONE" -eq 1 ]; then
  systemctl daemon-reload
  echo ">> [4/6] php-fpm ReadWritePaths=/etc drop-in installed (lets wo write nginx config)"
else
  echo ">> [4/6] WARN: no php*-fpm.service found — skipped ProtectSystem fix"
fi

# 5. config.php from template
if [ ! -f "$API/config.php" ]; then
  cp "$API/config.example.php" "$API/config.php"
  echo ">> [5/6] created api/config.php from template"
else
  echo ">> [5/6] api/config.php already exists — left untouched"
fi

# 6. ownership
chown -R "$WEB_USER:$WEB_USER" "$HTDOCS"
echo ">> [6/6] ownership set to $WEB_USER"

# restart PHP-FPM so group membership + the drop-in take effect, then sanity-check
"$WO_BIN" stack restart php >/dev/null 2>&1 || systemctl restart 'php*-fpm.service' >/dev/null 2>&1 || true
if sudo -u "$WEB_USER" sudo -n "$WO_BIN" --version >/dev/null 2>&1; then
  echo ">> verify: '$WEB_USER' can run 'sudo wo' — OK"
else
  echo ">> WARN: 'sudo -n wo' test as $WEB_USER failed — check $SUDOERS"
fi

cat <<EOF

Done. Final manual step — edit the config:

  sudo nano $API/config.php

Set:
  ADMIN_PASS_HASH  ->  $WO_BIN ... or:  php -r "echo password_hash('YOUR_PASS', PASSWORD_DEFAULT);"
  SESSION_SECRET   ->  openssl rand -hex 32

Then open the panel in your browser and log in.
EOF
