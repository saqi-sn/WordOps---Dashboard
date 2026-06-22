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

function session_ttl(): int {
    return defined('SESSION_TTL') ? SESSION_TTL : 86400;
}

// --- token issue / verify ---
function issue_token(): string {
    $payload = json_encode(['u' => admin_user(), 'exp' => time() + session_ttl()]);
    $p   = b64url_encode($payload);
    $sig = hash_hmac('sha256', $p, session_secret(), true);
    $s   = b64url_encode($sig);
    return "$p.$s";
}

function verify_token(string $token): bool {
    return token_payload($token) !== null;
}

// Returns decoded payload array if token valid + unexpired, else null.
function token_payload(string $token): ?array {
    $secret = session_secret();
    if ($secret === '') return null;
    $parts = explode('.', $token);
    if (count($parts) !== 2) return null;
    [$p, $s] = $parts;
    $expected = hash_hmac('sha256', $p, $secret, true);
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
// GET /api/auth/status  -> { setup: bool }   (public; tells UI to show setup vs login)
function auth_status(): void {
    echo json_encode(['setup' => is_setup_complete()]);
}

// POST /api/auth/setup  { username, password, email }   (public, ONCE — first run)
// Creates the admin account + a random session secret. Refused once set up.
function auth_setup(): void {
    if (is_setup_complete()) {
        http_response_code(409);
        echo json_encode(['error' => 'Already set up']);
        exit;
    }
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $user  = trim((string) ($body['username'] ?? ''));
    $pass  = (string) ($body['password'] ?? '');
    $email = trim((string) ($body['email'] ?? ''));

    if (!preg_match('/^[a-zA-Z0-9._@-]{3,60}$/', $user)) {
        http_response_code(400); echo json_encode(['error' => 'Username 3-60 chars (letters, digits, . _ - @)']); exit;
    }
    if (strlen($pass) < 8 || strlen($pass) > 200) {
        http_response_code(400); echo json_encode(['error' => 'Password must be at least 8 characters']); exit;
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400); echo json_encode(['error' => 'Invalid email']); exit;
    }

    $ok = setting_put([
        'admin_user'      => $user,
        'admin_pass_hash' => password_hash($pass, PASSWORD_DEFAULT),
        'admin_email'     => $email,
        'session_secret'  => bin2hex(random_bytes(32)),
    ]);
    if (!$ok) {
        http_response_code(500); echo json_encode(['error' => 'Could not write settings (check api/data is writable)']); exit;
    }
    echo json_encode(['token' => issue_token(), 'expires_in' => session_ttl()]);
}

// POST /api/auth/login  { "username", "password" }
function auth_login(): void {
    if (!is_setup_complete()) {
        http_response_code(409);
        echo json_encode(['error' => 'Not set up yet']);
        exit;
    }
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
    $ok = hash_equals(admin_user(), (string) $user) && password_verify((string) $pass, admin_hash());

    if (!$ok) {
        sleep(1);                 // slow brute force
        login_record_fail();
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
        exit;
    }

    login_record_success();
    echo json_encode(['token' => issue_token(), 'expires_in' => session_ttl()]);
}

// GET /api/auth/me  -> { user }   (token already validated by require_auth)
function auth_me(): void {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    $token = preg_match('/^Bearer\s+(.+)$/i', $auth, $m) ? $m[1] : '';
    $data = token_payload($token);
    echo json_encode(['user' => $data['u'] ?? admin_user(), 'email' => setting('admin_email', '')]);
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
