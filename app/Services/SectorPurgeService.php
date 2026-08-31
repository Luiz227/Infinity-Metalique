<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use App\Support\SectorData;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * O expurgo de um setor, em três etapas encadeadas por um token.
 *
 * Preparar escreve o backup; baixar marca que ele chegou; confirmar apaga. São
 * três requests porque a promessa da tela depende disso - e o servidor não
 * confia na tela: `purge()` recusa um token que nunca passou pelo download, e
 * confere o tamanho do que o navegador diz ter recebido. Um download que falha
 * deixa o token vencer sozinho sem nunca ter apagado nada.
 *
 * O que é apagado vem dos grupos escolhidos, nunca de uma tabela solta pedida
 * pelo cliente: quem manda na lista é o registro em `SectorData`.
 */
final class SectorPurgeService
{
    /** Curto porque o token é uma autorização já paga: senha e nome conferidos. */
    private const TOKEN_MINUTES = 10;

    public function __construct(private readonly UploadService $uploads) {}

    /**
     * Valida a escolha de grupos e devolve a lista normalizada.
     *
     * @param  list<string>  $groups
     * @return list<string>
     *
     * @throws RuntimeException
     */
    public function normalizeGroups(string $sector, array $groups): array
    {
        $known = SectorData::groupKeys($sector);
        $chosen = $this->dropCascaded($sector, array_values(array_filter(
            $known,
            static fn (string $key): bool => in_array($key, $groups, true)
        )));

        if ($chosen === []) {
            throw new RuntimeException('Escolha ao menos uma aba para apagar.');
        }

        /*
         * A comparação é contra o "tudo" já sem os arrastados, e não contra a
         * lista crua de grupos.
         *
         * Marcar Cadastros na tela marca os sete, mas `planos` sai antes do
         * envio - ele cai junto com `satisfacao` - e chegam seis. Comparando com
         * os sete, escolher tudo era recusado como se faltasse alguma coisa.
         */
        $full = $this->dropCascaded($sector, $known);

        foreach (SectorData::groupsRequiringAll($sector) as $key) {
            if (in_array($key, $chosen, true) && count($chosen) !== count($full)) {
                throw new RuntimeException(
                    'Os '.mb_strtolower(SectorData::group($sector, $key)['label'])
                    .' só podem ser apagados junto com todo o resto: sem isso, os '
                    .'lançamentos que sobrarem ficariam sem cliente e sem máquina.'
                );
            }
        }

        return $chosen;
    }

    /**
     * Tira da lista quem já cai por cascata de outro escolhido.
     *
     * Os planos de ação morrem com a reclamação, então manter os dois contaria
     * as mesmas linhas duas vezes no resumo que a tela mostra.
     *
     * @param  list<string>  $groups
     * @return list<string>
     */
    private function dropCascaded(string $sector, array $groups): array
    {
        $arrastados = [];
        foreach ($groups as $key) {
            $arrastados = [...$arrastados, ...SectorData::cascades($sector, $key)];
        }

        return array_values(array_filter(
            $groups,
            static fn (string $key): bool => ! in_array($key, $arrastados, true)
        ));
    }

    /**
     * O retrato que a tela mostra antes de qualquer coisa ser apagada.
     *
     * As abas saem na ordem do módulo, com as que são só visão dizendo de quem
     * dependem; os grupos sem aba saem à parte para nada ficar inalcançável.
     *
     * @return array{tabs: list<array<string, mixed>>, extras: list<array<string, mixed>>}
     */
    public function overview(string $sector): array
    {
        $tabs = [];
        foreach (SectorData::tabs($sector) as $tab) {
            $group = $tab['group'] ?? null;

            $tabs[] = [
                'id' => $tab['id'],
                'label' => $tab['label'],
                // Sem grupo, a aba é uma visão: ela aparece, explica de quem
                // depende e não pode ser marcada sozinha.
                'group' => $group,
                'sources' => array_values($tab['sources'] ?? []),
            ] + ($group === null ? [] : $this->groupSummary($sector, $group));
        }

        $extras = [];
        foreach (SectorData::extraGroupKeys($sector) as $key) {
            $extras[] = ['group' => $key] + $this->groupSummary($sector, $key);
        }

        return ['tabs' => $tabs, 'extras' => $extras];
    }

    /** @return array{description: string, rows: int, files: int, requiresAll: bool, cascades: list<string>} */
    private function groupSummary(string $sector, string $key): array
    {
        $group = SectorData::group($sector, $key);

        return [
            'description' => $group['description'],
            'rows' => (int) DB::table($group['count'])->count(),
            'files' => count($this->filePaths($sector, [$key])),
            'requiresAll' => ($group['requiresAll'] ?? false) === true,
            'cascades' => SectorData::cascades($sector, $key),
        ];
    }

    /**
     * Prepara o expurgo: guarda o token, escreve o backup, libera para download.
     *
     * A linha entra antes do dump de propósito. Escrevendo primeiro, um request
     * que morresse no meio deixaria uma cópia integral do banco em disco sem
     * nenhuma linha apontando para ela - invisível para sempre.
     *
     * @param  list<string>  $groups
     * @return array{token: string, filename: string, sizeBytes: int, expiresAt: string}
     */
    public function prepare(string $sector, array $groups, User $actor, ?string $ipAddress): array
    {
        $this->sweep();

        $token = Str::random(64);
        $directory = $this->archiveDirectory($token);

        if (! is_dir($directory) && ! mkdir($directory, 0755, true) && ! is_dir($directory)) {
            throw new RuntimeException('Não foi possível preparar a pasta do backup.');
        }

        $expiresAt = now()->addMinutes(self::TOKEN_MINUTES);

        DB::table('sector_purges')->insert([
            'token' => $token,
            'sector' => $sector,
            'groups' => json_encode($groups, JSON_THROW_ON_ERROR),
            'status' => 'preparing',
            'counts' => json_encode($this->groupRowCounts($sector, $groups), JSON_THROW_ON_ERROR),
            'photo_count' => count($this->filePaths($sector, $groups)),
            'user_id' => $actor->getKey(),
            'user_name' => (string) $actor->name,
            'user_email' => (string) $actor->email,
            'ip_address' => $ipAddress,
            'archive_path' => $this->displayPath($token),
            'expires_at' => $expiresAt,
            'created_at' => now(),
        ]);

        // Um dump grande não pode morrer no relógio do SAPI web.
        @set_time_limit(0);
        $sizeBytes = $this->dump($sector, $groups, $this->dumpPath($token));

        DB::table('sector_purges')->where('token', $token)->update([
            'status' => 'pending',
            'archive_bytes' => $sizeBytes,
        ]);

        return [
            'token' => $token,
            'filename' => $this->filename($sector),
            'sizeBytes' => $sizeBytes,
            'expiresAt' => $expiresAt->toIso8601String(),
        ];
    }

    /** A linha do token, se ela ainda puder ser usada por este administrador. */
    public function usableToken(string $token, User $actor, string $status = 'pending'): ?object
    {
        $record = DB::table('sector_purges')->where('token', $token)->first();

        if ($record === null
            || $record->status !== $status
            || (int) $record->user_id !== (int) $actor->getKey()
            || now()->greaterThan($record->expires_at)) {
            return null;
        }

        return $record;
    }

    /** O download aconteceu: é o que destrava a confirmação. */
    public function markDownloaded(string $token): void
    {
        DB::table('sector_purges')->where('token', $token)->where('status', 'pending')->update([
            'status' => 'downloaded',
            'downloaded_at' => now(),
        ]);
    }

    public function dumpPath(string $token): string
    {
        return $this->archiveDirectory($token).DIRECTORY_SEPARATOR.'dados.json';
    }

    public function displayPath(string $token): string
    {
        return 'storage/app/purgas/'.$token;
    }

    public function filename(string $sector): string
    {
        return 'backup-'.$sector.'-'.now()->format('Y-m-d-His').'.json';
    }

    /**
     * Apaga os grupos escolhidos e devolve o que foi apagado.
     *
     * O arquivamento das fotos fica de fora da transação de propósito: mover
     * arquivo não desfaz num rollback, então ele só acontece quando o banco já
     * está commitado e não há mais volta a dar.
     *
     * @return array{
     *     counts: array<string, int>, tables: array<string, int>,
     *     photos: list<string>, token: string, sector: string, groups: list<string>
     * }
     */
    public function purge(string $token, User $actor, int $receivedBytes): array
    {
        $result = DB::transaction(function () use ($token, $actor, $receivedBytes): array {
            $record = DB::table('sector_purges')->where('token', $token)->lockForUpdate()->first();

            if ($record === null
                || (int) $record->user_id !== (int) $actor->getKey()
                || now()->greaterThan($record->expires_at)) {
                throw new RuntimeException('Esta confirmação não vale mais. Comece de novo. Nada foi apagado.');
            }
            if ($record->status !== 'downloaded') {
                throw new RuntimeException(
                    'O backup precisa ser baixado antes da exclusão. Nada foi apagado.'
                );
            }
            // O tamanho que o navegador diz ter recebido contra o que foi
            // gravado: é o que transforma "se o download falhar, nada é
            // apagado" de convenção da tela em regra do servidor.
            if ($receivedBytes !== (int) $record->archive_bytes) {
                throw new RuntimeException(
                    'O backup chegou incompleto ao seu computador. Nada foi apagado.'
                );
            }

            $sector = (string) $record->sector;
            /** @var list<string> $groups */
            $groups = json_decode((string) $record->groups, true, 512, JSON_THROW_ON_ERROR);

            // Antes de apagar: as linhas somem em cascata e levariam os caminhos
            // junto, deixando os arquivos órfãos na pasta pública.
            $photos = $this->filePaths($sector, $groups);
            $counts = $this->groupRowCounts($sector, $groups);

            $tables = [];
            foreach (SectorData::steps($sector, $groups) as $step) {
                $query = DB::table($step['table']);
                foreach ($step['where'] as $column => $value) {
                    $query->where($column, $value);
                }
                $tables[$step['table']] = ($tables[$step['table']] ?? 0) + (int) $query->delete();
            }

            $this->reseed($sector, $groups);
            $this->bumpRevision($sector);

            DB::table('sector_purges')->where('id', $record->id)->update([
                'status' => 'completed',
                'result' => json_encode($tables, JSON_THROW_ON_ERROR),
                'photo_count' => count($photos),
                'completed_at' => now(),
            ]);

            // Um token do mesmo setor preparado antes deste viu um banco que já
            // não existe mais. Vencê-los aqui evita um segundo expurgo disparado
            // por engano, com contagens que não batem com nada.
            DB::table('sector_purges')
                ->where('sector', $sector)
                ->whereIn('status', ['preparing', 'pending', 'downloaded'])
                ->update(['status' => 'expired']);

            return [
                'counts' => $counts, 'tables' => $tables, 'photos' => $photos,
                'sector' => $sector, 'groups' => $groups,
            ];
        });

        // O administrador já tem o arquivo; guardar uma segunda cópia integral
        // do banco no servidor para sempre não serve a ninguém. As fotos ficam.
        @unlink($this->dumpPath($token));

        return $result + ['token' => $token];
    }

    /** @param list<string> $photos */
    public function archivePhotos(string $token, array $photos): int
    {
        if ($photos === []) {
            return 0;
        }

        return $this->uploads->archive($photos, $this->archiveDirectory($token).DIRECTORY_SEPARATOR.'fotos');
    }

    /**
     * Vence os tokens que ninguém confirmou e apaga o dump deles.
     *
     * Não há scheduler nem worker neste projeto, então a varredura é
     * oportunista: ela roda quando alguém abre a zona de perigo. Sem ela, cada
     * preparo abandonado deixaria uma cópia integral do banco em disco.
     */
    public function sweep(): void
    {
        $vencidos = DB::table('sector_purges')
            ->whereIn('status', ['preparing', 'pending', 'downloaded'])
            ->where('expires_at', '<', now())
            ->pluck('token');

        if ($vencidos->isEmpty()) {
            return;
        }

        foreach ($vencidos as $token) {
            @unlink($this->dumpPath((string) $token));
            @rmdir($this->archiveDirectory((string) $token));
        }

        DB::table('sector_purges')->whereIn('token', $vencidos)->update(['status' => 'expired']);
    }

    /**
     * Quantas linhas cada grupo tem, pela entidade que dá nome a ele.
     *
     * É o número que a tela mostra e que a trilha guarda: "93 apontamentos" diz
     * mais do que a soma das linhas filhas que caem junto.
     *
     * @param  list<string>  $groups
     * @return array<string, int>
     */
    private function groupRowCounts(string $sector, array $groups): array
    {
        $counts = [];
        foreach ($groups as $key) {
            $counts[$key] = (int) DB::table(SectorData::group($sector, $key)['count'])->count();
        }

        return $counts;
    }

    /**
     * O que foi zerado volta ao estado de instalação nova, não a um estado
     * quebrado: sem gates o formulário de RAP não tem o que oferecer, e sem a
     * linha da meta os gráficos perdem a referência em vez de perderem o valor.
     *
     * @param  list<string>  $groups
     */
    private function reseed(string $sector, array $groups): void
    {
        foreach (SectorData::seeds($sector, $groups) as $table => $rows) {
            foreach ($rows as $row) {
                if (Schema::hasColumn($table, 'updated_at')) {
                    $row['updated_at'] = now();
                }
                DB::table($table)->insertOrIgnore($row);
            }
        }
    }

    /** A revisão que os clientes abertos observam para se recarregarem. */
    private function bumpRevision(string $sector): void
    {
        $scope = SectorData::definition($sector)['revision'] ?? null;
        if ($scope === null) {
            return;
        }

        $updated = DB::table('data_revisions')
            ->where('scope', $scope)
            ->increment('revision', 1, ['updated_at' => now()]);

        if ($updated === 0) {
            DB::table('data_revisions')->insertOrIgnore([
                'scope' => $scope,
                'revision' => 1,
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * @param  list<string>  $groups
     * @return list<string>
     */
    private function filePaths(string $sector, array $groups): array
    {
        $paths = [];
        foreach (SectorData::files($sector, $groups) as $source) {
            $paths = [...$paths, ...DB::table($source['table'])
                ->orderBy($source['column'])
                ->pluck($source['column'])
                ->map(static fn (mixed $path): string => (string) $path)
                ->all()];
        }

        return $paths;
    }

    private function archiveDirectory(string $token): string
    {
        return storage_path('app'.DIRECTORY_SEPARATOR.'purgas'.DIRECTORY_SEPARATOR.$token);
    }

    /**
     * Escreve o backup linha a linha em vez de montar tudo em memória: o dump é
     * o setor inteiro, e um `get()` numa tabela grande derrubaria o PHP antes de
     * o administrador ver qualquer coisa.
     *
     * @param  list<string>  $groups
     */
    private function dump(string $sector, array $groups, string $path): int
    {
        $handle = fopen($path, 'wb');
        if ($handle === false) {
            throw new RuntimeException('Não foi possível gravar o backup.');
        }

        try {
            fwrite($handle, '{'.PHP_EOL);
            fwrite($handle, '  "setor": '.$this->encode($sector).','.PHP_EOL);
            fwrite($handle, '  "rotulo": '.$this->encode(SectorData::label($sector)).','.PHP_EOL);
            fwrite($handle, '  "grupos_apagados": '.$this->encode($groups).','.PHP_EOL);
            fwrite($handle, '  "gerado_em": '.$this->encode(now()->toIso8601String()).','.PHP_EOL);
            fwrite($handle, '  "tabelas": {'.PHP_EOL);

            // Sempre tudo, mesmo quando só um grupo foi escolhido: ver allTables().
            $tables = SectorData::allTables($sector);
            foreach ($tables as $index => $table) {
                fwrite($handle, '    '.$this->encode($table).': ['.PHP_EOL);

                $first = true;
                $write = function ($rows) use ($handle, &$first): void {
                    foreach ($rows as $row) {
                        fwrite($handle, ($first ? '' : ','.PHP_EOL).'      '.$this->encode((array) $row));
                        $first = false;
                    }
                };

                // Ordenar por chave única: a paginação por offset do `chunk`
                // pula ou repete linha na fronteira quando a ordem empata.
                $query = DB::table($table);
                foreach ($this->dumpKeys($table) as $column) {
                    $query->orderBy($column);
                }
                $query->chunk(1000, $write);

                fwrite($handle, ($first ? '' : PHP_EOL).'    ]'.($index === count($tables) - 1 ? '' : ',').PHP_EOL);
            }

            fwrite($handle, '  }'.PHP_EOL.'}'.PHP_EOL);
        } finally {
            fclose($handle);
        }

        return (int) filesize($path);
    }

    /**
     * A chave estável de cada tabela. As pivôs não têm `id`, e nelas nenhuma das
     * duas colunas basta sozinha - a chave é o par.
     *
     * @return list<string>
     */
    private function dumpKeys(string $table): array
    {
        return match ($table) {
            'inspection_report_employees' => ['inspection_report_id', 'employee_id'],
            'machine_dispatch_employees' => ['machine_dispatch_id', 'employee_id'],
            'quality_settings' => ['name'],
            default => ['id'],
        };
    }

    private function encode(mixed $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
