<?php
// Writable settings store (api/data/settings.json) for values set via the UI:
// the admin account (created on first run) + S3 config. config.php holds only
// static paths. Constants in config.php (if present) act as fallback so older
// installs keep working until first-run setup writes the store.

function settings_file(): string {
    return __DIR__ . '/data/settings.json';
}

function settings_load(): array {
    $f = settings_file();
    if (!is_file($f)) return [];
    $d = json_decode((string) @file_get_contents($f), true);
    return is_array($d) ? $d : [];
}

function settings_save(array $s): bool {
    $dir = dirname(settings_file());
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $ok = @file_put_contents(settings_file(), json_encode($s, JSON_PRETTY_PRINT), LOCK_EX) !== false;
    @chmod(settings_file(), 0640);   // contains the password hash + S3 secret
    return $ok;
}

function setting(string $key, $default = null) {
    $s = settings_load();
    return $s[$key] ?? $default;
}

function setting_put(array $patch): bool {
    return settings_save(array_merge(settings_load(), $patch));
}

// --- admin account ---
function admin_user(): string {
    $u = setting('admin_user');
    if ($u) return $u;
    return defined('ADMIN_USER') ? ADMIN_USER : 'admin';
}

function admin_hash(): string {
    $h = setting('admin_pass_hash');
    if ($h) return $h;
    if (defined('ADMIN_PASS_HASH') && ADMIN_PASS_HASH !== '' && !str_contains(ADMIN_PASS_HASH, 'replace')) {
        return ADMIN_PASS_HASH;
    }
    return '';
}

function session_secret(): string {
    $s = setting('session_secret');
    if ($s) return $s;
    if (defined('SESSION_SECRET') && SESSION_SECRET !== '' && !str_contains(SESSION_SECRET, 'change')) {
        return SESSION_SECRET;
    }
    return '';
}

// Panel is "set up" once an admin password hash exists (store or config).
function is_setup_complete(): bool {
    return admin_hash() !== '';
}

// --- S3 config (store first, then config.php constants) ---
function s3_cfg(string $key, string $default = ''): string {
    $v = setting('s3_' . $key);
    if ($v !== null && $v !== '') return (string) $v;
    $const = 'S3_' . strtoupper($key);
    if (defined($const)) return (string) constant($const);
    return $default;
}

function s3_enabled(): bool {
    return s3_cfg('bucket') !== '';
}
