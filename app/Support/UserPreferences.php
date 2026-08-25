<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * As preferências de uso de cada conta: o que a central de configurações edita.
 *
 * A regra que atravessa o arquivo: o cliente nunca dita o formato. O bloco que
 * chega é peneirado contra este catálogo - chave que não existe aqui cai fora,
 * valor fora da lista volta ao padrão - então um payload torto grava um bloco
 * são em vez de derrubar a tela de quem abrir o sistema depois.
 *
 * Só entram preferências da *conta*, que devem seguir a pessoa de máquina em
 * máquina. O que vale para o aparelho (lembrar o usuário no login, zoom da
 * janela do desktop) fica no localStorage do frontend e nunca sobe.
 */
final class UserPreferences
{
    /** O padrão continua sendo claro: "sistema" é uma escolha, não uma surpresa. */
    public const THEMES = ['light', 'dark', 'system'];

    /** "auto" mantém o comportamento antigo: a primeira rota que a conta pode abrir. */
    public const START_ROUTES = ['auto', '/sistema', '/qualidade', '/usuarios', '/piperun', '/sige'];

    /** Mesmas abas de `qualityNavigation` no AppHeader, na mesma ordem. */
    public const QUALITY_TABS = [
        'raps', 'unidades', 'produtos', 'coletas', 'colaboradores', 'qualidade', 'planos', 'registros',
    ];

    /** Os três tipos que `GeneralController::notifications` sabe emitir. */
    public const NOTIFICATION_KINDS = ['quality', 'access-request', 'password-reset'];

    /** Segundos entre duas consultas ao sino; zero é "só quando eu abrir". */
    public const NOTIFICATION_INTERVALS = [30, 120, 0];

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'theme' => 'light',
            'startRoute' => 'auto',
            'qualityTab' => 'raps',
            'reduceMotion' => false,
            'smoothScroll' => true,
            'mutedNotifications' => [],
            'notificationsInterval' => 30,
        ];
    }

    /**
     * Peneira o bloco recebido contra os padrões. O que sai daqui é sempre um
     * bloco completo e válido, com todas as chaves.
     *
     * @return array<string, mixed>
     */
    public static function sanitize(mixed $input): array
    {
        $input = is_array($input) ? $input : [];
        $preferences = self::defaults();

        $preferences['theme'] = self::oneOf($input['theme'] ?? null, self::THEMES, $preferences['theme']);
        $preferences['startRoute'] = self::oneOf($input['startRoute'] ?? null, self::START_ROUTES, $preferences['startRoute']);
        $preferences['qualityTab'] = self::oneOf($input['qualityTab'] ?? null, self::QUALITY_TABS, $preferences['qualityTab']);
        $preferences['reduceMotion'] = self::boolean($input['reduceMotion'] ?? null, $preferences['reduceMotion']);
        $preferences['smoothScroll'] = self::boolean($input['smoothScroll'] ?? null, $preferences['smoothScroll']);
        $preferences['mutedNotifications'] = self::kinds($input['mutedNotifications'] ?? null);

        $interval = filter_var($input['notificationsInterval'] ?? null, FILTER_VALIDATE_INT);
        if ($interval !== false && in_array($interval, self::NOTIFICATION_INTERVALS, true)) {
            $preferences['notificationsInterval'] = $interval;
        }

        return $preferences;
    }

    /**
     * O bloco gravado da conta, já peneirado. Uma conta que nunca abriu a
     * central não tem linha, e recebe os padrões.
     *
     * @return array<string, mixed>
     */
    public static function forUser(int $userId): array
    {
        try {
            $stored = DB::table('user_preferences')->where('user_id', $userId)->value('preferences');
        } catch (QueryException) {
            // A tabela pode ainda não existir num banco que não migrou. Sem
            // preferência o sistema continua inteiro, então não é erro fatal.
            return self::defaults();
        }

        if (! is_string($stored) || $stored === '') {
            return self::defaults();
        }

        return self::sanitize(json_decode($stored, true));
    }

    /**
     * Grava o bloco inteiro de uma vez e devolve o que ficou gravado.
     *
     * @return array<string, mixed>
     */
    public static function store(int $userId, mixed $input): array
    {
        $preferences = self::sanitize($input);

        DB::table('user_preferences')->updateOrInsert(
            ['user_id' => $userId],
            ['preferences' => json_encode($preferences, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'updated_at' => now()],
        );

        return $preferences;
    }

    /** @param list<string> $allowed */
    private static function oneOf(mixed $value, array $allowed, string $fallback): string
    {
        return is_string($value) && in_array($value, $allowed, true) ? $value : $fallback;
    }

    private static function boolean(mixed $value, bool $fallback): bool
    {
        $parsed = filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);

        return $parsed ?? $fallback;
    }

    /**
     * Silenciar um tipo é opt-in, então valor torto vira lista vazia (nada
     * silenciado) e não um silêncio que ninguém pediu.
     *
     * @return list<string>
     */
    private static function kinds(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $kinds = array_values(array_unique(array_filter(
            array_map(static fn (mixed $kind): string => is_string($kind) ? $kind : '', $value),
            static fn (string $kind): bool => in_array($kind, self::NOTIFICATION_KINDS, true),
        )));

        sort($kinds);

        return $kinds;
    }
}
