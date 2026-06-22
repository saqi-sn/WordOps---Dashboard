<?php
// Shell wrapper for the `wo` CLI + input validators.
// Commands are built ONLY from validated domains + whitelisted flags.
// Never concatenate raw user strings into the command line.

// True when `wo` should be invoked via `sudo -n`.
// Default ON: on WordOps boxes `wo` reliably runs only via sudo (it sets up the
// root env `wo` expects), and `sudo -n` works for root too (root sudo needs no
// password). Only skip when explicitly disabled with `define('WO_SUDO', false)`.
// This means an older config.php (no WO_SUDO line) still gets the sudo path.
function wo_need_sudo(): bool {
    return !(defined('WO_SUDO') && WO_SUDO === false);
}

// Run a `wo` subcommand. $args is an array of already-safe tokens
// (validated domain, whitelisted flags). Each is shell-escaped here.
// `wo` needs root: when PHP runs as www-data this prepends `sudo -n` (see WO_SUDO).
// Returns [ 'output' => string, 'ok' => bool, 'code' => int ].
function wo_exec(array $args): array {
    $parts = [];
    if (wo_need_sudo()) { $parts[] = 'sudo'; $parts[] = '-n'; }
    $parts[] = WO_BIN;
    foreach ($args as $a) $parts[] = (string) $a;
    return sh_exec($parts);
}

// Strip ANSI/VT100 escape sequences (colors, cursor moves). WordOps colorizes its
// output even when not on a TTY, which otherwise breaks table/line parsing and
// shows up as garbage like "[94m..." in the UI.
function strip_ansi(string $s): string {
    // CSI sequences (incl. SGR colors) + standalone ESC chars + carriage returns.
    $s = preg_replace('/\x1b\[[0-9;?]*[ -\/]*[@-~]/', '', $s);
    $s = str_replace(["\x1b", "\r"], '', $s);
    return $s;
}

// Fire a `wo` subcommand in the background and return immediately. Used for
// commands that restart Nginx (e.g. `wo clean`) — since the panel is served by
// that same Nginx, a foreground run would drop our own HTTP request mid-flight
// (the browser shows a "network error" even though the command succeeds).
function wo_exec_detached(array $args): void {
    $parts = [];
    if (wo_need_sudo()) { $parts[] = 'sudo'; $parts[] = '-n'; }
    $parts[] = WO_BIN;
    foreach ($args as $a) $parts[] = (string) $a;
    $cmd = '';
    foreach ($parts as $p) $cmd .= escapeshellarg($p) . ' ';
    exec('nohup ' . $cmd . ' >/dev/null 2>&1 &');
}

// Run an arbitrary non-`wo` command (tail, df, uptime). $args is an array of
// already-safe tokens; each is shell-escaped here. Same shape as wo_exec().
// Used by stack/logs/system routes. Never pass raw user strings.
function sh_exec(array $args): array {
    $parts = [];
    foreach ($args as $a) $parts[] = escapeshellarg((string) $a);
    $full = implode(' ', $parts) . ' 2>&1';
    $code = 0;
    $lines = [];
    exec($full, $lines, $code);
    return [
        'output' => trim(strip_ansi(implode("\n", $lines))),
        'ok'     => $code === 0,
        'code'   => $code,
    ];
}

// Build a consistent JSON body from a command result. On failure attaches a
// human-readable `error` (the command's own output, or an exit-code fallback)
// so the frontend can surface exactly what `wo` reported.
function cmd_response(array $r, array $extra = []): array {
    $body = $extra + ['ok' => $r['ok'], 'output' => $r['output']];
    if (!$r['ok']) {
        $body['error'] = $r['output'] !== ''
            ? $r['output']
            : 'Command failed (exit code ' . ($r['code'] ?? -1) . ')';
    }
    return $body;
}

// Validate a domain. Sends 400 + exits on bad input. Returns clean domain.
function validate_domain(string $domain): string {
    $domain = trim($domain);
    if ($domain === ''
        || strlen($domain) > 253
        || !preg_match('/^[a-zA-Z0-9.\-]+$/', $domain)
        || str_contains($domain, '..')
        || $domain[0] === '.' || $domain[0] === '-'
        || str_ends_with($domain, '.') || str_ends_with($domain, '-')) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid domain']);
        exit;
    }
    return $domain;
}

// Validate a proxy target "host:port" for --proxy. Returns clean target or null.
function valid_proxy_target(string $t): ?string {
    $t = trim($t);
    if (!preg_match('/^([a-zA-Z0-9.\-]+):(\d{1,5})$/', $t, $m)) return null;
    if (str_contains($m[1], '..')) return null;
    $port = (int) $m[2];
    if ($port < 1 || $port > 65535) return null;
    return $m[1] . ':' . $port;
}

// Build the `wo site create` argument array from a request body.
// Whitelist ONLY. On any invalid value: send 400 + exit.
// Returns array of tokens, e.g. ['site','create','x.com','--wp','--wpfc','--php82','--le'].
function build_create_args(array $body): array {
    $domain = validate_domain((string) ($body['domain'] ?? ''));
    $type   = (string) ($body['type']  ?? 'wp');
    $cache  = (string) ($body['cache'] ?? 'none');
    $php    = (string) ($body['php']   ?? '');
    $ssl    = !empty($body['ssl']);

    $args = ['site', 'create', $domain];

    // --- type ---
    $typeFlags = ['wp' => '--wp', 'html' => '--html', 'php' => '--php'];
    if ($type === 'proxy') {
        $target = valid_proxy_target((string) ($body['proxyTarget'] ?? ''));
        if ($target === null) reject('Invalid proxy target (expected host:port)');
        $args[] = '--proxy=' . $target;
    } elseif (isset($typeFlags[$type])) {
        $args[] = $typeFlags[$type];
    } else {
        reject('Invalid site type');
    }

    // --- cache (wp only) ---
    $cacheFlags = ['fastcgi' => '--wpfc', 'redis' => '--wpredis', 'none' => null];
    if (!array_key_exists($cache, $cacheFlags)) reject('Invalid cache type');
    if ($cacheFlags[$cache] !== null) {
        if ($type !== 'wp') reject('Cache only valid for wp sites');
        $args[] = $cacheFlags[$cache];
    }

    // --- php version ---
    $phpVersions = ['74', '80', '81', '82', '83'];
    if ($php !== '') {
        if (!in_array($php, $phpVersions, true)) reject('Invalid PHP version');
        // proxy sites take no php version flag
        if ($type === 'proxy') reject('PHP version not valid for proxy sites');
        $args[] = '--php' . $php;
    }

    // --- ssl ---
    if ($ssl) $args[] = '--le';

    // --- optional WP admin credentials (wp sites only) ---
    // If omitted, WordOps uses its default (system user + generated password),
    // which we surface from the create output afterwards.
    if ($type === 'wp') {
        $user  = trim((string) ($body['wp_user']  ?? ''));
        $pass  = (string) ($body['wp_pass']  ?? '');
        $email = trim((string) ($body['wp_email'] ?? ''));
        if ($user !== '') {
            if (!preg_match('/^[a-zA-Z0-9._@-]{1,60}$/', $user)) reject('Invalid WP username');
            $args[] = '--user=' . $user;
        }
        if ($pass !== '') {
            // wo_exec escapes args, so any char is shell-safe; just bound length + no control chars
            if (strlen($pass) > 100 || preg_match('/[\x00-\x1f]/', $pass)) reject('Invalid WP password');
            $args[] = '--pass=' . $pass;
        }
        if ($email !== '') {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) reject('Invalid WP email');
            $args[] = '--email=' . $email;
        }
    }

    return $args;
}

// Pull WordPress admin user/password out of `wo site create` output, if present.
// Lines look like "WordPress admin user : saqi" / "WordPress admin password : ...".
function parse_wp_credentials(string $out): array {
    $creds = [];
    if (preg_match('/WordPress admin user\s*:\s*(.+)/i', $out, $m))     $creds['wp_user'] = trim($m[1]);
    if (preg_match('/WordPress admin password\s*:\s*(.+)/i', $out, $m)) $creds['wp_pass'] = trim($m[1]);
    return $creds;
}

// Send a 400 with message + exit.
function reject(string $msg): void {
    http_response_code(400);
    echo json_encode(['error' => $msg]);
    exit;
}
