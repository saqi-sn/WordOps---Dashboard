<?php
// Copy to config.php and fill in real values. config.php is gitignored.

// --- Auth ---
define('ADMIN_USER', 'admin');
// Generate with: php -r "echo password_hash('your-password', PASSWORD_DEFAULT);"
define('ADMIN_PASS_HASH', '$2y$10$yaARh4gPCfGzHCSPPk76jOqMsswdHqP6pbrTt.1fwwVt5ZbI9aQyO');
define('SESSION_SECRET', '7090fa3922324d2bcfa0abc52ddd1e08e787b5811b6f1f2416c5a4f638df8d0a');  // openssl rand -hex 32
define('SESSION_TTL', 86400);                           // token lifetime, seconds

// --- WordOps ---
define('WO_BIN', '/usr/local/bin/wo');
// `wo` must run as root. When PHP-FPM runs as www-data (the WordOps default),
// the app calls it via `sudo -n wo` — install.sh adds the passwordless sudoers
// rule. Auto-skipped when PHP already runs as root, so this is safe either way.
define('WO_SUDO', true);
define('WEBROOT_BASE', '/var/www');     // sites + file manager jail + backups
define('LOG_LINES', 200);

// --- File manager ---
define('FM_ROOT', '/var/www');          // hard jail; nothing outside is reachable
define('FM_MAX_EDIT_BYTES', 2 * 1024 * 1024);   // 2 MB cap for read/edit-as-text
define('FM_MAX_UPLOAD_BYTES', 200 * 1024 * 1024);

// --- S3 (optional; leave S3_BUCKET empty to disable S3 features) ---
define('S3_ENDPOINT', 'https://s3.us-east-1.amazonaws.com'); // or B2/Wasabi/MinIO/Spaces host
define('S3_REGION',   'us-east-1');
define('S3_BUCKET',   '');              // '' disables S3 push UI
define('S3_KEY',      '');
define('S3_SECRET',   '');
define('S3_PREFIX',   'wordops-backups/');  // key prefix inside bucket
