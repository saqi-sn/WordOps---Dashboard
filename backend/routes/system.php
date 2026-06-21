<?php
// Routes: /system*   (GET only)
//   GET /system/disk    -> parse `df -h /var/www`
//   GET /system/uptime  -> parse `uptime`

function system_out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// Parse `df -h {path}` -> { total, used, available, percent }.
// df output: header line, then "Filesystem Size Used Avail Use% Mounted on".
function parse_disk(string $out): array {
    $lines = preg_split('/\r?\n/', trim($out));
    $last  = trim((string) end($lines));
    $cols  = preg_split('/\s+/', $last);
    // cols: [filesystem, size, used, avail, use%, mounted]
    if (count($cols) < 5) {
        return ['total' => '', 'used' => '', 'available' => '', 'percent' => 0];
    }
    return [
        'total'     => $cols[1],
        'used'      => $cols[2],
        'available' => $cols[3],
        'percent'   => (int) rtrim($cols[4], '%'),
    ];
}

function handle_system(string $method, array $parts): void {
    if ($method !== 'GET') system_out(['error' => 'Method not allowed'], 405);

    switch ($parts[1] ?? '') {
        case 'disk':
            $r = sh_exec(['df', '-h', WEBROOT_BASE]);
            system_out(parse_disk($r['output']) + ['output' => $r['output']]);
            // no break needed: system_out exits
        case 'uptime':
            $r = sh_exec(['uptime']);
            $load = [];
            if (preg_match('/load average[s]?:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i', $r['output'], $m)) {
                $load = [(float) $m[1], (float) $m[2], (float) $m[3]];
            }
            system_out(['uptime' => $r['output'], 'load' => $load]);
        default:
            system_out(['error' => 'Not found'], 404);
    }
}
