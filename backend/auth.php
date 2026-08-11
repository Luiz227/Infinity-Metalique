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

/** Política única para senhas temporárias e definitivas. */
function passwordPolicyError(string $password): ?string
{
    if (strlen($password) < 8 || strlen($password) > 72) {
        return 'A senha deve ter entre 8 e 72 caracteres.';
    }

    if (!preg_match('/\p{N}/u', $password)) {
        return 'A senha deve conter pelo menos um número.';
    }

    if (!preg_match('/[^\p{L}\p{N}]/u', $password)) {
        return 'A senha deve conter pelo menos um caractere especial.';
    }

    return null;
}

/** Permissões reconhecidas pelo sistema e exibidas na administração de contas. */
function systemPermissions(): array
{
    return [
        'dashboard.view' => [
            'group' => 'Geral',
            'label' => 'Acessar Dashboard',
            'description' => 'Visualizar a tela inicial do sistema.',
        ],
        'quality.view' => [
            'group' => 'Qualidade',
            'assignable' => false,
            'label' => 'Visualizar Qualidade',
            'description' => 'Consultar indicadores, registros e documentos da Qualidade.',
        ],
        'quality.manage' => [
            'group' => 'Qualidade',
            'label' => 'Excluir registros da Qualidade',
            'description' => 'Excluir RAPs e produtos coletados existentes.',
        ],
        'quality.create_rap' => [
            'group' => 'Qualidade',
            'label' => 'Criar novo RAP',
            'description' => 'Exibir o botão Novo RAP e registrar apontamentos.',
        ],
        'quality.create_dispatch' => [
            'group' => 'Qualidade',
            'label' => 'Criar nova coleta',
            'description' => 'Exibir o botão Nova coleta e registrar produtos coletados.',
        ],
        'quality.raps' => [
            'group' => 'Qualidade',
            'label' => 'RAPs',
            'description' => 'Visualizar os indicadores de relatórios de ação preventiva.',
        ],
        'quality.units' => [
            'group' => 'Qualidade',
            'label' => 'Unidades',
            'description' => 'Visualizar indicadores por barracão e gate.',
        ],
        'quality.products' => [
            'group' => 'Qualidade',
            'label' => 'Produtos',
            'description' => 'Visualizar indicadores por máquina e modelo.',
        ],
        'quality.dispatches' => [
            'group' => 'Qualidade',
            'label' => 'Produtos Coletados',
            'description' => 'Consultar coletas e expedições registradas.',
        ],
        'quality.employees' => [
            'group' => 'Qualidade',
            'label' => 'Colaboradores',
            'description' => 'Visualizar os indicadores por colaborador.',
        ],
        'quality.satisfaction' => [
            'group' => 'Qualidade',
            'label' => 'Qualidade',
            'description' => 'Visualizar satisfação e reclamações de clientes.',
        ],
        'quality.records' => [
            'group' => 'Qualidade',
            'label' => 'Registros',
            'description' => 'Consultar a listagem de apontamentos registrados.',
        ],
        'users.manage' => [
            'group' => 'Administração',
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

    // Ações liberam a rota da Qualidade sem selecionar automaticamente uma aba.
    $qualityActions = ['quality.manage', 'quality.create_rap', 'quality.create_dispatch'];
    if (array_intersect($qualityActions, $permissions) !== []) {
        $permissions[] = 'quality.view';
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
        'nickname' => !empty($user['nickname']) ? (string) $user['nickname'] : null,
        'email' => (string) $user['email'],
        'job_title' => (string) ($user['job_title'] ?? 'Colaborador'),
        'sector' => (string) ($user['sector'] ?? 'Não informado'),
        'role' => $role,
        'is_primary_admin' => (bool) ($user['is_primary_admin'] ?? false),
        'is_active' => (bool) ($user['is_active'] ?? true),
        'must_change_password' => (bool) ($user['must_change_password'] ?? false),
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
function requestAccess(string $name, string $sector, string $jobTitle, string $admissionDate): array
{
    $name = normalizeName($name);
    $sector = normalizeName($sector);
    $jobTitle = normalizeName($jobTitle);

    if (strlen($name) < 3 || strlen($name) > 120) {
        return ['success' => false, 'message' => 'Informe um nome completo válido.'];
    }

    if (strlen($sector) < 2 || strlen($sector) > 120) {
        return ['success' => false, 'message' => 'Informe um setor válido.'];
    }

    if (strlen($jobTitle) < 2 || strlen($jobTitle) > 120) {
        return ['success' => false, 'message' => 'Informe um cargo válido.'];
    }

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $admissionDate);
    $dateErrors = DateTimeImmutable::getLastErrors();
    if (!$date || ($dateErrors !== false && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0))
        || $date->format('Y-m-d') !== $admissionDate || $date > new DateTimeImmutable('today')) {
        return ['success' => false, 'message' => 'Informe uma data de admissão válida.'];
    }

    $connection = database();
    $pendingRequest = $connection->prepare(
        "SELECT 1 FROM access_requests
          WHERE name = :name AND admission_date = :admission_date AND status = 'pending'
          LIMIT 1"
    );
    $pendingRequest->execute(['name' => $name, 'admission_date' => $admissionDate]);

    if ($pendingRequest->fetchColumn()) {
        return ['success' => false, 'message' => 'Já existe uma solicitação pendente para este colaborador.'];
    }

    $query = $connection->prepare(
        'INSERT INTO access_requests (name, sector, job_title, admission_date)
         VALUES (:name, :sector, :job_title, :admission_date)'
    );
    $query->execute([
        'name' => $name,
        'sector' => $sector,
        'job_title' => $jobTitle,
        'admission_date' => $admissionDate,
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
        'SELECT id, name, nickname, email, job_title, sector, role, is_primary_admin, is_active,
                must_change_password,
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
            'SELECT id, name, nickname, email, job_title, sector, role, is_primary_admin, is_active,
                    must_change_password, profile_photo
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
