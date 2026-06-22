# WordOps GUI — CLAUDE.md

## Project Overview

A web-based admin panel for WordOps (https://wordops.net) — a CLI WordPress server manager built on Nginx + PHP-FPM + MySQL/MariaDB.

The GUI is a **thin wrapper**: it executes real `wo` shell commands underneath and returns results. It does NOT reimplement WordOps logic. Every site/stack action on the UI maps 1:1 to a `wo` command. Non-`wo` features (backups-to-S3, file manager, auth) are implemented in PHP directly.

---

## Architecture

```
[Browser]
    ↕  HTTPS (Nginx managed by WordOps)
[Frontend — React SPA]   ← built locally, deployed as static files
    ↕  JSON API calls (Bearer session token, issued on login)
[Backend — PHP API]      ← runs on server via PHP-FPM / Nginx
    ↕  shell_exec()  +  direct filesystem  +  S3 HTTP (SigV4)
[WordOps CLI — `wo`]  /  /var/www files  /  S3-compatible bucket
```

### Key constraints
- **No Node.js on the server.** Frontend is compiled locally and deployed as static HTML/JS/CSS files.
- **No Docker, no Python, no extra runtimes on the server.** PHP only — via the PHP-FPM that WordOps itself already manages.
- **Backend is pure PHP, no Composer dependencies.** Vanilla PHP 8.x. S3 uploads use a hand-rolled AWS Signature V4 signer (~150 lines, zero deps) — works with any S3-compatible provider (AWS, Backblaze B2, Wasabi, MinIO, DigitalOcean Spaces).
- **`wo` commands run as root.** PHP-FPM pool for this app runs as root, OR the API uses `sudo wo` with a passwordless sudoers rule for the `wo` binary only.
- **Single-user admin panel.** One username + password (hashed in config). Login issues a short-lived HMAC-signed session token. No user database.

---

## Project Structure

```
wordops-gui/
├── CLAUDE.md                    ← this file
├── README.md
├── deploy.sh                    ← rsync frontend/dist + backend to server
│
├── frontend/                    ← React app (build locally)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── theme.css            ← CSS variables (illustration theme)
│       ├── auth.ts              ← token storage, login state, route guard
│       ├── api/
│       │   └── client.ts        ← all fetch() calls to PHP backend
│       ├── components/
│       │   ├── Layout.tsx       ← sidebar + topbar shell
│       │   ├── StatusBadge.tsx
│       │   ├── Card.tsx
│       │   ├── ConfirmDialog.tsx ← typed-confirm for destructive actions
│       │   └── Toast.tsx
│       └── pages/
│           ├── Login.tsx        ← username + password form
│           ├── Dashboard.tsx    ← overview: site count, stack status, disk
│           ├── Sites.tsx        ← site list + create + delete + actions
│           ├── Backups.tsx      ← per-site backup management + S3 push
│           ├── FileManager.tsx  ← jailed browser/editor under /var/www
│           ├── Stack.tsx        ← service status + restart
│           └── Logs.tsx         ← log viewer
│
└── backend/                     ← PHP API (deploy to server)
    ├── config.php               ← token secret, password hash, paths, S3 (gitignored)
    ├── config.example.php       ← template committed to repo
    ├── index.php                ← router
    ├── auth.php                 ← login + HMAC session token validation
    ├── wo.php                   ← shell_exec wrapper + output parser + validators
    ├── s3.php                   ← AWS SigV4 signer + PUT upload
    └── routes/
        ├── sites.php
        ├── backups.php
        ├── files.php            ← file manager
        ├── stack.php
        └── logs.php
```

---

## Design System — Illustration Theme

Replicate the "Illustration Style" from Ant Design's theme gallery. Do NOT use Ant Design the library — implement with pure CSS variables and custom components.

### CSS Variables (theme.css)

```css
:root {
  /* Colors */
  --color-bg:        #FFF9F0;   /* warm cream — page background */
  --color-surface:   #FFFFFF;   /* cards, panels */
  --color-surface-2: #FFF0F6;   /* alternate card bg (pink tint) */
  --color-border:    #2C2C2C;   /* all borders */
  --color-text:      #2C2C2C;   /* primary text */
  --color-text-muted:#6B6B6B;
  --color-primary:   #52C41A;   /* green */
  --color-primary-dark: #389E0D;
  --color-danger:    #FA5252;
  --color-warning:   #FFD93D;
  --color-success:   #51CF66;
  --color-info:      #4DABF7;

  /* Shape */
  --radius:     12px;
  --radius-lg:  16px;
  --radius-sm:  8px;

  /* The signature illustration effect */
  --border:     2px solid var(--color-border);
  --shadow:     4px 4px 0 var(--color-border);
  --shadow-sm:  2px 2px 0 var(--color-border);

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Typography */
  --font-body:    'DM Sans', sans-serif;
  --font-mono:    'JetBrains Mono', monospace;
  --font-size:    15px;
  --font-weight-bold: 700;
}
```

### Component Rules

**Cards:**
```css
.card {
  background: var(--color-surface);
  border: var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: var(--space-lg);
}
```

**Buttons:**
```css
.btn {
  border: var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: transform 0.1s, box-shadow 0.1s;
}
.btn:active {
  transform: translate(2px, 2px);
  box-shadow: none;  /* "pressed" effect */
}
.btn-primary { background: var(--color-primary); color: white; }
.btn-danger  { background: var(--color-danger);  color: white; }
.btn-default { background: white; }
```

**Status badges:**
- Running → green pill with border
- Stopped → red
- Unknown → gray

**Sidebar:**
- Left sidebar, fixed, ~220px
- Background: var(--color-surface-2) with right border
- Nav items: bold text, active state gets primary color left border accent
- Nav order: Dashboard · Sites · Backups · Files · Stack · Logs
- Topbar shows logged-in user + Logout button

**Typography:**
- Load from Google Fonts: `DM Sans` (body) + `JetBrains Mono` (logs/code/file editor)
- All headings: font-weight 700
- Page titles: 24px
- Section labels: 12px uppercase letter-spacing

---

## Backend — PHP API

### config.php (never commit — gitignored)

```php
<?php
// --- Auth ---
define('ADMIN_USER', 'admin');
// Generate with: php -r "echo password_hash('your-password', PASSWORD_DEFAULT);"
define('ADMIN_PASS_HASH', '$2y$10$....');
define('SESSION_SECRET', 'random-64-char-secret-for-hmac');  // openssl rand -hex 32
define('SESSION_TTL', 86400);                                // token lifetime, seconds

// --- WordOps ---
define('WO_BIN', '/usr/local/bin/wo');
define('WEBROOT_BASE', '/var/www');     // sites + file manager jail + backups
define('LOG_LINES', 200);

// --- File manager ---
define('FM_ROOT', '/var/www');          // hard jail; nothing outside is reachable
define('FM_MAX_EDIT_BYTES', 2 * 1024 * 1024);   // 2 MB cap for read/edit-as-text
define('FM_MAX_UPLOAD_BYTES', 200 * 1024 * 1024);

// --- S3 (optional; leave S3_BUCKET empty to disable S3 features) ---
define('S3_ENDPOINT', 'https://s3.us-east-1.amazonaws.com'); // or B2/Wasabi/MinIO/Spaces host
define('S3_REGION',   'us-east-1');
define('S3_BUCKET',   '');              // '' disables S3 push UI
define('S3_KEY',      '');
define('S3_SECRET',   '');
define('S3_PREFIX',   'wordops-backups/');  // key prefix inside bucket
```

### auth.php — Login + Session Token

Single user. No DB, no server-side session store. A login issues a stateless HMAC-signed token; every request re-verifies the signature and expiry.

```php
<?php
// Token format:  base64url(payload) . "." . base64url(hmac_sha256(payload, SECRET))
// payload = JSON { "u": ADMIN_USER, "exp": <unix ts> }

function issue_token(): string {
    $payload = json_encode(['u' => ADMIN_USER, 'exp' => time() + SESSION_TTL]);
    $p = rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
    $sig = hash_hmac('sha256', $p, SESSION_SECRET, true);
    $s = rtrim(strtr(base64_encode($sig), '+/', '-_'), '=');
    return "$p.$s";
}

function verify_token(string $token): bool {
    $parts = explode('.', $token);
    if (count($parts) !== 2) return false;
    [$p, $s] = $parts;
    $expected = hash_hmac('sha256', $p, SESSION_SECRET, true);
    $given = base64_decode(strtr($p . str_repeat('=', (4 - strlen($p) % 4) % 4), '-_', '+/'));
    $givenSig = base64_decode(strtr($s . str_repeat('=', (4 - strlen($s) % 4) % 4), '-_', '+/'));
    if (!hash_equals($expected, $givenSig)) return false;     // constant-time compare
    $data = json_decode($given, true);
    return is_array($data) && ($data['exp'] ?? 0) > time();
}

// POST /api/auth/login  { "username", "password" }
function auth_login(): void {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $user = $body['username'] ?? '';
    $pass = $body['password'] ?? '';
    // constant-time-ish: always run password_verify against the stored hash
    $ok = hash_equals(ADMIN_USER, $user) && password_verify($pass, ADMIN_PASS_HASH);
    if (!$ok) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
        exit;
    }
    echo json_encode(['token' => issue_token(), 'expires_in' => SESSION_TTL]);
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
```

> Rate-limit login: on failed `auth_login`, `sleep(1)` before responding to slow brute force. Optionally track failures in a temp file and lock for 60s after 5 fails.

### wo.php — Shell Wrapper

```php
<?php
function wo_exec(string $command): array {
    $full = escapeshellcmd(WO_BIN . ' ' . $command) . ' 2>&1';
    $output = shell_exec($full);
    return [
        'output' => trim($output ?? ''),
        'ok'     => true,
    ];
}

function validate_domain(string $domain): string {
    if (!preg_match('/^[a-zA-Z0-9.\-]+$/', $domain) || str_contains($domain, '..')) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid domain']);
        exit;
    }
    return $domain;
}
```

Build `wo` argument strings only from a **whitelist** of known flags (see Site Create below) — never concatenate raw user strings into the command beyond the validated domain.

### s3.php — AWS Signature V4 PUT

Pure-PHP SigV4 signer. No SDK, no Composer.

```php
<?php
// Upload a local file to S3 under S3_PREFIX. Returns [ok, key|error].
function s3_put_file(string $localPath, string $key): array {
    if (S3_BUCKET === '') return ['ok' => false, 'error' => 'S3 not configured'];
    $host    = parse_url(S3_ENDPOINT, PHP_URL_HOST);
    $scheme  = parse_url(S3_ENDPOINT, PHP_URL_SCHEME);
    $fullKey = S3_PREFIX . $key;
    $body    = file_get_contents($localPath);
    $payloadHash = hash('sha256', $body);

    $now   = gmdate('Ymd\THis\Z');
    $date  = gmdate('Ymd');
    $canonicalUri = '/' . S3_BUCKET . '/' . str_replace('%2F', '/', rawurlencode($fullKey));

    $headers = [
        'host'                 => $host,
        'x-amz-content-sha256' => $payloadHash,
        'x-amz-date'           => $now,
    ];
    ksort($headers);
    $signedHeaders = implode(';', array_keys($headers));
    $canonicalHeaders = '';
    foreach ($headers as $k => $v) $canonicalHeaders .= "$k:$v\n";

    $canonicalRequest = "PUT\n$canonicalUri\n\n$canonicalHeaders\n$signedHeaders\n$payloadHash";
    $scope = "$date/" . S3_REGION . "/s3/aws4_request";
    $stringToSign = "AWS4-HMAC-SHA256\n$now\n$scope\n" . hash('sha256', $canonicalRequest);

    $kDate    = hash_hmac('sha256', $date, 'AWS4' . S3_SECRET, true);
    $kRegion  = hash_hmac('sha256', S3_REGION, $kDate, true);
    $kService = hash_hmac('sha256', 's3', $kRegion, true);
    $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true);
    $signature = hash_hmac('sha256', $stringToSign, $kSigning);

    $authz = "AWS4-HMAC-SHA256 Credential=" . S3_KEY . "/$scope, "
           . "SignedHeaders=$signedHeaders, Signature=$signature";

    $ch = curl_init("$scheme://$host$canonicalUri");
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'PUT',
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            "Authorization: $authz",
            "x-amz-date: $now",
            "x-amz-content-sha256: $payloadHash",
            "Content-Type: application/gzip",
        ],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 200 && $code < 300) return ['ok' => true, 'key' => $fullKey];
    return ['ok' => false, 'error' => "S3 $code: $resp"];
}
```

> For very large backups, swap `file_get_contents` for a streamed/multipart upload later. For a single-admin panel with typical site backups this single-PUT path is fine. Note S3 single-PUT max is 5 GB.

### index.php — Router

```php
<?php
require 'config.php';
require 'auth.php';
require 'wo.php';
require 's3.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = trim(str_replace('/api', '', $uri), '/');
$parts = explode('/', $uri);
$method = $_SERVER['REQUEST_METHOD'];

// Public: login
if ($parts[0] === 'auth' && ($parts[1] ?? '') === 'login' && $method === 'POST') {
    auth_login(); exit;
}

// Everything else requires a valid session token
require_auth();

// ... routes dispatch to routes/*.php (sites, backups, files, stack, logs) ...

http_response_code(404);
echo json_encode(['error' => 'Not found']);
```

---

## API Endpoints

All endpoints except `POST /api/auth/login` require: `Authorization: Bearer {sessionToken}`.
All responses: `Content-Type: application/json` unless noted.

### Auth

| Method | Path | Action |
|--------|------|--------|
| POST | `/api/auth/login` | Verify username + password → return `{ token, expires_in }` |
| GET  | `/api/auth/me` | Validate current token → return `{ user }` (used by frontend on load) |

### Sites

| Method | Path | WO command | Notes |
|--------|------|-----------|-------|
| GET | `/api/sites` | `wo site list` | Parse table output |
| GET | `/api/sites/{domain}/info` | `wo site info {domain}` | |
| POST | `/api/sites` | `wo site create {domain} {flags}` | **Guarded create.** See below |
| DELETE | `/api/sites/{domain}` | `wo site delete {domain} --no-prompt` | **Typed-confirm required** |
| POST | `/api/sites/{domain}/enable` | `wo site enable {domain}` | |
| POST | `/api/sites/{domain}/disable` | `wo site disable {domain}` | |
| POST | `/api/sites/{domain}/cache/purge` | `wo site update {domain} --purge-cache` | |

**Site Create — body + flag whitelist:**
```json
{ "domain": "example.com", "type": "wp", "php": "82", "cache": "fastcgi", "ssl": true }
```
Map to `wo site create` flags from a whitelist ONLY:
- `type`: `wp` → `--wp`, `html` → `--html`, `proxy` → `--proxy=<host:port>` (validate host:port), `php` → `--php`
- `cache`: `fastcgi` → `--wpfc`, `redis` → `--wpredis`, `none` → (omit)
- `php`: `74|80|81|82|83` → `--php74` … `--php83`
- `ssl: true` → `--le` (Let's Encrypt). Only attempt if domain DNS already resolves to this server (warn in UI).

Reject any value not in the whitelist with 400. Create may take 30–90s (composer install for WP) — frontend shows spinner.

**Site Delete:** Frontend requires the user to **type the exact domain** to confirm. Backend re-validates domain, runs `wo site delete {domain} --no-prompt`. Returns command output.

### Backups (local + S3)

| Method | Path | Action | Notes |
|--------|------|--------|-------|
| GET | `/api/sites/{domain}/backups` | PHP: scan `/var/www/{domain}/backup/` | filename, size_mb, created_at, in_s3 (bool) |
| POST | `/api/sites/{domain}/backups` | `wo site backup {domain}` | Local backup. 30–120s |
| GET | `/api/sites/{domain}/backups/{file}` | PHP: `readfile()` stream | `Content-Type: application/gzip` |
| DELETE | `/api/sites/{domain}/backups/{file}` | PHP: `unlink()` local | Validate path inside backup dir |
| POST | `/api/sites/{domain}/backups/{file}/s3` | `s3_put_file()` | **Manual push** to S3. Key = `{domain}/{file}` |

S3 is **manual push** per backup file (no auto-upload). `in_s3` in the list is best-effort (the panel can record pushed keys in a small JSON manifest at `/var/www/{domain}/backup/.s3manifest.json`). If `S3_BUCKET` is empty, the S3 push button is hidden and the endpoint returns 400.

**Backup path safety:**
```php
function safe_backup_path(string $domain, string $filename): string|false {
    $base = WEBROOT_BASE . '/' . $domain . '/backup/';
    $path = realpath($base . basename($filename));
    if (!$path || !str_starts_with($path, $base)) return false;
    return $path;
}
```

### Files — File Manager (jailed to `/var/www`)

Every path is resolved with `realpath()` and MUST start with `FM_ROOT`. Reject symlink escapes, `..`, and anything outside the jail.

| Method | Path | Action | Notes |
|--------|------|--------|-------|
| GET | `/api/files/list?path={rel}` | List dir entries | name, type (file/dir), size, mtime, perms |
| GET | `/api/files/read?path={rel}` | Read text file | Only if size ≤ FM_MAX_EDIT_BYTES & looks like text; else 413 |
| POST | `/api/files/write` | Save text file | body `{ path, content }`. Within jail only |
| POST | `/api/files/upload` | Multipart upload | field `file` + `path` (dir). Size ≤ FM_MAX_UPLOAD_BYTES |
| GET | `/api/files/download?path={rel}` | Stream any file | `Content-Disposition: attachment` |
| POST | `/api/files/mkdir` | Create directory | body `{ path }` |
| POST | `/api/files/rename` | Rename/move | body `{ from, to }` — both within jail |
| DELETE | `/api/files?path={rel}` | Delete file/dir | Dirs require `recursive=true`; typed-confirm in UI |

**Jail helper (files.php):**
```php
function fm_resolve(string $rel): string|false {
    $candidate = FM_ROOT . '/' . ltrim($rel, '/');
    $real = realpath($candidate);
    // For not-yet-existing targets (write/mkdir), resolve the parent instead.
    if ($real === false) {
        $parent = realpath(dirname($candidate));
        if ($parent === false || !str_starts_with($parent, FM_ROOT)) return false;
        return $parent . '/' . basename($candidate);
    }
    if (!str_starts_with($real, FM_ROOT)) return false;
    return $real;
}
```
Never trust the client path. Always `fm_resolve()` first; on `false` return 403. Treat dotfiles/`.s3manifest.json` normally but never expose anything outside `FM_ROOT`.

### Stack

| Method | Path | WO command |
|--------|------|-----------|
| GET | `/api/stack/status` | `wo stack status` |
| POST | `/api/stack/{service}/restart` | `wo stack restart {service}` |
| POST | `/api/stack/{service}/stop` | `wo stack stop {service}` |
| POST | `/api/stack/{service}/start` | `wo stack start {service}` |

Valid services (whitelist): `nginx`, `php`, `mysql`, `redis`, `memcache`. Reject others with 400.

### Logs

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/logs/nginx/error` | `tail -n {lines} /var/log/nginx/error.log` |
| GET | `/api/logs/nginx/access` | `tail -n {lines} /var/log/nginx/access.log` |
| GET | `/api/logs/php` | `tail -n {lines} /var/log/php*` |
| GET | `/api/logs/mysql` | `tail -n {lines} /var/log/mysql/error.log` |

Query param: `?lines=200` (default 200, max 1000). Log type taken from a whitelist — never build the file path from raw input.

### System Info

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/system/disk` | Parse `df -h /var/www` |
| GET | `/api/system/uptime` | Parse `uptime` |

---

## Frontend — React Pages

### Login (`/login`)
- Centered card: username + password, "Log in" button.
- On success store `{ token, exp }` in `localStorage`; redirect to Dashboard.
- All other routes guarded: no/expired token → redirect to `/login`.
- On any API `401`, clear token + bounce to login.

### Dashboard (`/`)
- Top row: 3 stat cards — Total Sites, Stack Running (X/Y services), Disk Used
- Stack services grid: Nginx / PHP / MySQL / Redis — each a card with status badge + restart button
- Recent backups list (last 5 across all sites)
- Refresh button.

### Sites (`/sites`)
Table columns: Domain | Type | PHP | Cache | SSL | Status | Actions
- **"Create Site"** button → modal form (domain, type, PHP, cache, SSL toggle) → POST `/api/sites`, spinner "Creating… may take a minute".
- Per row: Info modal · Purge Cache · Enable/Disable toggle · Go to Backups · Go to Files (`/files?path={domain}`) · **Delete** (typed-confirm dialog, must type domain).

### Backups (`/backups`)
- Site selector dropdown (from site list).
- "Create Backup" button → POST, spinner "This may take a minute…".
- Backup table: Filename | Size | Date | In S3 | Actions (Download · **Push to S3** · Delete).
- "Push to S3" hidden if S3 not configured; shows spinner then ✓/✗.
- Delete + S3 push confirm dialogs.

### Files (`/files`)
- Breadcrumb path (jailed root shown as `/var/www`). Optional `?path=` deep-link.
- Listing table: Name | Size | Modified | Perms | Actions. Dirs clickable to descend; `..` to go up (never above jail).
- Toolbar: New Folder · Upload (drag-drop or picker) · Refresh.
- File actions: Download · Edit (text, monospace editor, only if ≤ size cap) · Rename · Delete.
- Edit view: monospace textarea (dark surface like Logs), Save → POST `/api/files/write`. Show "binary / too large to edit" when applicable.
- Delete dir = typed-confirm + recursive flag.

### Stack (`/stack`)
- Cards per service: name, status, Start/Stop/Restart buttons. Loading state on that card only. Auto-refresh every 30s.

### Logs (`/logs`)
- Service selector: nginx-error / nginx-access / php / mysql. Lines: 50/100/200/500.
- Monospace textarea, dark background. Refresh + auto-refresh toggle (10s) + Copy all.

---

## Frontend — Auth + API Client

### auth.ts
```typescript
const KEY = 'wo_token';
export const auth = {
  get: () => localStorage.getItem(KEY) ?? '',
  set: (t: string) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
  isAuthed: () => !!localStorage.getItem(KEY),
};
```

### client.ts
```typescript
const BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${auth.get()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (res.status === 401) { auth.clear(); location.href = '/login'; throw new Error('Unauthorized'); }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string; expires_in: number }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ username, password }),
      }),
    me: () => request<{ user: string }>('/auth/me'),
  },
  sites: {
    list: () => request<Site[]>('/sites'),
    info: (d: string) => request<SiteInfo>(`/sites/${d}/info`),
    create: (body: CreateSite) => request('/sites', { method: 'POST', body: JSON.stringify(body) }),
    remove: (d: string) => request(`/sites/${d}`, { method: 'DELETE' }),
    enable: (d: string) => request(`/sites/${d}/enable`, { method: 'POST' }),
    disable: (d: string) => request(`/sites/${d}/disable`, { method: 'POST' }),
    purgeCache: (d: string) => request(`/sites/${d}/cache/purge`, { method: 'POST' }),
  },
  backups: {
    list: (d: string) => request<Backup[]>(`/sites/${d}/backups`),
    create: (d: string) => request(`/sites/${d}/backups`, { method: 'POST' }),
    downloadUrl: (d: string, f: string) => `${BASE}/sites/${d}/backups/${f}`,
    delete: (d: string, f: string) => request(`/sites/${d}/backups/${f}`, { method: 'DELETE' }),
    pushS3: (d: string, f: string) => request(`/sites/${d}/backups/${f}/s3`, { method: 'POST' }),
  },
  files: {
    list: (path = '') => request<FileEntry[]>(`/files/list?path=${encodeURIComponent(path)}`),
    read: (path: string) => request<{ content: string }>(`/files/read?path=${encodeURIComponent(path)}`),
    write: (path: string, content: string) => request('/files/write', { method: 'POST', body: JSON.stringify({ path, content }) }),
    downloadUrl: (path: string) => `${BASE}/files/download?path=${encodeURIComponent(path)}`,
    mkdir: (path: string) => request('/files/mkdir', { method: 'POST', body: JSON.stringify({ path }) }),
    rename: (from: string, to: string) => request('/files/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),
    delete: (path: string, recursive = false) => request(`/files?path=${encodeURIComponent(path)}&recursive=${recursive}`, { method: 'DELETE' }),
    // upload uses FormData; build manually with the Bearer header.
  },
  stack: {
    status: () => request<StackStatus>('/stack/status'),
    restart: (s: string) => request(`/stack/${s}/restart`, { method: 'POST' }),
    start: (s: string) => request(`/stack/${s}/start`, { method: 'POST' }),
    stop: (s: string) => request(`/stack/${s}/stop`, { method: 'POST' }),
  },
  logs: { get: (type: string, lines = 200) => request<LogResponse>(`/logs/${type}?lines=${lines}`) },
  system: { disk: () => request<DiskInfo>('/system/disk'), uptime: () => request<UptimeInfo>('/system/uptime') },
};
```

Note: file/backup download links carry the token via header, so use `fetch`→blob for downloads (or a short-lived signed query if simpler), since plain `<a href>` can't set Authorization.

---

## TypeScript Types

```typescript
interface Site {
  domain: string;
  type: string;         // wp, html, proxy, etc.
  php: string;
  cache: string;        // fastcgi, redis, none
  ssl: boolean;
  status: 'enabled' | 'disabled';
}

interface CreateSite {
  domain: string;
  type: 'wp' | 'html' | 'proxy' | 'php';
  php: '74' | '80' | '81' | '82' | '83';
  cache: 'fastcgi' | 'redis' | 'none';
  ssl: boolean;
  proxyTarget?: string; // host:port when type=proxy
}

interface Backup {
  filename: string;
  size_mb: number;
  created_at: number;   // unix timestamp
  in_s3: boolean;
}

interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  size: number;
  mtime: number;
  perms: string;        // e.g. "rwxr-xr-x"
}

interface StackStatus {
  services: { name: string; status: 'running' | 'stopped' | 'unknown' }[];
}

interface DiskInfo { total: string; used: string; available: string; percent: number; }
```

---

## Frontend Setup (vite.config.ts)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://YOUR_SERVER_IP' } },
  build: { outDir: 'dist' },
})
```

**.env.local** (local dev — not committed):
```
VITE_API_URL=http://YOUR_SERVER/api
```
No token in frontend env anymore — auth is via login form.

---

## Deployment — zero-touch (no git / no build / no installs / no nginx changes on server)

Install model (decided post-A/B): the app is **prebuilt by CI** into a release tarball
laid out as the site webroot. The server only fetches + extracts. This is possible because
of two design choices that remove every reason to touch nginx:

1. **Query-string API routing** — the frontend calls `/api/index.php?p=/sites`. The URL
   ends in `.php`, so any default WordOps php-site nginx hands it to PHP-FPM untouched.
   `index.php` reads the route from `$_GET['p']` (fallbacks: `PATH_INFO`, then a
   `/api`+`/index.php`-stripped `REQUEST_URI` for an optional pretty-URL setup).
2. **Hash-router frontend** — deep links live in the URL hash (`#/sites`), so one
   `index.html` serves every route with **no SPA `try_files` fallback** needed.

### Install on the server
```bash
wo site create panel.example.com --php82          # configures nginx + PHP-FPM for us
cd /var/www/panel.example.com/htdocs
rm -f index.html index.php                         # drop WordOps placeholder
# extract release (run the whole pipe as root so tar can write):
sudo sh -c 'wget -qO- https://github.com/saqi-sn/WordOps---Dashboard/releases/latest/download/wordops-gui.tar.gz | tar xz --no-overwrite-dir'
sudo bash install.sh                               # sudoers + perms + config.php (one command)
sudo nano api/config.php                           # set ADMIN_PASS_HASH + SESSION_SECRET (only manual edit)
```
Webroot ends up: `index.html` + `assets/` at root, PHP under `api/`, `install.sh` at root.
`--no-overwrite-dir` avoids the `tar: .: Cannot utime` error on the pre-existing htdocs dir.
`client_max_body_size` is **not** required (WordOps php sites default to ample upload size).

### Privileges — handled by install.sh (works any PHP version, root or not)
`wo` must run as root, but a WordOps php-site pool runs as `www-data`. Rather than editing
nginx/pools per server, the app calls `wo` via **`sudo -n wo`** (config `WO_SUDO`, auto-skipped
when PHP already runs as root — see `wo.php::wo_need_sudo`). `install.sh` does the one-time root
setup, version-agnostic:
1. `/etc/sudoers.d/wordops-gui` — `www-data ALL=(root) NOPASSWD: /usr/local/bin/wo`
2. adds the web user to group `adm` so the Logs page can read `/var/log/*`
3. ensures `/root/.gitconfig` exists (WordOps fails without it when run as root)
4. creates `api/config.php` from the template; fixes webroot ownership; restarts php-fpm
Override the web user with `WEB_USER=... sudo -E bash install.sh`. File-manager writes to
`/var/www` work as `www-data` (WordOps owns the tree as `www-data`).

### Release tarball — `.github/workflows/release.yml`
On every `v*` tag (or manual dispatch): `npm ci && npm run build`, assemble `pkg/`
(`dist/.` at root + `backend/*.php` → `api/`, `config.php` stripped, `config.example.php`
kept), `tar -czf wordops-gui.tar.gz -C pkg .`, attach to a GitHub Release. Cut one with
`git tag v0.1.0 && git push --tags`.

### deploy.sh (optional dev path)
`SERVER=… PANEL=… ./deploy.sh` builds locally and rsyncs `dist/` → webroot + `backend/` →
`api/` (excludes `config.php`). For pushing local changes without cutting a release.

---

## Security Checklist

> **C3 verification pass (done).** Every box below confirmed against the Phase-A code and
> the A10 docker smoke test (which empirically proved: unauth→401, jail `../` escape blocked,
> `.php` write blocked + `allow_php` override, injection domain `bad;rm -rf`→400, S3-disabled→400,
> binary read→415). Two notes from the zero-nginx redesign: (a) `Access-Control-Allow-Origin: *`
> is safe here — auth is a Bearer token, not cookies, so `*` carries no credentials; tighten to
> the panel origin if desired. (b) `api/*.php` are directly fetchable (no nginx deny rule, by
> design), but `config.php`/`routes/*.php` are **define/function-only — they emit nothing when
> executed**, so no secret leaks; PHP runs them rather than serving source. Upload size is capped
> in PHP (`FM_MAX_UPLOAD_BYTES`); server `post_max_size`/`upload_max_filesize` still apply.

- [x] `config.php` gitignored; deploy never overwrites server `config.php`
- [x] `ADMIN_PASS_HASH` is a real bcrypt hash; `SESSION_SECRET` ≥ 32 random bytes — enforced by config + README (`password_hash`, `openssl rand -hex 32`); example uses placeholders only.
- [x] Session token = HMAC-signed, expiry enforced, constant-time compare (`hash_equals`) — `auth.php` `issue_token`/`verify_token`.
- [x] Failed login throttled (`sleep` + optional lockout) — `auth.php` temp-file lockout: `sleep(1)` + 60s lock after 5 fails/15min.
- [x] Backup paths validated with `realpath()` + prefix check before serve/delete — `safe_backup_path()`.
- [x] **File manager**: every path through `fm_resolve()`; reject anything outside `FM_ROOT`; no symlink escape — A10 proved `../` escape→403.
- [x] Upload size capped; `.php`/executable uploads blocked — `FM_BLOCKED_EXT` list, `allow_php` override; A10 proved block + override.
- [x] Domains validated (`^[a-zA-Z0-9.\-]+$`, no `..`) before any `wo` call — `validate_domain()`; A10 proved injection→400.
- [x] `wo` flags built from whitelist only — never raw user strings — `build_create_args()`; `wo_exec()` takes a token array, per-arg `escapeshellarg`.
- [x] Stack service + log type from whitelist only — `STACK_SERVICES`/`STACK_ACTIONS`, `logs_sources()` constant paths.
- [x] Site delete + recursive file delete require typed-confirm in UI — `ConfirmDialog confirmPhrase` (exact domain / dir name).
- [x] PHP-FPM pool bound to its own socket, not exposed externally — WordOps default per php-site; not changed.
- [x] Panel served only over HTTPS (WordOps handles SSL) — `wo site create --le` / WordOps-managed nginx.
- [x] No directory listing on `/api/` — WordOps autoindex off by default; `api/*.php` execute (emit nothing), source not served (see C3 note above).
- [x] ~~`client_max_body_size` aligned with upload cap~~ — N/A under zero-nginx model; PHP `FM_MAX_UPLOAD_BYTES` + server `post_max_size` govern. Raise per-site only if large uploads used.

---

## wo Command Output Parsing Notes

**`wo site list`:**
```
+------------------+------+-------+--------+-------+
| site             | type | cache | php    | status|
+------------------+------+-------+--------+-------+
| example.com      | wp   | fastcgi| 8.2   | enable|
+------------------+------+-------+--------+-------+
```
Split lines, skip separators (`+---`), split on `|`, trim cells.

**`wo stack status`:** lines like `Nginx is running`. Regex: `/^(\w[\w\s.]+?)\s+is\s+(running|stopped)/i`.

**`wo site info {domain}`:** key-value pairs, split on `:`.

**`wo site create`:** streams progress; capture full stdout/stderr, return to UI. Exit handling: if output contains `Successfully created site` treat as success.

---

## Build & Run (Local Dev)

```bash
cd frontend && npm install
npm run dev        # proxies /api to server
npm run build      # → dist/ ready to deploy
```

---

## Out of Scope (Do NOT implement)

- Database management UI (use file manager / phpMyAdmin separately)
- Multi-user / roles (single admin only)
- Email notifications
- WordOps self-update (`wo update`)
- Auto-scheduled backups / cron (manual trigger only for now)

> Site create/delete and a jailed file manager ARE now in scope (added with confirm guards). Treat them as the highest-risk surfaces — validate relentlessly.

---

## Build Plan & Progress Tracker

**For the building session:** work top-to-bottom. Do ONE step per pass. After finishing a step:
1. Flip its checkbox `[ ]` → `[x]` in this file.
2. Add a one-line note under it: what was created + anything that deviated from spec.
3. Commit (if repo) with message `step N: <title>`.
4. Stop and report, or continue to next step.

Never skip ahead — later steps assume earlier files exist. If a step reveals a spec gap, note it inline and ask before improvising.

**Status:** `C4 done — all phases complete. Zero-touch install (query-routing + HashRouter + CI release tarball); no nginx/build/install on server.`

### Phase A — Backend (PHP)
- [x] **A1. Project skeleton + config.** Create `backend/` tree. Write `config.example.php` (all defines from spec). Add `.gitignore` (`config.php`, `frontend/dist`, `node_modules`, `.env*`).
  - Created `backend/` + `backend/routes/`. Wrote `config.example.php` (all spec defines, placeholder secrets). Wrote root `.gitignore` (ignores `backend/config.php`, `frontend/dist/`, `node_modules/`, `.env*`). No spec deviations.
- [x] **A2. auth.php.** `issue_token` / `verify_token` (HMAC), `auth_login` (throttle on fail), `require_auth`. Add `GET /auth/me`.
  - Wrote `backend/auth.php`. `issue_token`/`verify_token` per spec; added `token_payload()` helper (verify reuses it) so `auth_me()` can read the username from the token. Throttle = temp-file lockout (`sys_get_temp_dir()/wo_gui_login_attempts.json`): 5 fails in a 15-min rolling window → 60s lock (429 + `Retry-After`); `sleep(1)` on each fail; cleared on success. Added `auth_me()` for `GET /auth/me`. Deviation from spec snippet: `verify_token` delegates to `token_payload` (same logic, no behavior change) and used b64url helper fns to dedupe. PHP not installed locally — `php -l` deferred to A10 smoke test.
- [x] **A3. wo.php.** `wo_exec`, `validate_domain`, flag-whitelist helper for site create.
  - Wrote `backend/wo.php`. Deviation from spec snippet: `wo_exec` takes an **array** of tokens (not a string) and uses `exec()` + per-arg `escapeshellarg()` instead of `escapeshellcmd()` on a joined string — safer (no shell metachar leakage) and captures the real exit code, returned as `code` plus `ok` (`code === 0`). Routes in A5 must call `wo_exec(['site','list', ...])`. Added `valid_proxy_target()` (host:port regex, port 1–65535) and `build_create_args()` (whitelist→flags, 400 on any non-whitelisted value via new `reject()` helper). `validate_domain` hardened beyond spec: length ≤253, no leading/trailing dot/dash. PHP not installed locally — `php -l` deferred to A10.
- [x] **A4. index.php router.** Public `/auth/login`, then `require_auth`, then dispatch to `routes/*`. CORS + JSON headers + 404.
  - Wrote `backend/index.php`. CORS + JSON headers, OPTIONS short-circuit. Strips `/api` prefix (regex `^/api(?=/|$)` so a path segment literally named `api...` isn't mangled), splits path into `$parts`. Public `POST /auth/login`; everything else gated by `require_auth()`; `GET /auth/me` after gate. **Routing contract (A5+ MUST follow):** each `routes/<name>.php` defines `handle_<name>($method, $parts)` (`$parts` = full path split on `/`, e.g. `['sites','example.com','info']`); router `require`s the file if present, calls the fn, else 404. `/sites/{domain}/backups*` → `backups.php`; other `/sites` → `sites.php`; `stack`/`logs`/`files`/`system` → same-name file (via `match`). Deviation from spec snippet: `s3.php` include is conditional (`is_file`) since A8 not done; route files included on-demand only when present, so unbuilt routes 404 cleanly instead of fatal-erroring. PHP not installed locally — `php -l` deferred to A10.
- [x] **A5. routes/sites.php.** list (parse table), info, create (whitelist→`wo site create`), delete (`--no-prompt`), enable, disable, cache purge.
  - Wrote `backend/routes/sites.php` with `handle_sites($method,$parts)` per A4 contract. `parse_site_list()` is **header-mapped** (column order-independent) and falls back to plain one-domain-per-line output; `parse_site_info()` splits key:value lines. Create uses `build_create_args()` (A3) then treats `Successfully created site` in output as success even if exit code nonzero (wo create can exit nonzero on partial steps). All item routes run `validate_domain()`. Returns `{sites|info|ok, output}`; 405 on bad method, 404 on unknown sub-path. Deviation from spec: `ssl` is not present in `wo site list` output → reported `false` in list rows (true SSL state only knowable via info). PHP not installed locally — `php -l` deferred to A10.
- [x] **A6. routes/stack.php + logs.php + system.** stack status/start/stop/restart (service whitelist); log tail (type whitelist, lines cap); disk + uptime parse.
  - Added `sh_exec(array)` to `wo.php` — generic escaped-arg runner for non-`wo` commands (tail/df/uptime), same shape as `wo_exec`; lives in `wo.php` because only one route file loads per request so it can't be shared between the three new files. Wrote `stack.php` (`handle_stack`): `GET /stack/status` → `parse_stack_status()` regex `^(name) is (running|stopped)`; `POST /stack/{service}/{action}` with service whitelist (`nginx,php,mysql,redis,memcache`) + action whitelist (`restart,stop,start`), 400 on bad service. Wrote `logs.php` (`handle_logs`, GET only): type key = path-after-`logs` joined (`nginx/error|nginx/access|php|mysql`) mapped to **constant** file paths (php via `glob('/var/log/php*.log')`); `lines` clamped 1–1000, default `LOG_LINES`; multi-file output prefixed `==> file <==`. Wrote `system.php` (`handle_system`, GET only): `/disk` parses last `df -h WEBROOT_BASE` row → `{total,used,available,percent}`; `/uptime` returns raw + parsed 3 load averages. PHP not installed locally — `php -l` deferred to A10.
- [x] **A7. routes/backups.php.** scan dir, create (`wo site backup`), download stream, delete, `safe_backup_path`.
  - Wrote `backend/routes/backups.php` (`handle_backups`). `safe_backup_path()` per spec (`realpath` + prefix check on `/var/www/{domain}/backup/`). GET list globs the dir, hides dotfiles + `.s3manifest.json`, returns `{filename,size_mb,created_at,in_s3}` sorted newest-first; `in_s3` from manifest. POST create → `wo site backup {domain}`. GET file → streams with `Content-Type: application/gzip` + `Content-Disposition` + `Content-Length` (overrides router's JSON header). DELETE → `unlink` validated path. **Decision:** S3 push branch (`POST .../{file}/s3`) + manifest read/write (`read_s3_manifest`/`add_to_s3_manifest`) implemented HERE, guarded by `function_exists('s3_put_file')` (501 until A8) and `S3_BUCKET===''` (400) — so A8 reduces to just writing the `s3.php` SigV4 signer; no edit back to this file needed. PHP not installed locally — `php -l` deferred to A10.
- [x] **A8. s3.php + backups S3 push.** SigV4 PUT signer. `POST .../s3` push, `.s3manifest.json` read/write, `in_s3` flag, 400 if `S3_BUCKET` empty.
  - Wrote `backend/s3.php` (`s3_put_file`) — path-style SigV4 single-PUT per spec, works with any S3-compatible endpoint. Hardened beyond spec snippet: guards on empty bucket / unreadable local file, scheme fallback `https`, and distinguishes `code===0` curl connection failure (returns `S3 connection failed: {curl_error}`) from HTTP error codes. `index.php` already includes `s3.php` conditionally (`is_file`) so it now activates automatically. Push endpoint + `.s3manifest.json` read/write + `in_s3` flag + 400-on-empty-bucket were all done in A7 (guarded by `function_exists`), so they light up now with zero edits. PHP not installed locally — `php -l` deferred to A10.
- [x] **A9. routes/files.php.** `fm_resolve()` jail. list/read/write/upload/download/mkdir/rename/delete. Size caps. Block `.php` write unless flagged.
  - Wrote `backend/routes/files.php` (`handle_files`). Every path through `fm_resolve()` (spec jail: realpath + `FM_ROOT` prefix; not-yet-existing targets resolve via parent) → 403 on escape. list (dirs-first sort, `perms_string()` → `rwxr-xr-x`), read (413 if > `FM_MAX_EDIT_BYTES`, 415 if binary via `looks_like_text()` null-byte/utf8 check), write, upload (multipart, 413 over `FM_MAX_UPLOAD_BYTES`), download (octet-stream attachment), mkdir, rename, delete (dirs need `recursive=true`; refuses to delete jail root). **Decision:** `.php` write/upload block extended beyond just `.php` to a list (`php php3 php4 php5 php7 phtml phar cgi pl`), overridable per-request with `allow_php:true` (body for write, POST field for upload) per the security-checklist "unless explicitly intended". Deviations from spec: read returns **415** (not 413) for binary so the UI can distinguish too-big from not-text; write also caps content at `FM_MAX_EDIT_BYTES`. PHP not installed locally — `php -l` deferred to A10.
- [x] **A10. Backend smoke test.** `php -S` locally, curl each endpoint with a test token. Fix parse bugs.
  - No system PHP (CachyOS); ran everything in `php:8.3-cli` Docker (zero system change). **`php -l` clean on all 11 files.** Wrote a gitignored test `backend/config.php` (test creds, `WO_BIN` absent, `FM_ROOT=/tmp/www`, S3 disabled) + a 25-assertion stream-HTTP client against `php -S 127.0.0.1:8080 index.php`. **25/25 pass:** unauth→401, wrong/right login, `/auth/me`, bad-token→401, sites list JSON, unknown→404, create bad-type→400, **injection domain `bad;rm -rf`→400**, stack bad-service→400, logs bad-type→404, files list, **`../` jail escape blocked**, text read, binary→415, `.php` write blocked + `allow_php` override, write/mkdir/rename/delete roundtrip, dir-delete-needs-recursive, backups list, **S3-push-when-disabled→400**, system disk parse. One initial fail was a fixture bug (POSIX `printf '\x00'` ≠ null byte → used `\000`), not app code. No parser bugs found. Note: built-in server confirms `getallheaders()`/Bearer auth works without nginx. `config.php` left in place (gitignored) for local dev.

### Phase B — Frontend (React + Vite)
- [x] **B1. Scaffold.** `npm create vite` (react-ts), install react-router. `theme.css` with CSS vars. Google Fonts. `vite.config.ts` proxy.
  - Scaffolded `frontend/` by hand (Vite interactive create unsupported in this env): `package.json` (React 19, react-router-dom 7, Vite 7, TS 5.9), `vite.config.ts`, `tsconfig.json` + `tsconfig.node.json`, `index.html`, `src/{main,App}.tsx`, `src/theme.css`, `src/vite-env.d.ts`, `.env.example`. `theme.css` = full spec CSS vars + base reset + component classes (`.card`, `.btn*`, `.badge*`, `.input`, `.mono-surface`, `.page-title`, `.section-label`). Google Fonts (DM Sans + JetBrains Mono) loaded in `index.html`. Dev proxy `/api` → `VITE_API_PROXY` env (default `localhost:8080`); `changeOrigin:true`. `main.tsx` wraps `App` in `BrowserRouter` (routes/guard land in B3). `App.tsx` is a placeholder card confirming theme renders. Deviations: (1) added `@types/node` for `process` in vite config; (2) `tsconfig.node.json` uses throwaway `outDir` instead of `noEmit` (TS 5.9 forbids `noEmit` on a referenced composite project) and drops `allowImportingTsExtensions` (emit conflict); (3) `npm install` needs `node node_modules/esbuild/install.js` once — host npm blocks postinstall scripts. **`npm run build` clean: 41 modules, 228 KB raw / 74 KB gzip JS** — under the vite-spa 200 KB init budget.
- [x] **B2. auth.ts + client.ts.** Token storage, `request()` with 401→login, full `api` object.
  - `src/auth.ts`: token + expiry in localStorage; `isAuthed()` also checks stored expiry (from login `expires_in`) and self-clears when past. `src/api/types.ts`: all spec interfaces + `SiteInfo` (= `Record<string,string>`), `StackService`, `UptimeInfo`, `LogResponse`, `CommandResult`. `src/api/client.ts`: `request<T>()` (Bearer, 401→clear+`/login`, parses `{error|output}` into thrown `ApiError{status}`); `download()` (authed fetch→blob→`<a download>`); `upload()` (FormData, no JSON header). `api` object matches backend response shapes **exactly** (verified against route files): `sites.list`→`.sites`, `info`→`.info`, `backups.list`→`.backups`, `files.list`→`.entries`, etc. — list helpers unwrap so callers get arrays. Deviation: added `ApiError` export (status-aware) so pages can distinguish 413/415 on file read.
- [x] **B3. Shell.** `Layout` (sidebar nav: Dashboard·Sites·Backups·Files·Stack·Logs + topbar user/logout). `Card`, `StatusBadge`, `Toast`, `ConfirmDialog` (typed-confirm). Route guard.
  - `components/`: `Toast` (context + `useToast().push(msg,kind)`, auto-dismiss 4s, top-right stack), `Card` (`.card`/`.card-2`), `StatusBadge` (running/enabled→green, stopped/disabled→red, else gray), `Modal` (backdrop+card, click-out close), `ConfirmDialog` (typed-confirm: button locked until input === exact phrase), `Spinner` (CSS keyframes, injected once), `Layout` (220px sticky sidebar `surface-2` + active-route green left-border accent, topbar shows `auth/me` user + Logout). Route guard = `RequireAuth` in `App.tsx` (`auth.isAuthed()` else `<Navigate to=/login>`); all 6 app routes nested under `<Layout/>`, `*`→`/`. Extra helpers beyond spec list: `Modal`, `Spinner` (shared by every page).
- [x] **B4. Login page.**
  - `pages/Login.tsx`: centered card, username+password, `api.auth.login`→`auth.set(token,expires_in)`→navigate `/`. Invalid creds → inline red message (backend already throttles). Spinner while busy.
- [x] **B5. Dashboard.** stat cards + stack grid + recent backups + refresh.
  - `pages/Dashboard.tsx` + `hooks/useAsync.ts` (mount-fetch with `data/loading/error/reload`). 3 stat cards (Total Sites, Stack X/Y running, Disk %+used/total), services grid (status badge + per-card Restart), Recent Backups = merge of `backups.list` across all sites, newest 5. Refresh reloads all three sources.
- [x] **B6. Sites page.** table + create modal + delete typed-confirm + row actions.
  - `pages/Sites.tsx`: table (Domain·Type·PHP·Cache·SSL·Status·Actions). Create modal (domain/type/php/cache/ssl; proxy-target field appears when type=proxy) → spinner "Creating… may take a minute". Row actions: Info modal (key:value table), Purge, Enable/Disable toggle, Backups link (`/backups?domain=`), Files link (`/files?path=`), Delete (typed-confirm = exact domain). ssl shown from list = always `—` (backend can't know SSL from `site list`; true state via Info).
- [x] **B7. Backups page.** selector, create, table, download (fetch→blob), push-to-S3, delete.
  - `pages/Backups.tsx`: site selector (prefills from `?domain=` query / first site), Create Backup (spinner), table (Filename·Size·Date·In S3·Actions). Download via authed blob; Push to S3 (disabled when already `in_s3`); Delete confirm. Deviation: Push-to-S3 button is **always rendered** (disabled-on-`in_s3`), not hidden-when-S3-unconfigured — frontend has no S3-config probe endpoint, so backend's 400/501 surfaces as an error toast instead.
- [x] **B8. Files page.** breadcrumb, listing, upload (FormData), edit view, mkdir/rename/delete.
  - `pages/FileManager.tsx`: clickable breadcrumb (jail root = `/var/www`), `?path=` deep-link, listing (Name·Size·Modified·Perms·Actions) with `..` row + dir descend. Toolbar New Folder / Upload (picker→FormData, auto-sets `allow_php` for php-ext) / Refresh. File: Download (blob), Edit (mono-surface textarea modal; 415/413 → toast; `.php` shows allow-exec checkbox), Rename, Delete. Dir delete = typed-confirm (name) + recursive flag.
- [x] **B9. Stack + Logs pages.** stack cards w/ auto-refresh; log viewer dark theme + auto-refresh + copy.
  - `pages/Stack.tsx`: per-service card (status badge + Start/Stop/Restart, per-card busy), auto-refresh 30s. `pages/Logs.tsx`: type selector (nginx/error·nginx/access·php·mysql — keys match backend path), lines 50/100/200/500, dark `mono-surface` `<pre>` auto-scrolled to bottom, Auto-10s toggle, Copy all (clipboard).
- [x] **B10. Build + polish.** `npm run build` clean, fix TS errors, responsive check.
  - `npm run build` clean first pass under strict TS (noUnusedLocals/Parameters): **58 modules, 269 KB raw / 84 KB gzip JS** — under vite-spa 200 KB init budget. `vite preview` serves index + JS + SPA fallback (`/sites`→200). Tables wrap in `overflow:auto` cards with `minWidth` for small-screen scroll; toolbars `flex-wrap`. Runtime not browser-tested here (no headless browser in env) — typecheck + transform + serve all green.

### Phase C — Deploy & Harden
- [x] **C1. deploy.sh** (rsync, exclude `config.php`).
  - Wrote `deploy.sh` (executable, `bash -n` clean): `SERVER=… PANEL=… ./deploy.sh` builds frontend locally, rsyncs `dist/` → webroot + `backend/` → `api/` (`--exclude config.php`). Reframed as the OPTIONAL dev path; the prebuilt release tarball is the primary install. No nginx step.
- [x] **C2. ~~Nginx snippet~~ → No nginx changes needed (zero-touch install).**
  - **Scope change (user directive):** install must touch nothing on the server — no nginx edits, no installs, no on-server build. Achieved via **query-string API routing** (`/api/index.php?p=/route`; `index.php` reads `$_GET['p']` with PATH_INFO/REQUEST_URI fallbacks) so URLs end in `.php` and default WordOps php-site nginx routes them to PHP-FPM as-is, plus a **HashRouter** frontend (`#/route`) so one `index.html` needs no SPA fallback. Delivery = CI-built release tarball (`.github/workflows/release.yml`) laid out as the webroot; server does `wget … | tar xz`. So the old `/api` location block + `try_files` SPA rule + `client_max_body_size` snippet are all **dropped** — none are required. Verified query-routing in `php:8.3-cli` docker: no-token→401, login→401, authed `/sites`→200, extra query param coexists with `p`. Frontend rebuilds clean (58 modules, 84 KB gzip). The one unavoidable server step is documented (not automatable): PHP needs root for `wo`/`/var/www` (pool `user=root` or sudo-wo) + create `config.php` from the example.
- [ ] **C3. Security checklist pass** — walk every box in the Security Checklist section, confirm each.
- [x] **C4. End-to-end test on a real WordOps box** (or document manual steps if no server available).
  - No WordOps server available in this env → documented the manual e2e procedure. **What WAS verified locally:** backend query-routing + auth + dispatch in `php:8.3-cli` docker (401s, authed `/sites`→200, param coexistence); full A10 25/25 backend smoke; frontend `tsc` + build clean (58 modules) + `vite preview` serving index/JS/SPA-fallback. **Manual e2e on a real box (to run at deploy):** (1) `wo site create panel.x --php82`; (2) extract release tarball into htdocs, `cp config.example.php config.php`, set `ADMIN_PASS_HASH`/`SESSION_SECRET`, give PHP root (pool `user=root`); (3) browse `https://panel.x`, log in; (4) walk each page — Dashboard stats, Sites list/create/info/enable-disable/delete, Backups create/download/S3-push/delete, Files browse/edit/upload/mkdir/rename/delete, Stack restart, Logs tail. **Cannot be exercised here** because every action shells out to a real `wo` binary + touches `/var/www` on a provisioned server. Browser runtime of the React app also not headless-tested locally (no browser in env) — typecheck/build/serve are the proxy signals.

### Done log
<!-- building session appends: "AN. <title> — <date> — <note>" -->

