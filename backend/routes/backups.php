<?php
// Routes: /sites/{domain}/backups*
//   GET    /sites/{domain}/backups            -> list our backups
//   POST   /sites/{domain}/backups            -> create one  { kind: "db" | "files" }
//   GET    /sites/{domain}/backups/{file}     -> stream file (download)
//   DELETE /sites/{domain}/backups/{file}     -> unlink (path-validated)
//   POST   /sites/{domain}/backups/{file}/s3  -> push to S3
//
// Backups live OUTSIDE the site webroot, in /var/www/backups/{domain}/.
// WordOps' own `wo site backup` only snapshots config files, so we roll our own:
//   db    -> wp db export | gzip      -> db-<ts>.sql.gz
//   files -> tar czf htdocs           -> files-<ts>.tar.gz

const S3_MANIFEST = '.s3manifest.json';

function backups_out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function backup_dir(string $domain): string {
    return WEBROOT_BASE . '/backups/' . $domain . '/';
}

// Resolve a backup file path and confirm it stays inside the site's backup dir.
function safe_backup_path(string $domain, string $filename): string|false {
    $base = backup_dir($domain);
    $real = realpath($base . basename($filename));
    if (!$real || !str_starts_with($real, realpath($base) ?: $base)) return false;
    return $real;
}

function read_s3_manifest(string $domain): array {
    $f = backup_dir($domain) . S3_MANIFEST;
    if (!is_file($f)) return [];
    $d = json_decode((string) @file_get_contents($f), true);
    return is_array($d) ? $d : [];
}

function add_to_s3_manifest(string $domain, string $filename): void {
    $f = backup_dir($domain) . S3_MANIFEST;
    $list = read_s3_manifest($domain);
    if (!in_array($filename, $list, true)) $list[] = $filename;
    @file_put_contents($f, json_encode(array_values($list)), LOCK_EX);
}

// classify a backup file by name
function backup_kind(string $name): string {
    if (str_starts_with($name, 'db-'))    return 'database';
    if (str_starts_with($name, 'files-')) return 'files';
    return 'other';
}

function wp_bin(): string {
    return is_file('/usr/local/bin/wp') ? '/usr/local/bin/wp' : 'wp';
}

function handle_backups(string $method, array $parts): void {
    $domain = validate_domain($parts[1] ?? '');
    $file   = $parts[3] ?? '';
    $action = $parts[4] ?? '';
    $dir    = backup_dir($domain);

    // collection: /sites/{domain}/backups
    if ($file === '') {
        if ($method === 'GET') {
            $pushed = read_s3_manifest($domain);
            $items = [];
            foreach (glob($dir . '*') ?: [] as $p) {
                if (!is_file($p)) continue;
                $name = basename($p);
                if ($name[0] === '.') continue;            // hide dotfiles/manifest
                $items[] = [
                    'filename'   => $name,
                    'kind'       => backup_kind($name),
                    'size_mb'    => round(filesize($p) / 1048576, 2),
                    'created_at' => filemtime($p),
                    'in_s3'      => in_array($name, $pushed, true),
                ];
            }
            usort($items, fn($a, $b) => $b['created_at'] <=> $a['created_at']);
            backups_out(['backups' => $items]);
        }
        if ($method === 'POST') {
            @mkdir($dir, 0775, true);
            if (!is_dir($dir)) backups_out(['error' => 'Could not create backup dir ' . $dir], 500);
            set_time_limit(0);
            $body = json_decode((string) file_get_contents('php://input'), true) ?? [];
            $kind = $body['kind'] ?? '';
            $ts   = gmdate('Ymd-His');
            $htdocs = WEBROOT_BASE . '/' . $domain . '/htdocs';

            if ($kind === 'db') {
                if (!is_dir($htdocs)) backups_out(['error' => 'No htdocs for this site'], 400);
                $sql = $dir . 'db-' . $ts . '.sql';
                $r = sh_exec([wp_bin(), 'db', 'export', $sql, '--path=' . $htdocs, '--quiet']);
                if (!$r['ok'] || !is_file($sql)) {
                    backups_out(cmd_response($r, ['error' => 'DB export failed: ' . ($r['output'] ?: 'wp db export')]), 500);
                }
                $g = sh_exec(['gzip', '-f', $sql]);
                backups_out(['ok' => true, 'file' => 'db-' . $ts . '.sql.gz', 'output' => 'Database backup created'] + (!$g['ok'] ? ['warning' => 'gzip failed; stored uncompressed'] : []));
            }

            if ($kind === 'files') {
                if (!is_dir($htdocs)) backups_out(['error' => 'No htdocs for this site'], 400);
                $tgz = $dir . 'files-' . $ts . '.tar.gz';
                $r = sh_exec(['tar', '-czf', $tgz, '-C', WEBROOT_BASE . '/' . $domain, 'htdocs']);
                if (!$r['ok'] || !is_file($tgz)) {
                    backups_out(cmd_response($r, ['error' => 'Files backup failed: ' . ($r['output'] ?: 'tar')]), 500);
                }
                backups_out(['ok' => true, 'file' => 'files-' . $ts . '.tar.gz', 'output' => 'Files backup created']);
            }

            backups_out(['error' => 'Unknown backup kind (expected "db" or "files")'], 400);
        }
        backups_out(['error' => 'Method not allowed'], 405);
    }

    // item: a specific backup file
    $path = safe_backup_path($domain, $file);

    // POST .../{file}/s3  -> push
    if ($action === 's3' && $method === 'POST') {
        if (!s3_enabled()) backups_out(['error' => 'S3 not configured'], 400);
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
