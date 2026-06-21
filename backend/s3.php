<?php
// AWS Signature V4 PUT uploader. Pure PHP, no SDK, no Composer.
// Works with any S3-compatible endpoint (AWS, B2, Wasabi, MinIO, Spaces).
// Single-PUT path (max 5 GB); fine for typical site backups.

// Upload a local file to S3 under S3_PREFIX. Returns [ok, key|error].
function s3_put_file(string $localPath, string $key): array {
    if (S3_BUCKET === '') return ['ok' => false, 'error' => 'S3 not configured'];
    if (!is_file($localPath)) return ['ok' => false, 'error' => 'Local file not found'];

    $host    = parse_url(S3_ENDPOINT, PHP_URL_HOST);
    $scheme  = parse_url(S3_ENDPOINT, PHP_URL_SCHEME) ?: 'https';
    $fullKey = S3_PREFIX . $key;
    $body    = file_get_contents($localPath);
    if ($body === false) return ['ok' => false, 'error' => 'Could not read local file'];
    $payloadHash = hash('sha256', $body);

    $now  = gmdate('Ymd\THis\Z');
    $date = gmdate('Ymd');
    // path-style: /{bucket}/{key}; encode each segment but keep '/' separators
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
    $err  = curl_error($ch);
    curl_close($ch);

    if ($code >= 200 && $code < 300) return ['ok' => true, 'key' => $fullKey];
    if ($code === 0) return ['ok' => false, 'error' => "S3 connection failed: $err"];
    return ['ok' => false, 'error' => "S3 $code: $resp"];
}
