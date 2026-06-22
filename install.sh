#!/usr/bin/env bash
# WordOps GUI — server installer (secure by default).
#
#   cd /var/www/<panel-domain>/htdocs
#   sudo bash install.sh
#
# SECURITY MODEL
# --------------
# `wo` and /var/www management need root. Rather than letting the shared
# `www-data` user run `sudo wo` (which would let ANY compromised website on the
# box escalate to root), this installer gives the panel its OWN php-fpm pool that
# runs as root, on its own socket, serving ONLY this panel. No sudoers rule is
# created, so other websites gain nothing. The panel itself is login-gated.
#
# If it can't set up the dedicated pool (unexpected nginx layout), it falls back
# to a `sudo wo` rule scoped to the web user and prints a security warning.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "ERROR: run as root —  sudo bash install.sh"; exit 1; }

HTDOCS="$(pwd)"
API="$HTDOCS/api"
[ -f "$API/index.php" ] || { echo "ERROR: run from the panel htdocs (api/index.php not found)"; exit 1; }

WO_BIN="$(command -v wo 2>/dev/null || true)"; [ -n "$WO_BIN" ] || WO_BIN="/usr/local/bin/wo"
[ -x "$WO_BIN" ] || { echo "ERROR: wo not found at $WO_BIN — is WordOps installed?"; exit 1; }

PANEL_DOMAIN="$(basename "$(dirname "$HTDOCS")")"
SITE_CONF="/etc/nginx/sites-available/$PANEL_DOMAIN"
echo ">> panel domain: $PANEL_DOMAIN"
echo ">> htdocs:       $HTDOCS"
echo ">> wo binary:    $WO_BIN"

# --- helpers ------------------------------------------------------------------

set_config() {  # set_config KEY phpValue   (KEY without quotes; value is raw PHP)
  local key="$1" val="$2"
  if grep -q "define('$key'" "$API/config.php"; then
    sed -i "s/.*define('$key'.*/define('$key', $val);/" "$API/config.php"
  else
    sed -i "/define('WO_BIN'/a define('$key', $val);" "$API/config.php"
  fi
}

ensure_gitconfig() {
  if [ ! -f /root/.gitconfig ]; then
    git config --global user.email "admin@$(hostname -f 2>/dev/null || echo localhost)" || true
    git config --global user.name  "WordOps GUI" || true
  fi
}

# Re-grant /etc as writable for php-fpm: WordOps ships ProtectSystem=full, which
# mounts /etc read-only for php-fpm and every child (incl. wo), breaking
# `wo site create`. Unix perms still apply (only the root pool can write /etc).
fix_protectsystem() {
  local svc="$1" d
  d="/etc/systemd/system/${svc}.d"
  mkdir -p "$d"
  printf '[Service]\nReadWritePaths=/etc\n' > "$d/wordops-gui.conf"
  systemctl daemon-reload
}

# --- common setup -------------------------------------------------------------

ensure_gitconfig
if [ ! -f "$API/config.php" ]; then
  cp "$API/config.example.php" "$API/config.php"
  echo ">> created api/config.php from template"
fi

# --- secure path: dedicated root pool ----------------------------------------

setup_dedicated_pool() {
  local phpnn dotver pooldir fpmsvc sock pool upstream
  phpnn="$(grep -oE 'common/php[0-9]+\.conf' "$SITE_CONF" 2>/dev/null | grep -oE '[0-9]+' | head -1)"
  if [ -n "$phpnn" ]; then
    dotver="${phpnn%?}.${phpnn#?}"               # 83 -> 8.3, 74 -> 7.4
  else
    # site conf hand-edited (no common/phpNN include) -> use newest installed php-fpm
    dotver="$(ls -d /etc/php/*/fpm 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | sort -V | tail -1)"
  fi
  [ -n "$dotver" ] || return 1
  pooldir="/etc/php/$dotver/fpm/pool.d"
  fpmsvc="php$dotver-fpm"
  [ -d "$pooldir" ] || return 1
  sock="/var/run/php/wordops-gui-fpm.sock"
  pool="$pooldir/wordops-gui.conf"
  upstream="/etc/nginx/conf.d/wordops-gui-upstream.conf"

  # 1. dedicated root pool (clean minimal conf — no open_basedir/disable_functions)
  cat > "$pool" <<EOF
; WordOps GUI — dedicated pool, runs as root, serves ONLY the panel.
[wordops-gui]
user = root
group = root
listen = $sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660
pm = ondemand
pm.max_children = 10
pm.process_idle_timeout = 10s
pm.max_requests = 500
chdir = /
security.limit_extensions = .php
EOF

  # 2. nginx upstream -> that socket
  printf 'upstream wordopsgui {\n    server unix:%s;\n}\n' "$sock" > "$upstream"

  # 3. point ONLY this site's PHP at the panel pool (idempotent)
  if ! grep -q 'wordopsgui' "$SITE_CONF"; then
    cp "$SITE_CONF" "$SITE_CONF.wogui.bak"
    sed -i 's#[[:space:]]*include common/php[0-9]\+\.conf;#    location / {\n        try_files $uri $uri/ /index.php$is_args$args;\n    }\n    location ~ \\.php$ {\n        try_files $uri =404;\n        include fastcgi_params;\n        fastcgi_pass wordopsgui;\n    }#' "$SITE_CONF"
  fi

  # 4. ProtectSystem fix for this fpm service
  fix_protectsystem "$fpmsvc"

  # 5. panel runs as root pool -> no sudo, no sudoers rule
  set_config WO_SUDO false
  rm -f /etc/sudoers.d/wordops-gui

  # 6. ownership (nginx serves static as www-data; root pool writes regardless)
  chown -R www-data:www-data "$HTDOCS"

  # 7. apply — validate everything BEFORE touching the running service, and roll
  #    back cleanly on any failure so php-fpm is never left with a broken pool.
  rollback() {
    echo ">> $1 — rolling back dedicated-pool changes"
    rm -f "$pool" "$upstream"
    [ -f "$SITE_CONF.wogui.bak" ] && mv "$SITE_CONF.wogui.bak" "$SITE_CONF"
    systemctl reload nginx >/dev/null 2>&1 || true
  }
  if ! php-fpm"$dotver" -t >/dev/null 2>&1 && ! "php-fpm$dotver" -t >/dev/null 2>&1; then
    rollback "php-fpm config test failed"; return 1
  fi
  if ! nginx -t >/dev/null 2>&1; then
    rollback "nginx -t failed"; return 1
  fi
  if ! systemctl restart "$fpmsvc"; then
    rollback "php-fpm failed to start"; return 1
  fi
  systemctl reload nginx
  [ -S "$sock" ] || { rollback "panel socket $sock not created"; return 1; }

  echo ""
  echo ">> SECURE install complete — dedicated ROOT pool 'wordops-gui' on $sock"
  echo ">> php service: $fpmsvc   |   no sudoers rule created (other sites can't escalate)"
  return 0
}

# --- fallback: sudo wo for the web user (less isolated) -----------------------

setup_sudo_fallback() {
  local web="${WEB_USER:-www-data}"
  id "$web" >/dev/null 2>&1 || { echo "ERROR: user '$web' missing (set WEB_USER=...)"; exit 1; }
  local sudoers="/etc/sudoers.d/wordops-gui"
  printf '%s ALL=(root) NOPASSWD: %s\n' "$web" "$WO_BIN" > "$sudoers"
  chmod 440 "$sudoers"; visudo -cf "$sudoers" >/dev/null
  usermod -aG adm "$web" || true
  set_config WO_SUDO true
  # ProtectSystem fix across all php-fpm services
  for unit in $(systemctl list-unit-files --no-legend 'php*-fpm.service' 2>/dev/null | awk '{print $1}'); do
    fix_protectsystem "$unit"
  done
  chown -R "$web:$web" "$HTDOCS"
  "$WO_BIN" stack restart php >/dev/null 2>&1 || systemctl restart 'php*-fpm.service' >/dev/null 2>&1 || true
  echo ""
  echo ">> FALLBACK install complete — '$web' may run 'sudo wo'."
  echo ">> SECURITY WARNING: any process running as '$web' (i.e. every website on"
  echo ">> this server) can now run 'sudo wo' and escalate to root. Prefer the"
  echo ">> dedicated-pool path: ensure $SITE_CONF includes common/phpNN.conf and re-run."
}

# --- run ----------------------------------------------------------------------

if [ -f "$SITE_CONF" ] && setup_dedicated_pool; then
  :
else
  echo ">> dedicated-pool setup not possible — using sudo fallback"
  setup_sudo_fallback
fi

cat <<EOF

Final manual step — set the admin login + secret:

  sudo nano $API/config.php
    ADMIN_PASS_HASH  ->  php -r "echo password_hash('YOUR_PASS', PASSWORD_DEFAULT);"
    SESSION_SECRET   ->  openssl rand -hex 32

Then open https://$PANEL_DOMAIN and log in.
EOF
