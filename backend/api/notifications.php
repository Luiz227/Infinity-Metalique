<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('GET');
$user = requireApiUser();
$items = [];

try {
    if (($user['role'] ?? '') === 'admin') {
        $passwordRequests = database()->query(
            "SELECT request.id, account.name, account.email, request.created_at
               FROM password_reset_requests request
               JOIN users account ON account.id = request.user_id
              WHERE request.status = 'pending'
              ORDER BY request.created_at DESC
              LIMIT 6"
        );

        foreach ($passwordRequests->fetchAll() as $request) {
            $items[] = [
                'id' => 'password-reset-' . (int) $request['id'],
                'title' => (string) $request['name'] . ' esqueceu a senha',
                'description' => (string) $request['email'] . ' solicitou autorização para cadastrar uma nova senha.',
                'createdAt' => date(DATE_ATOM, strtotime((string) $request['created_at'])),
                'route' => '/usuarios',
                'tab' => null,
                'kind' => 'password-reset',
                'requestId' => (int) $request['id'],
            ];
        }

        $requests = database()->query(
            "SELECT id, name, sector, job_title, admission_date, created_at
               FROM access_requests
              WHERE status = 'pending'
              ORDER BY created_at DESC
              LIMIT 6"
        );

        foreach ($requests->fetchAll() as $request) {
            $admissionDate = !empty($request['admission_date'])
                ? date('d/m/Y', strtotime((string) $request['admission_date']))
                : 'não informada';
            $items[] = [
                'id' => 'access-request-' . (int) $request['id'],
                'title' => 'Solicitação de ' . (string) $request['name'],
                'description' => sprintf(
                    '%s · %s · Admissão: %s',
                    (string) ($request['sector'] ?: 'Setor não informado'),
                    (string) ($request['job_title'] ?: 'Cargo não informado'),
                    $admissionDate
                ),
                'createdAt' => date(DATE_ATOM, strtotime((string) $request['created_at'])),
                'route' => '/usuarios',
                'tab' => null,
            ];
        }
    }

    if (userHasPermission($user, 'quality.view')) {
        // Notifica somente RAPs criados por outra pessoa da Qualidade. Registros
        // importados, sem autor, e ações do próprio usuário não geram aviso.
        $query = database()->prepare(
            "SELECT CONCAT('report-', report.id) AS id,
                    CONCAT('Novo ', report.code) AS title,
                    CONCAT(creator.name, ' registrou este RAP.') AS description,
                    report.created_at, '/qualidade' AS route, 'registros' AS tab
               FROM inspection_reports report
               JOIN users creator
                 ON creator.id = report.created_by_user_id
                AND creator.is_active = 1
              WHERE report.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                AND report.created_by_user_id <> :current_user_id
                AND (
                    creator.role = 'admin'
                    OR EXISTS (
                        SELECT 1
                          FROM user_permissions permission
                         WHERE permission.user_id = creator.id
                           AND permission.permission IN ('quality.view', 'quality.manage')
                    )
                )
              ORDER BY report.created_at DESC
              LIMIT 6"
        );
        $query->execute(['current_user_id' => (int) $user['id']]);
        foreach ($query->fetchAll() as $row) {
            $items[] = [
                'id' => (string) $row['id'],
                'title' => (string) $row['title'],
                'description' => (string) $row['description'],
                'createdAt' => date(DATE_ATOM, strtotime((string) $row['created_at'])),
                'route' => (string) $row['route'],
                'tab' => (string) $row['tab'],
            ];
        }
    }

    usort($items, static fn (array $left, array $right): int =>
        strcmp((string) $right['createdAt'], (string) $left['createdAt'])
    );
    $items = array_slice($items, 0, 8);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível carregar as notificações.'], 503);
}

jsonResponse(['notifications' => $items]);
