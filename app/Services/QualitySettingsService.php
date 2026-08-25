<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\QualityRevision;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Catálogos e metas que o responsável da Qualidade edita pela engrenagem.
 *
 * A regra que atravessa o arquivo inteiro: catálogo em uso se desativa, não se
 * apaga. Um gate desativado some do formulário de RAP mas continua nos gráficos
 * e nos apontamentos antigos - o histórico não pode perder o nome da etapa em
 * que a não conformidade foi pega.
 */
final class QualitySettingsService
{
    public const TARGET_RAPS_PER_MONTH = 'raps_monthly_target';

    private const GATE_NAME_LIMIT = 30;

    private const CODE_LIMIT = 20;

    private const DESCRIPTION_LIMIT = 255;

    /** Teto de RAPs por mês que ainda faz sentido como meta digitada. */
    private const TARGET_LIMIT = 100000;

    /** @return array<string, mixed> */
    public function read(): array
    {
        return [
            'gates' => $this->gates(),
            'codes' => $this->codes(),
            'targets' => ['rapsPerMonth' => $this->target()],
        ];
    }

    /**
     * Grava o estado inteiro do painel de uma vez. Ou tudo entra, ou nada muda:
     * a tela é um rascunho com um botão Salvar, e um meio-termo gravado deixaria
     * o formulário de RAP num estado que ninguém pediu.
     *
     * @return array{success: bool, message: string}
     */
    public function save(array $input): array
    {
        $fail = static fn (string $message): array => ['success' => false, 'message' => $message];

        $target = $this->parseTarget($input['rapsMonthlyTarget'] ?? null);
        if ($target === false) {
            return $fail('A meta mensal precisa ser um número inteiro entre 1 e '.self::TARGET_LIMIT.', ou ficar vazia.');
        }

        $gates = $this->parseGates($input['gates'] ?? []);
        if (is_string($gates)) {
            return $fail($gates);
        }

        $codes = $this->parseCodes($input['codes'] ?? []);
        if (is_string($codes)) {
            return $fail($codes);
        }

        // A recusa de remoção vira exceção porque o rollback precisa levar junto
        // o que já tinha sido apagado antes dela - um `return` de dentro da
        // transação a daria por boa e comitaria o meio-termo.
        try {
            return DB::transaction(function () use ($gates, $codes, $target): array {
                $gateUsage = $this->gateUsage();
                $this->removeMissing(
                    'quality_gates',
                    'name',
                    $gates,
                    'esse gate',
                    static fn (object $row): int => $gateUsage[(string) $row->name] ?? 0,
                );

                $codeUsage = $this->codeUsage();
                $this->removeMissing(
                    'quality_codes',
                    'code',
                    $codes,
                    'esse código',
                    static fn (object $row): int => $codeUsage[(int) $row->id] ?? 0,
                );

                foreach ($gates as $position => $gate) {
                    $row = ['name' => $gate['name'], 'position' => $position + 1, 'is_active' => $gate['active']];
                    $gate['id'] === null
                        ? DB::table('quality_gates')->insert($row)
                        : DB::table('quality_gates')->where('id', $gate['id'])->update($row);
                }

                foreach ($codes as $position => $code) {
                    $row = [
                        'code' => $code['code'],
                        'description' => $code['description'],
                        'position' => $position + 1,
                        'is_active' => $code['active'],
                    ];
                    $code['id'] === null
                        ? DB::table('quality_codes')->insert($row)
                        : DB::table('quality_codes')->where('id', $code['id'])->update($row);
                }

                DB::table('quality_settings')->updateOrInsert(
                    ['name' => self::TARGET_RAPS_PER_MONTH],
                    ['value' => $target === null ? null : (string) $target, 'updated_at' => now()],
                );

                QualityRevision::bump();

                return ['success' => true, 'message' => 'Configurações da Qualidade salvas.'];
            });
        } catch (RuntimeException $blocked) {
            return $fail($blocked->getMessage());
        }
    }

    /** @return list<array<string, mixed>> */
    private function gates(): array
    {
        $usage = $this->gateUsage();

        return DB::table('quality_gates')->orderBy('position')->orderBy('name')
            ->get(['id', 'name', 'position', 'is_active'])
            ->map(static fn (object $row): array => [
                'id' => (int) $row->id,
                'name' => (string) $row->name,
                'position' => (int) $row->position,
                'active' => (bool) $row->is_active,
                'usage' => $usage[(string) $row->name] ?? 0,
            ])->all();
    }

    /** @return list<array<string, mixed>> */
    private function codes(): array
    {
        $usage = $this->codeUsage();

        return DB::table('quality_codes')->orderBy('position')->orderBy('code')
            ->get(['id', 'code', 'description', 'position', 'is_active'])
            ->map(static fn (object $row): array => [
                'id' => (int) $row->id,
                'code' => (string) $row->code,
                'description' => (string) $row->description,
                'position' => (int) $row->position,
                'active' => (bool) $row->is_active,
                'usage' => $usage[(int) $row->id] ?? 0,
            ])->all();
    }

    private function target(): ?int
    {
        $value = DB::table('quality_settings')->where('name', self::TARGET_RAPS_PER_MONTH)->value('value');

        return $value === null || $value === '' ? null : (int) $value;
    }

    /**
     * Quantos RAPs usam cada gate, numa consulta só. O vínculo é pelo nome
     * gravado no apontamento - renomear um gate leva o histórico junto.
     *
     * @return array<string, int>
     */
    private function gateUsage(): array
    {
        return DB::table('inspection_reports')
            ->whereNotNull('gate')->where('gate', '<>', '')
            ->groupBy('gate')->selectRaw('gate, COUNT(*) AS total')
            ->pluck('total', 'gate')
            ->map(static fn ($total): int => (int) $total)
            ->all();
    }

    /** @return array<int, int> */
    private function codeUsage(): array
    {
        return DB::table('inspection_reports')
            ->whereNotNull('quality_code_id')
            ->groupBy('quality_code_id')->selectRaw('quality_code_id, COUNT(*) AS total')
            ->pluck('total', 'quality_code_id')
            ->map(static fn ($total): int => (int) $total)
            ->all();
    }

    /**
     * O que sumiu do payload é remoção. Só passa quem nunca foi usado: a tela já
     * esconde a lixeira de quem tem apontamento, então esta recusa é rede de
     * segurança, e não caminho normal.
     *
     * @param  list<array<string, mixed>>  $items
     * @param  callable(object): int  $usageOf  quantos RAPs usam a linha ameaçada
     */
    private function removeMissing(
        string $table,
        string $labelColumn,
        array $items,
        string $noun,
        callable $usageOf
    ): void {
        $kept = array_values(array_filter(array_column($items, 'id'), static fn (?int $id): bool => $id !== null));
        $doomed = DB::table($table)->whereNotIn('id', $kept === [] ? [0] : $kept)->get(['id', $labelColumn]);

        foreach ($doomed as $row) {
            $used = $usageOf($row);
            if ($used > 0) {
                throw new RuntimeException(
                    "{$row->{$labelColumn}} não pode ser removido: {$used} "
                    .($used === 1 ? 'RAP usa ' : 'RAPs usam ')."{$noun}. Desative-o em vez de remover."
                );
            }
        }

        if ($doomed->isNotEmpty()) {
            DB::table($table)->whereIn('id', $doomed->pluck('id')->all())->delete();
        }
    }

    /** @return list<array{id: int|null, name: string, active: bool}>|string */
    private function parseGates(mixed $input): array|string
    {
        $gates = [];
        $seen = [];

        foreach (is_array($input) ? $input : [] as $item) {
            $name = $this->text(is_array($item) ? ($item['name'] ?? null) : null, self::GATE_NAME_LIMIT);
            if ($name === '') {
                return 'Todo gate precisa de um nome.';
            }
            if (isset($seen[$name])) {
                return "O gate {$name} aparece duas vezes na lista.";
            }
            $seen[$name] = true;
            $gates[] = [
                'id' => $this->identifier($item['id'] ?? null),
                'name' => $name,
                'active' => filter_var($item['active'] ?? true, FILTER_VALIDATE_BOOLEAN),
            ];
        }

        return $this->hasActive($gates)
            ? $gates
            : 'Um RAP precisa de pelo menos um gate ativo para ser lançado.';
    }

    /** @return list<array{id: int|null, code: string, description: string, active: bool}>|string */
    private function parseCodes(mixed $input): array|string
    {
        $codes = [];
        $seen = [];

        foreach (is_array($input) ? $input : [] as $item) {
            $code = $this->text(is_array($item) ? ($item['code'] ?? null) : null, self::CODE_LIMIT);
            if ($code === '') {
                return 'Todo código precisa de uma sigla.';
            }
            if (isset($seen[$code])) {
                return "O código {$code} aparece duas vezes na lista.";
            }
            $seen[$code] = true;
            $description = $this->text($item['description'] ?? null, self::DESCRIPTION_LIMIT, false);
            if ($description === '') {
                return "Descreva o que o código {$code} significa.";
            }
            $codes[] = [
                'id' => $this->identifier($item['id'] ?? null),
                'code' => $code,
                'description' => $description,
                'active' => filter_var($item['active'] ?? true, FILTER_VALIDATE_BOOLEAN),
            ];
        }

        return $this->hasActive($codes)
            ? $codes
            : 'Um RAP precisa de pelo menos um código ativo para ser lançado.';
    }

    /** @param list<array{active: bool}> $items */
    private function hasActive(array $items): bool
    {
        foreach ($items as $item) {
            if ($item['active']) {
                return true;
            }
        }

        return false;
    }

    /** @return int|null|false false quando o valor recebido não é uma meta possível */
    private function parseTarget(mixed $value): int|null|false
    {
        if ($value === null || $value === '' || $value === false) {
            return null;
        }
        if (! is_numeric($value) || (float) $value !== floor((float) $value)) {
            return false;
        }
        $target = (int) $value;

        return $target >= 1 && $target <= self::TARGET_LIMIT ? $target : false;
    }

    private function identifier(mixed $value): ?int
    {
        return is_numeric($value) && (int) $value > 0 ? (int) $value : null;
    }

    /** Mesma normalização do resto do módulo: sem espaço sobrando e em caixa alta. */
    private function text(mixed $value, int $limit, bool $upper = true): string
    {
        $value = is_string($value) ? trim(preg_replace('/\s+/', ' ', $value) ?? '') : '';

        return mb_substr($upper ? mb_strtoupper($value) : $value, 0, $limit);
    }
}
