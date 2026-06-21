<?php
// Front controller / router.
// Public:  POST auth/login.  Everything else requires a valid session token.
// Route files live in routes/<name>.php and each defines handle_<name>($method, $parts),
// where $parts is the route path split on '/'.
//
// Routing is query-string based so the GUI needs ZERO nginx changes: the frontend
// calls /api/index.php?p=/sites — the URL ends in .php, so any default WordOps
// php-site nginx hands it to PHP-FPM as-is. ?p= carries the route; other query
// params (path, lines, recursive) are read normally by the route handlers.

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

// --- determine route path ---
// Primary: ?p=/sites/...  Fallbacks (for an optional pretty-URL nginx setup):
// PATH_INFO, then REQUEST_URI with /api and /index.php stripped.
$routePath = $_GET['p'] ?? ($_SERVER['PATH_INFO'] ?? '');
if ($routePath === '') {
    $uri = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $uri = preg_replace('#^/api(?:/index\.php)?(?=/|$)#', '', $uri);   // /api or /api/index.php
    $uri = preg_replace('#/index\.php(?=/|$)#', '', $uri);            // bare /index.php
    $routePath = (string) $uri;
}
$routePath = trim($routePath, '/');
$parts  = $routePath === '' ? [] : explode('/', $routePath);
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
