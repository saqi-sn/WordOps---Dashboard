<?php
// Shell wrapper for the `wo` CLI + input validators.
// Commands are built ONLY from validated domains + whitelisted flags.
// Never concatenate raw user strings into the command line.

// True when `wo` should be invoked via `sudo -n`. WO_SUDO enables it, but it is
// auto-skipped when PHP already runs as root (no point + avoids needing a root
// sudoers entry). Falls back to "use sudo" when the uid can't be determined.
function wo_need_sudo(): bool {
    if (!defined('WO_SUDO') || !WO_SUDO) return false;
    if (function_exists('posix_getuid')) return posix_getuid() !== 0;
    return true;
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
        'output' => trim(implode("\n", $lines)),
        'ok'     => $code === 0,
        'code'   => $code,
    ];
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

    return $args;
}

// Send a 400 with message + exit.
function reject(string $msg): void {
    http_response_code(400);
    echo json_encode(['error' => $msg]);
    exit;
}
