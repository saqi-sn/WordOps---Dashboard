<?php
// Front controller / router.
// Public:  POST /api/auth/login.  Everything else requires a valid session token.
// Route files live in routes/<name>.php and each defines handle_<name>($method, $parts),
// where $parts is the path split on '/' (after stripping the /api prefix).

require __DIR__ . '/config.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/wo.php';
// s3.php is optional until A8 lands; include when present.
if (is_file(__DIR__ . '/s3.php')) require __DIR__ . '/s3.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

// --- parse path: strip /api, trim slashes, split ---
$uri   = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri   = preg_replace('#^/api(?=/|$)#', '', $uri);   // strip leading /api segment only
$uri   = trim((string) $uri, '/');
$parts = $uri === '' ? [] : explode('/', $uri);
$method = $_SERVER['REQUEST_METHOD'];

function not_found(): void {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
    exit;
}

// --- public: login ---
if (($parts[0] ?? '') === 'auth' && ($parts[1] ?? '') === 'login' && $method === 'POST') {
    auth_login();
    exit;
}

// --- everything below requires a valid token ---
require_auth();

// auth/me
if (($parts[0] ?? '') === 'auth' && ($parts[1] ?? '') === 'me' && $method === 'GET') {
    auth_me();
    exit;
}

// --- dispatch to route files ---
// /sites/{domain}/backups... is owned by backups.php; other /sites by sites.php.
$top = $parts[0] ?? '';
$route = match (true) {
    $top === 'sites' && ($parts[2] ?? '') === 'backups' => 'backups',
    $top === 'sites'                                     => 'sites',
    $top === 'stack'                                     => 'stack',
    $top === 'logs'                                      => 'logs',
    $top === 'files'                                     => 'files',
    $top === 'system'                                    => 'system',
    default                                              => null,
};

if ($route === null) not_found();

$file = __DIR__ . '/routes/' . $route . '.php';
$fn   = 'handle_' . $route;
if (!is_file($file)) not_found();
require $file;
if (!function_exists($fn)) not_found();

$fn($method, $parts);
