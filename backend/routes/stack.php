<?php
// Routes: /stack*
//   GET  /stack/status                  -> wo stack status   (parsed services[])
//   POST /stack/{service}/restart       -> wo stack restart {service}
//   POST /stack/{service}/stop          -> wo stack stop {service}
//   POST /stack/{service}/start         -> wo stack start {service}
// Service taken from a whitelist ONLY.

const STACK_SERVICES = ['nginx', 'php', 'mysql', 'redis', 'memcache'];
const STACK_ACTIONS  = ['restart', 'stop', 'start'];

function stack_out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// Parse `wo stack status`. WordOps formats vary by version:
//   "nginx     :  Running"   (current: colon-separated, capitalized)
//   "Nginx is running"       (older)
// Lines like "UFW Firewall is disabled" are info, not a stack service -> skipped.
function parse_stack_status(string $out): array {
    $services = [];
    $norm = function (string $s): string {
        $s = strtolower($s);
        if (str_starts_with($s, 'run'))  return 'running';
        if (str_starts_with($s, 'stop')) return 'stopped';
        return 'unknown';
    };
    foreach (preg_split('/\r?\n/', $out) as $line) {
        $line = trim($line);
        if ($line === '') continue;
        // format A: "nginx :  Running"
        if (preg_match('/^([A-Za-z][\w.\-]*)\s*:\s*([A-Za-z]+)/', $line, $m)) {
            $services[] = ['name' => $m[1], 'status' => $norm($m[2])];
            continue;
        }
        // format B: "Nginx is running" (only accept running/stopped, so
        // "UFW Firewall is disabled" is ignored)
        if (preg_match('/^([A-Za-z][\w.\- ]*?)\s+is\s+(running|stopped)\b/i', $line, $m)) {
            $services[] = ['name' => trim($m[1]), 'status' => strtolower($m[2])];
        }
    }
    return $services;
}

function handle_stack(string $method, array $parts): void {
    // GET /stack/status
    if (($parts[1] ?? '') === 'status' && $method === 'GET') {
        $r = wo_exec(['stack', 'status']);
        $services = parse_stack_status($r['output']);
        if (!$r['ok'] && count($services) === 0) {
            stack_out(cmd_response($r, ['services' => []]), 500);
        }
        stack_out(['services' => $services, 'output' => $r['output']]);
    }

    // POST /stack/{service}/{action}
    $service = $parts[1] ?? '';
    $action  = $parts[2] ?? '';
    if ($method === 'POST' && in_array($action, STACK_ACTIONS, true)) {
        if (!in_array($service, STACK_SERVICES, true)) {
            stack_out(['error' => 'Invalid service'], 400);
        }
        $r = wo_exec(['stack', $action, $service]);
        stack_out(cmd_response($r), $r['ok'] ? 200 : 500);
    }

    stack_out(['error' => 'Not found'], 404);
}
