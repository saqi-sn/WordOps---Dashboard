<?php
// Copy to config.php. Holds only static paths — NO secrets.
// The admin account and S3 settings are created/changed from the panel UI
// (first-run setup + Settings page) and stored in api/data/settings.json.

// --- WordOps ---
define('WO_BIN', '/usr/local/bin/wo');
// `wo` must run as root. When PHP-FPM runs as a non-root pool (the secure default
// set up by install.sh), the app calls it via `sudo -n wo`. Auto-skipped when PHP
// already runs as root. Set to false only if your pool runs wo directly.
define('WO_SUDO', true);
define('WEBROOT_BASE', '/var/www');     // sites + file manager jail + backups
define('LOG_LINES', 200);

// --- File manager ---
define('FM_ROOT', '/var/www');          // hard jail; nothing outside is reachable
define('FM_MAX_EDIT_BYTES', 2 * 1024 * 1024);   // 2 MB cap for read/edit-as-text
define('FM_MAX_UPLOAD_BYTES', 200 * 1024 * 1024);
