<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('GET');
$user = requireApiUser();
$term = trim((string) ($_GET['q'] ?? ''));

if (mb_strlen($term) < 2) {
    jsonResponse(['results' => []]);
}

$like = '%' . $term . '%';
$results = [];

try {
    if (userHasPermission($user, 'quality.view')) {
        $reports = database()->prepare(
            "SELECT r.id, r.code, r.description, c.name AS client
             FROM inspection_reports r
             LEFT JOIN clients c ON c.id = r.client_id
             WHERE r.code LIKE :term_code OR r.description LIKE :term_description OR c.name LIKE :term_client
             ORDER BY r.report_date DESC, r.sequence DESC LIMIT 6"
        );
        $reports->execute([
            'term_code' => $like,
            'term_description' => $like,
            'term_client' => $like,
        ]);
        foreach ($reports->fetchAll() as $row) {
            $results[] = [
                'id' => 'report-' . $row['id'],
                'title' => (string) $row['code'],
                'subtitle' => trim((string) ($row['client'] ?: $row['description'])),
                'route' => '/qualidade',
                'tab' => 'registros',
                'type' => 'RAP',
            ];
        }

        $dispatches = database()->prepare(
            "SELECT d.id, d.code, d.model, c.name AS client
             FROM machine_dispatches d
             LEFT JOIN clients c ON c.id = d.client_id
             WHERE d.code LIKE :term_code OR d.model LIKE :term_model OR c.name LIKE :term_client
             ORDER BY d.dispatch_date DESC, d.sequence DESC LIMIT 6"
        );
        $dispatches->execute([
            'term_code' => $like,
            'term_model' => $like,
            'term_client' => $like,
        ]);
        foreach ($dispatches->fetchAll() as $row) {
            $results[] = [
                'id' => 'dispatch-' . $row['id'],
                'title' => (string) $row['code'],
                'subtitle' => trim((string) ($row['client'] ?: $row['model'])),
                'route' => '/qualidade',
                'tab' => 'coletas',
                'type' => 'Produto coletado',
            ];
        }
    }

    if (userHasPermission($user, 'users.manage')) {
        $users = database()->prepare(
            'SELECT id, name, email, job_title FROM users
             WHERE name LIKE :term_name OR email LIKE :term_email OR job_title LIKE :term_job
             ORDER BY name LIMIT 6'
        );
        $users->execute([
            'term_name' => $like,
            'term_email' => $like,
            'term_job' => $like,
        ]);
        foreach ($users->fetchAll() as $row) {
            $results[] = [
                'id' => 'user-' . $row['id'],
                'title' => (string) $row['name'],
                'subtitle' => (string) $row['email'],
                'route' => '/usuarios',
                'tab' => null,
                'type' => (string) $row['job_title'],
            ];
        }
    }
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível realizar a pesquisa.'], 503);
}

jsonResponse(['results' => array_slice($results, 0, 12)]);
