<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';

requireApiMethod('GET');
requireApiPermission('users.manage');

try {
    $connection = database();
    $rows = $connection->query(
        'SELECT id, name, email, job_title, role, is_primary_admin, is_active,
                profile_photo, created_at
         FROM users
         ORDER BY is_primary_admin DESC, name ASC'
    )->fetchAll();

    $permissionsByUser = [];
    foreach ($connection->query('SELECT user_id, permission FROM user_permissions ORDER BY permission') as $row) {
        $permissionsByUser[(int) $row['user_id']][] = (string) $row['permission'];
    }

    $allPermissions = array_keys(systemPermissions());
    $users = array_map(static function (array $row) use ($permissionsByUser, $allPermissions): array {
        $role = (string) $row['role'];
        return [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'email' => (string) $row['email'],
            'job_title' => (string) $row['job_title'],
            'role' => $role,
            'is_primary_admin' => (bool) $row['is_primary_admin'],
            'is_active' => (bool) $row['is_active'],
            'profile_photo' => $row['profile_photo'] ? (string) $row['profile_photo'] : null,
            'created_at' => (string) $row['created_at'],
            'permissions' => $role === 'admin'
                ? $allPermissions
                : ($permissionsByUser[(int) $row['id']] ?? []),
        ];
    }, $rows);

    $definitions = [];
    foreach (systemPermissions() as $key => $definition) {
        $definitions[] = ['key' => $key] + $definition;
    }
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível carregar os usuários.'], 503);
}

jsonResponse(['users' => $users, 'permissions' => $definitions]);
