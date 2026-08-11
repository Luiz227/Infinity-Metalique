<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';

requireApiMethod('POST');
$administrator = requireApiPermission('users.manage');
$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);

$id = max(0, (int) ($data['id'] ?? 0));
$name = normalizeName((string) ($data['name'] ?? ''));
$email = normalizeEmail((string) ($data['email'] ?? ''));
$jobTitle = normalizeName((string) ($data['jobTitle'] ?? ''));
$sector = normalizeName((string) ($data['sector'] ?? ''));
$role = (string) ($data['role'] ?? 'user');
$password = (string) ($data['password'] ?? '');
$isActive = filter_var($data['isActive'] ?? true, FILTER_VALIDATE_BOOL);
$submittedPermissions = is_array($data['permissions'] ?? null) ? $data['permissions'] : [];
$permissions = array_values(array_unique(array_intersect(
    array_map('strval', $submittedPermissions),
    array_keys(systemPermissions())
)));
$qualitySections = [
    'quality.raps',
    'quality.units',
    'quality.products',
    'quality.dispatches',
    'quality.employees',
    'quality.satisfaction',
    'quality.records',
];

if (strlen($name) < 3 || strlen($name) > 120) {
    jsonResponse(['message' => 'Informe um nome válido de 3 a 120 caracteres.'], 422);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
    jsonResponse(['message' => 'Informe um e-mail válido.'], 422);
}

if (strlen($jobTitle) < 2 || strlen($jobTitle) > 100) {
    jsonResponse(['message' => 'Informe um cargo válido.'], 422);
}

if (!in_array($role, ['admin', 'user'], true)) {
    jsonResponse(['message' => 'Escolha um tipo de conta válido.'], 422);
}

if ($id === 0 && $password === '') {
    jsonResponse(['message' => 'Informe uma senha inicial.'], 422);
}

if (strlen($sector) < 2 || strlen($sector) > 120) {
    jsonResponse(['message' => 'Informe um setor válido.'], 422);
}

if ($password !== '' && ($policyError = passwordPolicyError($password))) {
    jsonResponse(['message' => $policyError], 422);
}

if ($role === 'admin') {
    $permissions = array_keys(systemPermissions());
} else {
    $qualityActions = ['quality.manage', 'quality.create_rap', 'quality.create_dispatch'];
    if (array_intersect($qualityActions, $permissions) !== []) {
        $permissions[] = 'quality.view';
    }

    if (array_intersect($qualitySections, $permissions) !== []) {
        $permissions[] = 'quality.view';
    }

    $permissions = array_values(array_unique($permissions));
}

if ($permissions === []) {
    jsonResponse(['message' => 'Selecione pelo menos uma permissão para a conta.'], 422);
}

$connection = database();
$isNewUser = $id === 0;

try {
    $connection->beginTransaction();

    if ($id > 0) {
        $targetQuery = $connection->prepare(
            'SELECT id, is_primary_admin FROM users WHERE id = :id FOR UPDATE'
        );
        $targetQuery->execute(['id' => $id]);
        $target = $targetQuery->fetch();

        if (!is_array($target)) {
            $connection->rollBack();
            jsonResponse(['message' => 'Usuário não encontrado.'], 404);
        }

        if (!empty($target['is_primary_admin'])) {
            $connection->rollBack();
            jsonResponse(['message' => 'A conta administradora principal é protegida.'], 422);
        }

        if ($id === (int) $administrator['id'] && (!$isActive || $role !== 'admin')) {
            $connection->rollBack();
            jsonResponse(['message' => 'Você não pode remover o próprio acesso administrativo.'], 422);
        }

        $sql = 'UPDATE users
                SET name = :name, email = :email, job_title = :job_title, sector = :sector,
                    role = :role, is_active = :is_active';
        $parameters = [
            'id' => $id,
            'name' => $name,
            'email' => $email,
            'job_title' => $jobTitle,
            'sector' => $sector,
            'role' => $role,
            'is_active' => $isActive ? 1 : 0,
        ];

        if ($password !== '') {
            $sql .= ', password_hash = :password_hash, must_change_password = :must_change_password';
            $parameters['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
            $parameters['must_change_password'] = $id === (int) $administrator['id'] ? 0 : 1;
        }

        $sql .= ' WHERE id = :id';
        $connection->prepare($sql)->execute($parameters);
        $message = 'Usuário atualizado com sucesso.';
    } else {
        $query = $connection->prepare(
            'INSERT INTO users
                (name, email, job_title, sector, profile_photo, password_hash, role, is_active, must_change_password)
             VALUES
                (:name, :email, :job_title, :sector, NULL, :password_hash, :role, :is_active, 1)'
        );
        $query->execute([
            'name' => $name,
            'email' => $email,
            'job_title' => $jobTitle,
            'sector' => $sector,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'role' => $role,
            'is_active' => $isActive ? 1 : 0,
        ]);
        $id = (int) $connection->lastInsertId();
        $message = 'Usuário criado com sucesso.';
    }

    $connection->prepare('DELETE FROM user_permissions WHERE user_id = :user_id')
        ->execute(['user_id' => $id]);
    $insertPermission = $connection->prepare(
        'INSERT INTO user_permissions (user_id, permission) VALUES (:user_id, :permission)'
    );
    foreach ($permissions as $permission) {
        $insertPermission->execute(['user_id' => $id, 'permission' => $permission]);
    }

    $connection->prepare(
        "UPDATE access_requests
            SET status = 'approved'
          WHERE status = 'pending'
            AND (email = :email OR (email IS NULL AND name = :request_name))"
    )->execute(['email' => $email, 'request_name' => $name]);

    $connection->commit();
} catch (PDOException $exception) {
    if ($connection->inTransaction()) {
        $connection->rollBack();
    }

    if ((string) $exception->getCode() === '23000') {
        jsonResponse(['message' => 'Já existe uma conta com este e-mail.'], 409);
    }

    jsonResponse(['message' => 'Não foi possível salvar o usuário.'], 503);
}

jsonResponse(['message' => $message, 'id' => $id], $isNewUser ? 201 : 200);
