<?php
// Routes: /sites*
//   GET    /sites                          -> wo site list   (parsed table)
//   GET    /sites/{domain}/info            -> wo site info {domain}
//   POST   /sites                          -> wo site create {domain} {whitelisted flags}
//   DELETE /sites/{domain}                 -> wo site delete {domain} --no-prompt
//   POST   /sites/{domain}/enable          -> wo site enable {domain}
//   POST   /sites/{domain}/disable         -> wo site disable {domain}
//   POST   /sites/{domain}/cache/purge     -> wo site update {domain} --purge-cache

// Emit JSON + exit.
function sites_out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// Parse `wo site list` output into Site[].
// Handles the bordered ASCII table (header-mapped, order-independent); falls
// back to plain one-domain-per-line output. ssl is not in list output -> false.
function parse_site_list(string $out): array {
    $lines = preg_split('/\r?\n/', $out);
    $rows = [];
    $header = null;

    foreach ($lines as $line) {
        $t = trim($line);
        if ($t === '' || $t[0] === '+') continue;          // skip blanks + separators
        if (!str_contains($t, '|')) {
            // plain-list fallback: a bare domain token
            if (preg_match('/^[a-zA-Z0-9.\-]+$/', $t)) {
                $rows[] = ['domain' => $t, 'type' => '', 'php' => '', 'cache' => '', 'ssl' => false, 'status' => 'enabled'];
            }
            continue;
        }
        // split a table row "| a | b | c |" into trimmed cells
        $cells = array_map('trim', explode('|', trim($t, '| ')));
        if ($header === null) {
            $header = array_map(fn($h) => strtolower($h), $cells);
            continue;
        }
        $row = [];
        foreach ($cells as $i => $v) $row[$header[$i] ?? $i] = $v;
        $status = strtolower($row['status'] ?? '');
        $rows[] = [
            'domain' => $row['site'] ?? ($row['domain'] ?? ''),
            'type'   => $row['type'] ?? '',
            'php'    => $row['php'] ?? '',
            'cache'  => $row['cache'] ?? '',
            'ssl'    => false,
            'status' => str_starts_with($status, 'enable') ? 'enabled' : 'disabled',
        ];
    }
    return array_values(array_filter($rows, fn($r) => $r['domain'] !== ''));
}

// Parse `wo site info {domain}` key:value lines into a map.
function parse_site_info(string $out): array {
    $info = [];
    foreach (preg_split('/\r?\n/', $out) as $line) {
        if (!str_contains($line, ':')) continue;
        [$k, $v] = explode(':', $line, 2);
        $k = trim($k);
        if ($k !== '') $info[$k] = trim($v);
    }
    return $info;
}

function handle_sites(string $method, array $parts): void {
    $domain = $parts[1] ?? '';
    $sub    = $parts[2] ?? '';

    // collection-level: /sites
    if ($domain === '') {
        if ($method === 'GET') {
            $r = wo_exec(['site', 'list']);
            sites_out(['sites' => parse_site_list($r['output']), 'output' => $r['output']]);
        }
        if ($method === 'POST') {
            $body = json_decode((string) file_get_contents('php://input'), true) ?? [];
            $args = build_create_args($body);            // validates + 400s on bad input
            $r = wo_exec($args);
            $ok = $r['ok'] || str_contains($r['output'], 'Successfully created site');
            sites_out(['ok' => $ok, 'output' => $r['output']], $ok ? 200 : 500);
        }
        sites_out(['error' => 'Method not allowed'], 405);
    }

    // item-level: domain required + validated
    $domain = validate_domain($domain);

    // DELETE /sites/{domain}
    if ($sub === '' && $method === 'DELETE') {
        $r = wo_exec(['site', 'delete', $domain, '--no-prompt']);
        sites_out(['ok' => $r['ok'], 'output' => $r['output']], $r['ok'] ? 200 : 500);
    }

    // GET /sites/{domain}/info
    if ($sub === 'info' && $method === 'GET') {
        $r = wo_exec(['site', 'info', $domain]);
        sites_out(['info' => parse_site_info($r['output']), 'output' => $r['output']], $r['ok'] ? 200 : 500);
    }

    // POST /sites/{domain}/enable
    if ($sub === 'enable' && $method === 'POST') {
        $r = wo_exec(['site', 'enable', $domain]);
        sites_out(['ok' => $r['ok'], 'output' => $r['output']], $r['ok'] ? 200 : 500);
    }

    // POST /sites/{domain}/disable
    if ($sub === 'disable' && $method === 'POST') {
        $r = wo_exec(['site', 'disable', $domain]);
        sites_out(['ok' => $r['ok'], 'output' => $r['output']], $r['ok'] ? 200 : 500);
    }

    // POST /sites/{domain}/cache/purge
    if ($sub === 'cache' && ($parts[3] ?? '') === 'purge' && $method === 'POST') {
        $r = wo_exec(['site', 'update', $domain, '--purge-cache']);
        sites_out(['ok' => $r['ok'], 'output' => $r['output']], $r['ok'] ? 200 : 500);
    }

    sites_out(['error' => 'Not found'], 404);
}
