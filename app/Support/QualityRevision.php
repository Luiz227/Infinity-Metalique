<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\DB;

/** Revisão monotônica usada pelos clientes para detectar alterações remotas. */
final class QualityRevision
{
    private const SCOPE = 'quality';

    public static function current(): string
    {
        return (string) (DB::table('data_revisions')
            ->where('scope', self::SCOPE)
            ->value('revision') ?? 0);
    }

    /** Deve ser chamada dentro da mesma transação que altera os dados. */
    public static function bump(): void
    {
        $updated = DB::table('data_revisions')
            ->where('scope', self::SCOPE)
            ->increment('revision', 1, ['updated_at' => now()]);

        if ($updated === 0) {
            DB::table('data_revisions')->insertOrIgnore([
                'scope' => self::SCOPE,
                'revision' => 1,
                'updated_at' => now(),
            ]);
        }
    }
}
