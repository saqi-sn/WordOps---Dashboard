<?php
// AWS Signature V4 PUT uploader. Pure PHP, no SDK, no Composer.
// Works with any S3-compatible endpoint (AWS, B2, Wasabi, MinIO, Spaces).
// Single-PUT path (max 5 GB); fine for typical site backups.

// Upload a local file to S3 under the configured prefix. Returns [ok, key|error].
// Config comes from the settings store (Settings page) with config.php fallback.
function s3_put_file(string $localPath, string $key): array {
    $bucket   = s3_cfg('bucket');
    $endpoint = s3_cfg('endpoint', 'https://s3.us-east-1.amazonaws.com');
    $region   = s3_cfg('region', 'us-east-1');
    $accessId = s3_cfg('key');
    $secret   = s3_cfg('secret');
    $prefix   = s3_cfg('prefix');
    if ($bucket === '') return ['ok' => false, 'error' => 'S3 not configured'];
    if (!is_file($localPath)) return ['ok' => false, 'error' => 'Local file not found'];

    $host    = parse_url($endpoint, PHP_URL_HOST);
    $scheme  = parse_url($endpoint, PHP_URL_SCHEME) ?: 'https';
    $fullKey = $prefix . $key;
    $body    = file_get_contents($localPath);
    if ($body === false) return ['ok' => false, 'error' => 'Could not read local file'];
    $payloadHash = hash('sha256', $body);

    $now  = gmdate('Ymd\THis\Z');
    $date = gmdate('Ymd');
    // path-style: /{bucket}/{key}; encode each segment but keep '/' separators
    $canonicalUri = '/' . $bucket . '/' . str_replace('%2F', '/', rawurlencode($fullKey));

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
    $scope = "$date/" . $region . "/s3/aws4_request";
    $stringToSign = "AWS4-HMAC-SHA256\n$now\n$scope\n" . hash('sha256', $canonicalRequest);

    $kDate    = hash_hmac('sha256', $date, 'AWS4' . $secret, true);
    $kRegion  = hash_hmac('sha256', $region, $kDate, true);
    $kService = hash_hmac('sha256', 's3', $kRegion, true);
    $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true);
    $signature = hash_hmac('sha256', $stringToSign, $kSigning);

    $authz = "AWS4-HMAC-SHA256 Credential=" . $accessId . "/$scope, "
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
    $err  = curl_error($ch);
    curl_close($ch);

    if ($code >= 200 && $code < 300) return ['ok' => true, 'key' => $fullKey];
    if ($code === 0) return ['ok' => false, 'error' => "S3 connection failed: $err"];
    return ['ok' => false, 'error' => "S3 $code: $resp"];
}
