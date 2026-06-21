<?php
// Routes: /files*   — jailed file manager. EVERY path goes through fm_resolve();
// nothing outside FM_ROOT is ever reachable (no '..', no symlink escape).
//   GET    /files/list?path={rel}
//   GET    /files/read?path={rel}
//   POST   /files/write          { path, content, allow_php? }
//   POST   /files/upload         (multipart: file + path=dir, allow_php?)
//   GET    /files/download?path={rel}
//   POST   /files/mkdir          { path }
//   POST   /files/rename         { from, to }
//   DELETE /files?path={rel}&recursive=bool

// Executable extensions blocked from write/upload unless explicitly allowed.
const FM_BLOCKED_EXT = ['php', 'php3', 'php4', 'php5', 'php7', 'phtml', 'phar', 'cgi', 'pl'];

function files_out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// Resolve a client-supplied relative path into an absolute path inside FM_ROOT.
// Returns false on any escape attempt. For not-yet-existing targets
// (write/mkdir/rename-to) the PARENT must exist and be inside the jail.
function fm_resolve(string $rel): string|false {
    $candidate = FM_ROOT . '/' . ltrim($rel, '/');
    $real = realpath($candidate);
    if ($real === false) {
        $parent = realpath(dirname($candidate));
        if ($parent === false || !str_starts_with($parent, FM_ROOT)) return false;
        return $parent . '/' . basename($candidate);
    }
    if (!str_starts_with($real, FM_ROOT)) return false;
    return $real;
}

// "rwxr-xr-x" (9 chars, owner/group/other) from a path.
function perms_string(string $p): string {
    $m = fileperms($p);
    $rwx = '';
    $bits = [0400,0200,0100, 0040,0020,0010, 0004,0002,0001];
    $chars = ['r','w','x','r','w','x','r','w','x'];
    foreach ($bits as $i => $bit) $rwx .= ($m & $bit) ? $chars[$i] : '-';
    return $rwx;
}

function looks_like_text(string $s): bool {
    if (str_contains($s, "\0")) return false;
    return mb_check_encoding($s, 'UTF-8') || mb_check_encoding($s, 'ASCII');
}

// Block executable uploads/writes into the webroot unless explicitly allowed.
function fm_ext_blocked(string $name): bool {
    return in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), FM_BLOCKED_EXT, true);
}

function rrmdir(string $path): bool {
    if (is_file($path) || is_link($path)) return @unlink($path);
    foreach (scandir($path) ?: [] as $e) {
        if ($e === '.' || $e === '..') continue;
        rrmdir($path . '/' . $e);
    }
    return @rmdir($path);
}

function fm_body(): array {
    return json_decode((string) file_get_contents('php://input'), true) ?? [];
}

function handle_files(string $method, array $parts): void {
    $action = $parts[1] ?? '';

    // DELETE /files?path=...&recursive=...
    if ($method === 'DELETE') {
        $real = fm_resolve((string) ($_GET['path'] ?? ''));
        if ($real === false || !file_exists($real)) files_out(['error' => 'Path not found'], 404);
        if ($real === realpath(FM_ROOT)) files_out(['error' => 'Refusing to delete jail root'], 400);
        if (is_dir($real)) {
            $recursive = ($_GET['recursive'] ?? 'false') === 'true';
            if (!$recursive) files_out(['error' => 'Directory requires recursive=true'], 400);
            files_out(['ok' => rrmdir($real)]);
        }
        files_out(['ok' => @unlink($real)]);
    }

    if ($method === 'GET') {
        switch ($action) {
            case 'list':
                $real = fm_resolve((string) ($_GET['path'] ?? ''));
                if ($real === false || !is_dir($real)) files_out(['error' => 'Not a directory'], 404);
                $entries = [];
                foreach (scandir($real) ?: [] as $name) {
                    if ($name === '.' || $name === '..') continue;
                    $full = $real . '/' . $name;
                    $isDir = is_dir($full);
                    $entries[] = [
                        'name'  => $name,
                        'type'  => $isDir ? 'dir' : 'file',
                        'size'  => $isDir ? 0 : (int) @filesize($full),
                        'mtime' => (int) @filemtime($full),
                        'perms' => perms_string($full),
                    ];
                }
                // dirs first, then alpha
                usort($entries, fn($a, $b) =>
                    ($b['type'] === 'dir') <=> ($a['type'] === 'dir') ?: strcasecmp($a['name'], $b['name']));
                files_out(['entries' => $entries]);

            case 'read':
                $real = fm_resolve((string) ($_GET['path'] ?? ''));
                if ($real === false || !is_file($real)) files_out(['error' => 'File not found'], 404);
                if (filesize($real) > FM_MAX_EDIT_BYTES) files_out(['error' => 'File too large to edit'], 413);
                $content = (string) file_get_contents($real);
                if (!looks_like_text($content)) files_out(['error' => 'Binary file; not editable'], 415);
                files_out(['content' => $content]);

            case 'download':
                $real = fm_resolve((string) ($_GET['path'] ?? ''));
                if ($real === false || !is_file($real)) files_out(['error' => 'File not found'], 404);
                header('Content-Type: application/octet-stream');
                header('Content-Disposition: attachment; filename="' . basename($real) . '"');
                header('Content-Length: ' . filesize($real));
                readfile($real);
                exit;
        }
        files_out(['error' => 'Not found'], 404);
    }

    if ($method === 'POST') {
        switch ($action) {
            case 'write': {
                $b = fm_body();
                $rel = (string) ($b['path'] ?? '');
                $content = (string) ($b['content'] ?? '');
                $allowPhp = !empty($b['allow_php']);
                $real = fm_resolve($rel);
                if ($real === false) files_out(['error' => 'Path outside jail'], 403);
                if (is_dir($real)) files_out(['error' => 'Path is a directory'], 400);
                if (strlen($content) > FM_MAX_EDIT_BYTES) files_out(['error' => 'Content too large'], 413);
                if (!$allowPhp && fm_ext_blocked($real)) files_out(['error' => 'Executable file type blocked (set allow_php to override)'], 403);
                $ok = @file_put_contents($real, $content) !== false;
                files_out(['ok' => $ok], $ok ? 200 : 500);
            }

            case 'upload': {
                $dirReal = fm_resolve((string) ($_POST['path'] ?? ''));
                if ($dirReal === false || !is_dir($dirReal)) files_out(['error' => 'Target dir not found'], 404);
                if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                    files_out(['error' => 'No file uploaded'], 400);
                }
                $f = $_FILES['file'];
                if ($f['size'] > FM_MAX_UPLOAD_BYTES) files_out(['error' => 'File exceeds upload cap'], 413);
                $name = basename($f['name']);
                $allowPhp = !empty($_POST['allow_php']);
                if (!$allowPhp && fm_ext_blocked($name)) files_out(['error' => 'Executable upload blocked (set allow_php to override)'], 403);
                $dest = fm_resolve(rtrim((string) ($_POST['path'] ?? ''), '/') . '/' . $name);
                if ($dest === false) files_out(['error' => 'Path outside jail'], 403);
                $ok = move_uploaded_file($f['tmp_name'], $dest);
                files_out(['ok' => $ok, 'name' => $name], $ok ? 200 : 500);
            }

            case 'mkdir': {
                $real = fm_resolve((string) (fm_body()['path'] ?? ''));
                if ($real === false) files_out(['error' => 'Path outside jail'], 403);
                if (file_exists($real)) files_out(['error' => 'Already exists'], 409);
                $ok = @mkdir($real, 0755, true);
                files_out(['ok' => $ok], $ok ? 200 : 500);
            }

            case 'rename': {
                $b = fm_body();
                $from = fm_resolve((string) ($b['from'] ?? ''));
                $to   = fm_resolve((string) ($b['to'] ?? ''));
                if ($from === false || !file_exists($from)) files_out(['error' => 'Source not found'], 404);
                if ($to === false) files_out(['error' => 'Target outside jail'], 403);
                if (file_exists($to)) files_out(['error' => 'Target already exists'], 409);
                $ok = @rename($from, $to);
                files_out(['ok' => $ok], $ok ? 200 : 500);
            }
        }
        files_out(['error' => 'Not found'], 404);
    }

    files_out(['error' => 'Method not allowed'], 405);
}
