<?php

declare(strict_types=1);

namespace App\Support;

/**
 * O que cada setor tem no banco, dito pelas abas que a pessoa vê na tela.
 *
 * O grupo é a unidade de exclusão: quem quer apagar os apontamentos marca a aba
 * RAPs e leva junto os vínculos de colaborador e a trilha de edição daquele
 * tipo - nunca metade de um lançamento.
 *
 * `tabs` é a lista de abas na ordem em que elas aparecem no módulo, e espelha
 * `QUALITY_NAVIGATION` do frontend, ids inclusive. Metade delas não tem banco
 * próprio: "Unidades" é RAP agrupado por barracão, "Registros" é a listagem dos
 * mesmos apontamentos. Essas declaram `sources` em vez de `group` - aparecem na
 * tela, dizem de quem dependem e não podem ser marcadas sozinhas, porque marcar
 * "Unidades" achando que só some "dado de unidade" apagaria todos os RAPs.
 *
 * As listas de tabelas vivem só aqui: o serviço, as contagens e a tela saem
 * todos desta constante, e nenhuma delas é repetida no TypeScript. Acrescentar
 * um setor, uma aba ou um grupo é acrescentar uma entrada.
 *
 * A ordem dos `steps` é filho antes de pai, e é ela que garante o expurgo - não
 * o banco. A suíte roda em SQLite, onde as chaves estrangeiras vêm desligadas e
 * um `ON DELETE CASCADE` não aconteceria.
 */
final class SectorData
{
    public const DEFINITIONS = [
        'quality' => [
            'label' => 'Qualidade',
            /** O escopo em `data_revisions` que os clientes abertos observam. */
            'revision' => 'quality',
            /*
             * As abas do módulo, na ordem da tela. Os ids são os mesmos de
             * QUALITY_NAVIGATION no frontend - se uma aba nascer lá e não aqui,
             * ela simplesmente não aparece na zona de perigo, que é o padrão
             * seguro.
             */
            'tabs' => [
                ['id' => 'raps', 'label' => 'RAPs', 'group' => 'raps'],
                ['id' => 'unidades', 'label' => 'Unidades', 'sources' => ['raps']],
                ['id' => 'produtos', 'label' => 'Produtos', 'sources' => ['raps', 'coletas']],
                ['id' => 'coletas', 'label' => 'Produtos Coletados', 'group' => 'coletas'],
                ['id' => 'colaboradores', 'label' => 'Colaboradores', 'sources' => ['raps', 'coletas']],
                ['id' => 'qualidade', 'label' => 'Qualidade', 'group' => 'satisfacao'],
                ['id' => 'planos', 'label' => 'Planos de ação', 'group' => 'planos'],
                ['id' => 'registros', 'label' => 'Registros', 'sources' => ['raps']],
            ],
            'groups' => [
                'raps' => [
                    'label' => 'RAPs',
                    'description' => 'Os apontamentos registrados, os colaboradores envolvidos e o histórico de edição deles.',
                    'count' => 'inspection_reports',
                    'steps' => [
                        ['table' => 'inspection_report_employees'],
                        ['table' => 'inspection_reports'],
                        ['table' => 'quality_record_edits', 'where' => ['record_type' => 'report']],
                    ],
                ],
                'coletas' => [
                    'label' => 'Produtos Coletados',
                    'description' => 'As coletas registradas, os colaboradores responsáveis e as fotos do carregamento.',
                    'count' => 'machine_dispatches',
                    'files' => [
                        ['table' => 'machine_dispatch_photos', 'column' => 'path'],
                    ],
                    'steps' => [
                        ['table' => 'machine_dispatch_photos'],
                        ['table' => 'machine_dispatch_employees'],
                        ['table' => 'machine_dispatches'],
                        ['table' => 'quality_record_edits', 'where' => ['record_type' => 'dispatch']],
                    ],
                ],
                'satisfacao' => [
                    'label' => 'Qualidade (satisfação do cliente)',
                    'description' => 'As reclamações registradas na aba Qualidade.',
                    'count' => 'customer_complaints',
                    /*
                     * O plano é a tratativa da reclamação e morre com ela: a FK
                     * é `cascadeOnDelete`, então apagar a reclamação levaria o
                     * plano de qualquer jeito. Declarar os dois passos aqui é o
                     * que faz a conta bater no SQLite dos testes, onde a
                     * cascata não acontece.
                     */
                    'cascades' => ['planos'],
                    'steps' => [
                        ['table' => 'complaint_action_plan_entries'],
                        ['table' => 'complaint_action_plans'],
                        ['table' => 'customer_complaints'],
                        ['table' => 'quality_record_edits', 'where' => ['record_type' => 'complaint']],
                    ],
                ],
                'planos' => [
                    'label' => 'Planos de ação',
                    'description' => 'Os planos que tratam as reclamações e os andamentos lançados neles. As reclamações continuam.',
                    'count' => 'complaint_action_plans',
                    'steps' => [
                        ['table' => 'complaint_action_plan_entries'],
                        ['table' => 'complaint_action_plans'],
                    ],
                ],
                'partida' => [
                    'label' => 'Problemas de partida',
                    'description' => 'As ocorrências de partida que entram pela planilha.',
                    'count' => 'startup_problems',
                    'steps' => [
                        ['table' => 'startup_problems'],
                    ],
                ],
                'importacoes' => [
                    'label' => 'Histórico de importações',
                    'description' => 'O registro de quais planilhas já foram importadas, e por quem.',
                    'count' => 'quality_imports',
                    'steps' => [
                        ['table' => 'quality_imports'],
                    ],
                ],
                'cadastros' => [
                    'label' => 'Cadastros',
                    'description' => 'Clientes, colaboradores, máquinas, modelos, códigos, gates e a meta mensal.',
                    'count' => 'clients',
                    /*
                     * Cadastro não pode cair sozinho. As FKs dos lançamentos são
                     * `nullOnDelete`: apagar os clientes com RAPs vivos não
                     * derrubaria os RAPs - deixaria cada um deles sem cliente,
                     * em silêncio. Por isso este grupo só vai junto com todos.
                     */
                    'requiresAll' => true,
                    'steps' => [
                        ['table' => 'machine_models'],
                        ['table' => 'machine_types'],
                        ['table' => 'quality_codes'],
                        ['table' => 'quality_gates'],
                        ['table' => 'quality_settings'],
                        ['table' => 'clients'],
                        ['table' => 'employees'],
                    ],
                    /*
                     * O estado de instalação nova, literal. A migration
                     * 2026_08_21_000000_create_quality_settings.php tem a mesma
                     * lista; quem impede as duas de divergirem é o teste que
                     * fotografa os gates de fábrica antes de semear qualquer dado.
                     */
                    'seeds' => [
                        'quality_gates' => [
                            ['name' => 'GATE 1', 'position' => 1, 'is_active' => true],
                            ['name' => 'GATE 2', 'position' => 2, 'is_active' => true],
                            ['name' => 'GATE 3', 'position' => 3, 'is_active' => true],
                            ['name' => 'SAÍDA DE MÁQUINAS', 'position' => 4, 'is_active' => true],
                        ],
                        // Nulo de propósito: é a ausência da meta que apaga a
                        // linha tracejada dos gráficos.
                        'quality_settings' => [
                            ['name' => 'raps_monthly_target', 'value' => null],
                        ],
                    ],
                ],
            ],
        ],
    ];

    /**
     * As tabelas protegidas. Nenhuma definição de setor pode alcançá-las - é o
     * que impede um setor novo de levar as contas junto por descuido.
     *
     * @var list<string>
     */
    public const PROTECTED_TABLES = [
        'users', 'user_permissions', 'user_preferences', 'access_requests',
        'password_reset_requests', 'phone_extensions', 'contact_settings',
        'data_revisions', 'sector_purges', 'migrations',
    ];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::DEFINITIONS);
    }

    public static function has(string $sector): bool
    {
        return isset(self::DEFINITIONS[$sector]);
    }

    /** @return array<string, mixed> */
    public static function definition(string $sector): array
    {
        return self::DEFINITIONS[$sector];
    }

    public static function label(string $sector): string
    {
        return self::DEFINITIONS[$sector]['label'];
    }

    /** @return list<string> */
    public static function groupKeys(string $sector): array
    {
        return array_keys(self::DEFINITIONS[$sector]['groups']);
    }

    /** @return array<string, mixed> */
    public static function group(string $sector, string $group): array
    {
        return self::DEFINITIONS[$sector]['groups'][$group];
    }

    public static function hasGroup(string $sector, string $group): bool
    {
        return isset(self::DEFINITIONS[$sector]['groups'][$group]);
    }

    /** As abas do setor, na ordem da tela. @return list<array<string, mixed>> */
    public static function tabs(string $sector): array
    {
        return self::DEFINITIONS[$sector]['tabs'] ?? [];
    }

    /**
     * Os grupos que não aparecem em aba nenhuma.
     *
     * Problemas de partida entram por planilha e não têm tela; o histórico de
     * importações vive num diálogo; os cadastros alimentam os formulários. Se
     * ficassem de fora, seriam dados inalcançáveis pela zona de perigo.
     *
     * @return list<string>
     */
    public static function extraGroupKeys(string $sector): array
    {
        $emAba = [];
        foreach (self::tabs($sector) as $tab) {
            if (isset($tab['group'])) {
                $emAba[] = $tab['group'];
            }
        }

        return array_values(array_diff(self::groupKeys($sector), $emAba));
    }

    /**
     * Os grupos que caem junto com este, por cascata do banco.
     *
     * Escolher os dois seria contar as mesmas linhas duas vezes no resumo, então
     * o dependente é retirado da escolha quando o dono está nela.
     *
     * @return list<string>
     */
    public static function cascades(string $sector, string $group): array
    {
        return self::group($sector, $group)['cascades'] ?? [];
    }

    /**
     * Os passos de exclusão dos grupos escolhidos, na ordem declarada.
     *
     * A ordem entre grupos é a do registro, e não a da escolha de quem clicou:
     * os cadastros são os últimos da lista e precisam cair por último.
     *
     * @param  list<string>  $groups
     * @return list<array{group: string, table: string, where: array<string, mixed>}>
     */
    public static function steps(string $sector, array $groups): array
    {
        $steps = [];
        foreach (self::groupKeys($sector) as $key) {
            if (! in_array($key, $groups, true)) {
                continue;
            }
            foreach (self::group($sector, $key)['steps'] as $step) {
                $steps[] = [
                    'group' => $key,
                    'table' => $step['table'],
                    'where' => $step['where'] ?? [],
                ];
            }
        }

        return $steps;
    }

    /**
     * Tudo que o setor possui - o que o backup guarda, sempre.
     *
     * O backup leva as tabelas todas mesmo quando só um grupo foi escolhido:
     * sem os cadastros, as linhas guardadas referenciam ids de cliente e de
     * máquina que o arquivo não explica, e um backup que só faz sentido com o
     * banco vivo ao lado não é backup.
     *
     * @return list<string>
     */
    public static function allTables(string $sector): array
    {
        $tables = [];
        foreach (self::groupKeys($sector) as $key) {
            foreach (self::group($sector, $key)['steps'] as $step) {
                $tables[] = $step['table'];
            }
        }

        return array_values(array_unique($tables));
    }

    /**
     * As colunas de arquivo em disco dos grupos escolhidos.
     *
     * @param  list<string>  $groups
     * @return list<array{table: string, column: string}>
     */
    public static function files(string $sector, array $groups): array
    {
        $files = [];
        foreach ($groups as $key) {
            if (! self::hasGroup($sector, $key)) {
                continue;
            }
            foreach (self::group($sector, $key)['files'] ?? [] as $source) {
                $files[] = $source;
            }
        }

        return $files;
    }

    /**
     * As sementes a repor depois de apagar os grupos escolhidos.
     *
     * @param  list<string>  $groups
     * @return array<string, list<array<string, mixed>>>
     */
    public static function seeds(string $sector, array $groups): array
    {
        $seeds = [];
        foreach ($groups as $key) {
            if (! self::hasGroup($sector, $key)) {
                continue;
            }
            foreach (self::group($sector, $key)['seeds'] ?? [] as $table => $rows) {
                $seeds[$table] = $rows;
            }
        }

        return $seeds;
    }

    /**
     * Os grupos que só podem ser apagados junto com todos os outros.
     *
     * @return list<string>
     */
    public static function groupsRequiringAll(string $sector): array
    {
        return array_values(array_filter(
            self::groupKeys($sector),
            static fn (string $key): bool => (self::group($sector, $key)['requiresAll'] ?? false) === true
        ));
    }
}
