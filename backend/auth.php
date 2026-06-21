<?php
// Auth: stateless HMAC session tokens. Single admin user, no DB.
// Token format:  base64url(payload) "." base64url(hmac_sha256(payload, SECRET))
// payload = JSON { "u": ADMIN_USER, "exp": <unix ts> }

// --- base64url helpers ---
function b64url_encode(string $bin): string {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function b64url_decode(string $s): string {
    return base64_decode(strtr($s . str_repeat('=', (4 - strlen($s) % 4) % 4), '-_', '+/'));
}

// --- token issue / verify ---
function issue_token(): string {
    $payload = json_encode(['u' => ADMIN_USER, 'exp' => time() + SESSION_TTL]);
    $p   = b64url_encode($payload);
    $sig = hash_hmac('sha256', $p, SESSION_SECRET, true);
    $s   = b64url_encode($sig);
    return "$p.$s";
}

function verify_token(string $token): bool {
    return token_payload($token) !== null;
}

// Returns decoded payload array if token valid + unexpired, else null.
function token_payload(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 2) return null;
    [$p, $s] = $parts;
    $expected = hash_hmac('sha256', $p, SESSION_SECRET, true);
    $givenSig = b64url_decode($s);
    if (!hash_equals($expected, $givenSig)) return null;   // constant-time compare
    $data = json_decode(b64url_decode($p), true);
    if (!is_array($data) || ($data['exp'] ?? 0) <= time()) return null;
    return $data;
}

// --- brute-force throttle (temp-file lockout) ---
// 5 failures within window -> lock 60s. State in system temp dir.
function login_lockfile(): string {
    return sys_get_temp_dir() . '/wo_gui_login_attempts.json';
}

function login_state(): array {
    $f = login_lockfile();
    if (!is_file($f)) return ['fails' => 0, 'first' => 0, 'locked_until' => 0];
    $d = json_decode((string) @file_get_contents($f), true);
    return is_array($d) ? $d + ['fails' => 0, 'first' => 0, 'locked_until' => 0] : ['fails' => 0, 'first' => 0, 'locked_until' => 0];
}

function login_save(array $s): void {
    @file_put_contents(login_lockfile(), json_encode($s), LOCK_EX);
}

function login_is_locked(): int {
    $s = login_state();
    $rem = ($s['locked_until'] ?? 0) - time();
    return $rem > 0 ? $rem : 0;
}

function login_record_fail(): void {
    $s = login_state();
    // reset rolling window after 15 min of no fails
    if (time() - ($s['first'] ?? 0) > 900) { $s['fails'] = 0; $s['first'] = time(); }
    if (($s['fails'] ?? 0) === 0) $s['first'] = time();
    $s['fails'] = ($s['fails'] ?? 0) + 1;
    if ($s['fails'] >= 5) { $s['locked_until'] = time() + 60; $s['fails'] = 0; }
    login_save($s);
}

function login_record_success(): void {
    @unlink(login_lockfile());
}

// --- endpoints ---
// POST /api/auth/login  { "username", "password" }
function auth_login(): void {
    $rem = login_is_locked();
    if ($rem > 0) {
        http_response_code(429);
        header('Retry-After: ' . $rem);
        echo json_encode(['error' => 'Too many attempts. Try again in ' . $rem . 's']);
        exit;
    }

    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $user = $body['username'] ?? '';
    $pass = $body['password'] ?? '';
    // always run password_verify against stored hash (constant-time-ish)
    $ok = hash_equals(ADMIN_USER, (string) $user) && password_verify((string) $pass, ADMIN_PASS_HASH);

    if (!$ok) {
        sleep(1);                 // slow brute force
        login_record_fail();
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
        exit;
    }

    login_record_success();
    echo json_encode(['token' => issue_token(), 'expires_in' => SESSION_TTL]);
}

// GET /api/auth/me  -> { user }   (token already validated by require_auth)
function auth_me(): void {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    $token = preg_match('/^Bearer\s+(.+)$/i', $auth, $m) ? $m[1] : '';
    $data = token_payload($token);
    echo json_encode(['user' => $data['u'] ?? ADMIN_USER]);
}

function require_auth(): void {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    $token = preg_match('/^Bearer\s+(.+)$/i', $auth, $m) ? $m[1] : '';
    if (!verify_token($token)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}
