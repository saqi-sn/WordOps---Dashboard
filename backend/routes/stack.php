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

// Parse `wo stack status` lines like "Nginx is running" / "MariaDB is stopped".
function parse_stack_status(string $out): array {
    $services = [];
    foreach (preg_split('/\r?\n/', $out) as $line) {
        if (preg_match('/^(\w[\w\s.]+?)\s+is\s+(running|stopped)/i', trim($line), $m)) {
            $services[] = [
                'name'   => trim($m[1]),
                'status' => strtolower($m[2]),
            ];
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
