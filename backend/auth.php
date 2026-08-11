<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

// Remove espaços duplicados  e espaços nas extremidades do nome.
function normalizeName(string $name): string
{
    return ((string) preg_replace('/\s+/', ' ', trim($name)));
}

// Padroniza o e-mail para facilitar a busca e impedir duplicatas por caixa.
function normalizeEmail(string $email): string
{
    return strtolower(trim($email));
}

/** Permissões reconhecidas pelo sistema e exibidas na administração de contas. */
function systemPermissions(): array
{
    return [
        'dashboard.view' => [
            'label' => 'Acessar Dashboard',
            'description' => 'Visualizar a tela inicial do sistema.',
        ],
        'quality.view' => [
            'label' => 'Visualizar Qualidade',
            'description' => 'Consultar indicadores, registros e documentos da Qualidade.',
        ],
        'quality.manage' => [
            'label' => 'Gerenciar dados da Qualidade',
            'description' => 'Criar e excluir RAPs e registros de produtos coletados.',
        ],
        'quality.raps' => [
            'label' => 'RAPs',
            'description' => 'Visualizar os indicadores de relatórios de ação preventiva.',
        ],
        'quality.units' => [
            'label' => 'Unidades',
            'description' => 'Visualizar indicadores por barracão e gate.',
        ],
        'quality.products' => [
            'label' => 'Produtos',
            'description' => 'Visualizar indicadores por máquina e modelo.',
        ],
        'quality.dispatches' => [
            'label' => 'Produtos Coletados',
            'description' => 'Consultar coletas e expedições registradas.',
        ],
        'quality.employees' => [
            'label' => 'Colaboradores',
            'description' => 'Visualizar os indicadores por colaborador.',
        ],
        'quality.satisfaction' => [
            'label' => 'Qualidade',
            'description' => 'Visualizar satisfação e reclamações de clientes.',
        ],
        'quality.records' => [
            'label' => 'Registros',
            'description' => 'Consultar a listagem de apontamentos registrados.',
        ],
        'users.manage' => [
            'label' => 'Administrar usuários',
            'description' => 'Criar contas e alterar cargos, status e permissões.',
        ],
    ];
}

function userPermissions(PDO $connection, int $userId, string $role): array
{
    if ($role === 'admin') {
        return array_keys(systemPermissions());
    }

    $query = $connection->prepare(
        'SELECT permission FROM user_permissions WHERE user_id = :user_id ORDER BY permission'
    );
    $query->execute(['user_id' => $userId]);

    $permissions = array_values(array_intersect(
        array_map('strval', $query->fetchAll(PDO::FETCH_COLUMN)),
        array_keys(systemPermissions())
    ));

    // A gestão da Qualidade precisa da listagem onde RAPs e RETIR são
    // consultados e excluídos. A expansão também contempla supervisores
    // cadastrados antes de Registros passar a fazer parte dessa permissão.
    if (in_array('quality.manage', $permissions, true)) {
        $permissions = array_merge($permissions, [
            'quality.view',
            'quality.raps',
            'quality.dispatches',
            'quality.records',
        ]);
    }

    return array_values(array_unique($permissions));
}

/** Converte uma linha do banco no formato público compartilhado com o React. */
function publicUser(array $user, PDO $connection): array
{
    $role = (string) ($user['role'] ?? 'user');

    return [
        'id' => (int) $user['id'],
        'name' => (string) $user['name'],
        'email' => (string) $user['email'],
        'job_title' => (string) ($user['job_title'] ?? 'Colaborador'),
        'role' => $role,
        'is_primary_admin' => (bool) ($user['is_primary_admin'] ?? false),
        'is_active' => (bool) ($user['is_active'] ?? true),
        'profile_photo' => !empty($user['profile_photo']) ? (string) $user['profile_photo'] : null,
        'permissions' => userPermissions($connection, (int) $user['id'], $role),
    ];
}

function userHasPermission(?array $user, string $permission): bool
{
    if (!$user || empty($user['is_active'])) {
        return false;
    }

    return ($user['role'] ?? '') === 'admin'
        || in_array($permission, $user['permissions'] ?? [], true);
}

/** Valida e registra uma solicitação sem criar um usuário ativo. */
function requestAccess(string $name, string $email, string $password): array
{
    $name = normalizeName($name);
    $email = normalizeEmail($email);

    if (strlen($name) < 3 || strlen($name) > 120) {
        return ['success' => false, 'message' => 'Informe um nome completo válido.'];
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
        return ['success' => false, 'message' => 'Informe um e-mail válido.'];
    }

    if (strlen($password) < 8 || strlen($password) > 72) {
        return ['success' => false, 'message' => 'A senha deve ter entre 8 e 72 caracteres.'];
    }

    $connection = database();
    $activeUser = $connection->prepare('SELECT 1 FROM users WHERE email = :email LIMIT 1');
    $activeUser->execute(['email' => $email]);

    if ($activeUser->fetchColumn()) {
        return ['success' => false, 'message' => 'Já existe um usuário ativo com este e-mail.'];
    }

    $pendingRequest = $connection->prepare(
        "SELECT 1 FROM access_requests WHERE email = :email AND status = 'pending' LIMIT 1"
    );
    $pendingRequest->execute(['email' => $email]);

    if ($pendingRequest->fetchColumn()) {
        return ['success' => false, 'message' => 'Já existe uma solicitação pendente para este e-mail.'];
    }

    $query = $connection->prepare(
        'INSERT INTO access_requests (name, email, password_hash) VALUES (:name, :email, :password_hash)'
    );
    $query->execute([
        'name' => $name,
        'email' => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    ]);

    return ['success' => true, 'message' => 'Solicitação de acesso enviada com sucesso.'];
}

/** Confere as credenciais e guarda somente os dados públicos na sessão. */
function authenticateUser(string $email, string $password): bool
{
    $email = normalizeEmail($email);

    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
        return false;
    }

    $connection = database();
    $query = $connection->prepare(
        'SELECT id, name, email, job_title, role, is_primary_admin, is_active,
                profile_photo, password_hash
         FROM users
         WHERE email = :email AND is_active = 1
         LIMIT 1'
    );
    $query->execute(['email' => $email]);
    $user = $query->fetch();

    // A mesma resposta é usada para e-mail inexistente e senha errada.
    if (!is_array($user) || !password_verify($password, (string) $user['password_hash'])) {
        return false;
    }

    // Trocar o ID depois do login impede a reutilização de uma sessão antiga.
    session_regenerate_id(true);
    $_SESSION['user'] = publicUser($user, $connection);

    return true;
}

/** Retorna o usuário autenticado ou null para visitantes. */
function currentUser(): ?array
{
    $user = $_SESSION['user'] ?? null;

    if (!is_array($user) || empty($user['id'])) {
        return null;
    }

    try {
        $connection = database();
        $query = $connection->prepare(
            'SELECT id, name, email, job_title, role, is_primary_admin, is_active, profile_photo
             FROM users WHERE id = :id LIMIT 1'
        );
        $query->execute(['id' => (int) $user['id']]);
        $storedUser = $query->fetch();
    } catch (PDOException) {
        return $user;
    }

    if (!is_array($storedUser) || empty($storedUser['is_active'])) {
        unset($_SESSION['user']);
        return null;
    }

    $_SESSION['user'] = publicUser($storedUser, $connection);

    return $_SESSION['user'];
}

/** Retorna a quantidade real e os usuários mais recentes para a página inicial. */
function userSummary(int $avatarLimit = 3): array
{
    $avatarLimit = max(1, min($avatarLimit, 3));
    $total = (int) database()->query('SELECT COUNT(*) FROM users WHERE is_active = 1')->fetchColumn();

    $query = database()->prepare(
        'SELECT id, name, profile_photo
         FROM users
         WHERE is_active = 1
         ORDER BY created_at DESC, id DESC
         LIMIT :limit'
    );
    $query->bindValue('limit', $avatarLimit, PDO::PARAM_INT);
    $query->execute();

    return [
        'total' => $total,
        'users' => $query->fetchAll(),
    ];
}

/** Remove a autenticação e troca o identificador da sessão. */
function logoutUser(): void
{
    unset($_SESSION['user']);
    session_regenerate_id(true);
}
