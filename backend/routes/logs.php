<?php
// Routes: /logs*   (GET only)
//   GET /logs/nginx/error      -> tail /var/log/nginx/error.log
//   GET /logs/nginx/access     -> tail /var/log/nginx/access.log
//   GET /logs/php              -> tail /var/log/php*.log
//   GET /logs/mysql            -> tail /var/log/mysql/error.log
// ?lines=200 (default LOG_LINES, max 1000). Log type from whitelist ONLY —
// file paths are constants, never built from raw input.

function logs_out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// Whitelist key -> list of source files. 'php' globs at request time.
function logs_sources(string $key): ?array {
    switch ($key) {
        case 'nginx/error':  return ['/var/log/nginx/error.log'];
        case 'nginx/access': return ['/var/log/nginx/access.log'];
        case 'mysql':        return ['/var/log/mysql/error.log'];
        case 'php':          return glob('/var/log/php*.log') ?: [];
        default:             return null;
    }
}

function handle_logs(string $method, array $parts): void {
    if ($method !== 'GET') logs_out(['error' => 'Method not allowed'], 405);

    $key = implode('/', array_slice($parts, 1));   // 'nginx/error' | 'php' | 'mysql'
    $files = logs_sources($key);
    if ($files === null) logs_out(['error' => 'Unknown log type'], 404);

    $lines = (int) ($_GET['lines'] ?? LOG_LINES);
    if ($lines < 1) $lines = LOG_LINES;
    if ($lines > 1000) $lines = 1000;

    $chunks = [];
    foreach ($files as $f) {
        if (!is_file($f)) continue;
        $r = sh_exec(['tail', '-n', (string) $lines, $f]);
        if (count($files) > 1) $chunks[] = "==> $f <==\n" . $r['output'];
        else $chunks[] = $r['output'];
    }

    logs_out([
        'type'    => $key,
        'lines'   => $lines,
        'content' => implode("\n\n", $chunks),
    ]);
}
