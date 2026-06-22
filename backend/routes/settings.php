<?php
// Routes: /settings*   (auth required)
//   GET  /settings/s3       -> current S3 config (secret masked)
//   POST /settings/s3       -> save S3 config { endpoint, region, bucket, key, secret, prefix }
//   GET  /settings/account  -> { user, email }
//   POST /settings/account  -> change email and/or password { email?, password?, current_password }

function settings_out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function handle_settings(string $method, array $parts): void {
    $sub = $parts[1] ?? '';

    // --- S3 ---
    if ($sub === 's3') {
        if ($method === 'GET') {
            settings_out([
                'endpoint'    => s3_cfg('endpoint', 'https://s3.us-east-1.amazonaws.com'),
                'region'      => s3_cfg('region', 'us-east-1'),
                'bucket'      => s3_cfg('bucket'),
                'key'         => s3_cfg('key'),
                'prefix'      => s3_cfg('prefix', 'wordops-backups/'),
                'has_secret'  => s3_cfg('secret') !== '',   // never return the secret itself
                'enabled'     => s3_enabled(),
            ]);
        }
        if ($method === 'POST') {
            $b = json_decode((string) file_get_contents('php://input'), true) ?? [];
            $patch = [
                's3_endpoint' => trim((string) ($b['endpoint'] ?? '')),
                's3_region'   => trim((string) ($b['region'] ?? '')),
                's3_bucket'   => trim((string) ($b['bucket'] ?? '')),
                's3_key'      => trim((string) ($b['key'] ?? '')),
                's3_prefix'   => trim((string) ($b['prefix'] ?? '')),
            ];
            // only overwrite the secret when a non-empty one is supplied
            if (isset($b['secret']) && $b['secret'] !== '') $patch['s3_secret'] = (string) $b['secret'];
            // explicit clear
            if (!empty($b['clear_secret'])) $patch['s3_secret'] = '';

            if ($patch['s3_endpoint'] !== '' && !filter_var($patch['s3_endpoint'], FILTER_VALIDATE_URL)) {
                settings_out(['error' => 'Invalid endpoint URL'], 400);
            }
            $ok = setting_put($patch);
            settings_out(['ok' => $ok, 'enabled' => s3_enabled()], $ok ? 200 : 500);
        }
        settings_out(['error' => 'Method not allowed'], 405);
    }

    // --- account ---
    if ($sub === 'account') {
        if ($method === 'GET') {
            settings_out(['user' => admin_user(), 'email' => setting('admin_email', '')]);
        }
        if ($method === 'POST') {
            $b = json_decode((string) file_get_contents('php://input'), true) ?? [];
            // require current password to change anything
            if (!password_verify((string) ($b['current_password'] ?? ''), admin_hash())) {
                settings_out(['error' => 'Current password incorrect'], 403);
            }
            $patch = [];
            if (isset($b['email'])) {
                $email = trim((string) $b['email']);
                if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) settings_out(['error' => 'Invalid email'], 400);
                $patch['admin_email'] = $email;
            }
            if (isset($b['password']) && $b['password'] !== '') {
                if (strlen((string) $b['password']) < 8) settings_out(['error' => 'Password must be at least 8 characters'], 400);
                $patch['admin_pass_hash'] = password_hash((string) $b['password'], PASSWORD_DEFAULT);
            }
            if (!$patch) settings_out(['error' => 'Nothing to change'], 400);
            $ok = setting_put($patch);
            settings_out(['ok' => $ok], $ok ? 200 : 500);
        }
        settings_out(['error' => 'Method not allowed'], 405);
    }

    settings_out(['error' => 'Not found'], 404);
}
