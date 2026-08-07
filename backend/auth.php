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

    $query = database()->prepare(
        'SELECT id, name, email, profile_photo, password_hash FROM users WHERE email = :email LIMIT 1'
    );
    $query->execute(['email' => $email]);
    $user = $query->fetch();

    // A mesma resposta é usada para e-mail inexistente e senha errada.
    if (!is_array($user) || !password_verify($password, (string) $user['password_hash'])) {
        return false;
    }

    // Trocar o ID depois do login impede a reutilização de uma sessão antiga.
    session_regenerate_id(true);
    $_SESSION['user'] = [
        'id' => (int) $user['id'],
        'name' => (string) $user['name'],
        'email' => (string) $user['email'],
        'profile_photo' => $user['profile_photo'] ? (string) $user['profile_photo'] : null,
    ];

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
        $query = database()->prepare(
            'SELECT id, name, email, profile_photo FROM users WHERE id = :id LIMIT 1'
        );
        $query->execute(['id' => (int) $user['id']]);
        $storedUser = $query->fetch();
    } catch (PDOException) {
        return $user;
    }

    if (!is_array($storedUser)) {
        unset($_SESSION['user']);
        return null;
    }

    $_SESSION['user'] = [
        'id' => (int) $storedUser['id'],
        'name' => (string) $storedUser['name'],
        'email' => (string) $storedUser['email'],
        'profile_photo' => $storedUser['profile_photo'] ? (string) $storedUser['profile_photo'] : null,
    ];

    return $_SESSION['user'];
}

/** Retorna a quantidade real e os usuários mais recentes para a página inicial. */
function userSummary(int $avatarLimit = 3): array
{
    $avatarLimit = max(1, min($avatarLimit, 3));
    $total = (int) database()->query('SELECT COUNT(*) FROM users')->fetchColumn();

    $query = database()->prepare(
        'SELECT id, name, profile_photo FROM users ORDER BY created_at DESC, id DESC LIMIT :limit'
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
