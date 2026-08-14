<?php

declare(strict_types=1);

namespace App\Support;

final class Input
{
    public static function name(mixed $value): string
    {
        return trim((string) preg_replace('/\s+/', ' ', trim((string) $value)));
    }

    public static function email(mixed $value): string
    {
        return strtolower(trim((string) $value));
    }

    public static function passwordPolicyError(string $password): ?string
    {
        if (strlen($password) < 8 || strlen($password) > 72) {
            return 'A senha deve ter entre 8 e 72 caracteres.';
        }
        if (! preg_match('/\p{N}/u', $password)) {
            return 'A senha deve conter pelo menos um número.';
        }
        if (! preg_match('/[^\p{L}\p{N}]/u', $password)) {
            return 'A senha deve conter pelo menos um caractere especial.';
        }

        return null;
    }
}
