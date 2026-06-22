<?php
// Routes: /sites/{domain}/backups*
//   GET    /sites/{domain}/backups            -> scan backup dir
//   POST   /sites/{domain}/backups            -> wo site backup {domain}
//   GET    /sites/{domain}/backups/{file}     -> stream file (application/gzip)
//   DELETE /sites/{domain}/backups/{file}     -> unlink (path-validated)
//   POST   /sites/{domain}/backups/{file}/s3  -> push to S3 (needs s3.php / A8)

const S3_MANIFEST = '.s3manifest.json';

function backups_out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// Resolve a backup file path and confirm it stays inside the site's backup dir.
function safe_backup_path(string $domain, string $filename): string|false {
    $base = WEBROOT_BASE . '/' . $domain . '/backup/';
    $path = realpath($base . basename($filename));
    if (!$path || !str_starts_with($path, $base)) return false;
    return $path;
}

// Read the S3 manifest (list of filenames already pushed). Best-effort.
function read_s3_manifest(string $domain): array {
    $f = WEBROOT_BASE . '/' . $domain . '/backup/' . S3_MANIFEST;
    if (!is_file($f)) return [];
    $d = json_decode((string) @file_get_contents($f), true);
    return is_array($d) ? $d : [];
}

function add_to_s3_manifest(string $domain, string $filename): void {
    $f = WEBROOT_BASE . '/' . $domain . '/backup/' . S3_MANIFEST;
    $list = read_s3_manifest($domain);
    if (!in_array($filename, $list, true)) $list[] = $filename;
    @file_put_contents($f, json_encode(array_values($list)), LOCK_EX);
}

function handle_backups(string $method, array $parts): void {
    $domain = validate_domain($parts[1] ?? '');
    $file   = $parts[3] ?? '';
    $action = $parts[4] ?? '';
    $dir    = WEBROOT_BASE . '/' . $domain . '/backup/';

    // collection: /sites/{domain}/backups
    if ($file === '') {
        if ($method === 'GET') {
            $pushed = read_s3_manifest($domain);
            $items = [];
            foreach (glob($dir . '*') ?: [] as $p) {
                if (!is_file($p)) continue;
                $name = basename($p);
                if ($name === S3_MANIFEST || $name[0] === '.') continue;   // hide dotfiles
                $items[] = [
                    'filename'   => $name,
                    'size_mb'    => round(filesize($p) / 1048576, 2),
                    'created_at' => filemtime($p),
                    'in_s3'      => in_array($name, $pushed, true),
                ];
            }
            usort($items, fn($a, $b) => $b['created_at'] <=> $a['created_at']);
            backups_out(['backups' => $items]);
        }
        if ($method === 'POST') {
            $r = wo_exec(['site', 'backup', $domain]);
            backups_out(cmd_response($r), $r['ok'] ? 200 : 500);
        }
        backups_out(['error' => 'Method not allowed'], 405);
    }

    // item: a specific backup file
    $path = safe_backup_path($domain, $file);

    // POST .../{file}/s3  -> push
    if ($action === 's3' && $method === 'POST') {
        if (S3_BUCKET === '') backups_out(['error' => 'S3 not configured'], 400);
        if (!function_exists('s3_put_file')) backups_out(['error' => 'S3 support not installed'], 501);
        if ($path === false || !is_file($path)) backups_out(['error' => 'Backup not found'], 404);
        $key = $domain . '/' . basename($file);
        $res = s3_put_file($path, $key);
        if (!empty($res['ok'])) {
            add_to_s3_manifest($domain, basename($file));
            backups_out(['ok' => true, 'key' => $res['key']]);
        }
        backups_out(['ok' => false, 'error' => $res['error'] ?? 'S3 upload failed'], 502);
    }

    if ($path === false || !is_file($path)) backups_out(['error' => 'Backup not found'], 404);

    // GET .../{file} -> stream
    if ($method === 'GET') {
        header('Content-Type: application/gzip');
        header('Content-Disposition: attachment; filename="' . basename($path) . '"');
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }

    // DELETE .../{file}
    if ($method === 'DELETE') {
        $ok = @unlink($path);
        backups_out(['ok' => $ok], $ok ? 200 : 500);
    }

    backups_out(['error' => 'Method not allowed'], 405);
}
