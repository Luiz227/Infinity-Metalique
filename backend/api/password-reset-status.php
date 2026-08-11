<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('POST');
$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);

$email = normalizeEmail((string) ($data['email'] ?? ''));
$requestToken = (string) ($data['requestToken'] ?? '');
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-f0-9]{64}$/', $requestToken)) {
    jsonResponse(['status' => 'invalid']);
}

try {
    $query = database()->prepare(
        'SELECT request.status, request.expires_at
           FROM password_reset_requests request
           JOIN users user ON user.id = request.user_id
          WHERE user.email = :email
            AND request.request_token_hash = :request_token_hash
          ORDER BY request.id DESC
          LIMIT 1'
    );
    $query->execute([
        'email' => $email,
        'request_token_hash' => hash('sha256', $requestToken),
    ]);
    $request = $query->fetch();
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível consultar a solicitação.'], 503);
}

if (!$request) {
    jsonResponse(['status' => 'invalid']);
}

$status = (string) $request['status'];
if ($status === 'approved' && (!is_string($request['expires_at']) || strtotime($request['expires_at']) <= time())) {
    $status = 'expired';
}

jsonResponse(['status' => $status]);
