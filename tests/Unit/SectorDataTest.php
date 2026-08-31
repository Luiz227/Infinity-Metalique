<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\SectorData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * O registro de setores é a lista do que um clique apaga. Estes testes são o
 * que impede uma definição futura de levar junto o que não devia.
 */
final class SectorDataTest extends TestCase
{
    use RefreshDatabase;

    public function test_toda_tabela_declarada_existe_no_banco(): void
    {
        foreach (SectorData::keys() as $sector) {
            foreach (SectorData::allTables($sector) as $table) {
                $this->assertTrue(
                    Schema::hasTable($table),
                    "O setor {$sector} declara a tabela {$table}, que não existe."
                );
            }
        }
    }

    /**
     * O teste mais importante do arquivo: contas, permissões, ramais e a própria
     * trilha do expurgo não podem ser alcançáveis por nenhum setor.
     */
    public function test_nenhum_setor_alcanca_uma_tabela_protegida(): void
    {
        foreach (SectorData::keys() as $sector) {
            $invasoras = array_intersect(SectorData::allTables($sector), SectorData::PROTECTED_TABLES);

            $this->assertSame(
                [],
                array_values($invasoras),
                "O setor {$sector} alcança tabela protegida: ".implode(', ', $invasoras)
            );
        }
    }

    /** A tela mostra estes textos; chave crua nunca pode vazar para ela. */
    public function test_todo_grupo_tem_rotulo_e_descricao(): void
    {
        foreach (SectorData::keys() as $sector) {
            foreach (SectorData::groupKeys($sector) as $key) {
                $group = SectorData::group($sector, $key);

                $this->assertNotSame($key, $group['label'], "O grupo {$key} está sem rótulo.");
                $this->assertNotSame('', trim($group['description']), "O grupo {$key} está sem descrição.");
            }
        }
    }

    /** Sem a tabela de contagem, a tela não teria número a mostrar. */
    public function test_todo_grupo_conta_por_uma_tabela_que_ele_apaga(): void
    {
        foreach (SectorData::keys() as $sector) {
            foreach (SectorData::groupKeys($sector) as $key) {
                $group = SectorData::group($sector, $key);
                $tabelas = array_column($group['steps'], 'table');

                $this->assertContains(
                    $group['count'],
                    $tabelas,
                    "O grupo {$key} conta por {$group['count']}, que ele não apaga."
                );
            }
        }
    }

    /** As colunas de arquivo precisam existir, ou as fotos ficariam para trás. */
    public function test_as_colunas_de_arquivo_existem(): void
    {
        foreach (SectorData::keys() as $sector) {
            foreach (SectorData::groupKeys($sector) as $key) {
                foreach (SectorData::group($sector, $key)['files'] ?? [] as $source) {
                    $this->assertTrue(
                        Schema::hasColumn($source['table'], $source['column']),
                        "O grupo {$key} aponta arquivos em {$source['table']}.{$source['column']}."
                    );
                }
            }
        }
    }

    /** Só se repõe o que o próprio grupo apaga - repor fora disso duplicaria linha. */
    public function test_toda_semente_pertence_a_uma_tabela_do_proprio_grupo(): void
    {
        foreach (SectorData::keys() as $sector) {
            foreach (SectorData::groupKeys($sector) as $key) {
                $group = SectorData::group($sector, $key);
                $tabelas = array_column($group['steps'], 'table');

                foreach (array_keys($group['seeds'] ?? []) as $table) {
                    $this->assertContains(
                        $table,
                        $tabelas,
                        "O grupo {$key} repõe {$table}, que ele não apaga."
                    );
                }
            }
        }
    }

    /**
     * Duas tabelas só podem se repetir entre grupos quando um declara o outro
     * em `cascades` - fora disso, a mesma linha seria contada duas vezes.
     */
    public function test_tabela_repetida_entre_grupos_e_sempre_uma_cascata_declarada(): void
    {
        foreach (SectorData::keys() as $sector) {
            $donos = [];
            foreach (SectorData::groupKeys($sector) as $key) {
                foreach (SectorData::group($sector, $key)['steps'] as $step) {
                    $par = $step['table'].':'.json_encode($step['where'] ?? []);

                    if (isset($donos[$par])) {
                        $anterior = $donos[$par];
                        $this->assertTrue(
                            in_array($key, SectorData::cascades($sector, $anterior), true)
                            || in_array($anterior, SectorData::cascades($sector, $key), true),
                            "{$step['table']} está em {$anterior} e em {$key} sem cascata declarada."
                        );

                        continue;
                    }
                    $donos[$par] = $key;
                }
            }
        }
    }

    /** A aba ou tem banco próprio, ou diz de quem ela é só uma visão. */
    public function test_toda_aba_tem_grupo_proprio_ou_fontes_validas(): void
    {
        foreach (SectorData::keys() as $sector) {
            foreach (SectorData::tabs($sector) as $tab) {
                $group = $tab['group'] ?? null;
                $sources = $tab['sources'] ?? [];

                $this->assertTrue(
                    ($group === null) !== ($sources === []),
                    "A aba {$tab['id']} precisa de `group` ou de `sources`, e nunca dos dois."
                );

                if ($group !== null) {
                    $this->assertTrue(
                        SectorData::hasGroup($sector, $group),
                        "A aba {$tab['id']} aponta o grupo {$group}, que não existe."
                    );
                }

                // Uma visão que aponta para outra visão nunca esvaziaria.
                foreach ($sources as $source) {
                    $this->assertTrue(
                        SectorData::hasGroup($sector, $source),
                        "A aba {$tab['id']} depende de {$source}, que não é um grupo."
                    );
                }
            }
        }
    }

    /** Uma cascata precisa apontar para um grupo de verdade. */
    public function test_toda_cascata_aponta_um_grupo_existente(): void
    {
        foreach (SectorData::keys() as $sector) {
            foreach (SectorData::groupKeys($sector) as $key) {
                foreach (SectorData::cascades($sector, $key) as $arrastado) {
                    $this->assertTrue(
                        SectorData::hasGroup($sector, $arrastado),
                        "O grupo {$key} arrasta {$arrastado}, que não existe."
                    );
                }
            }
        }
    }

    /**
     * O que não aparece em aba precisa aparecer no bloco de fora, ou vira dado
     * inalcançável pela zona de perigo.
     */
    public function test_todo_grupo_esta_numa_aba_ou_no_bloco_de_fora(): void
    {
        foreach (SectorData::keys() as $sector) {
            $emAba = array_filter(array_map(
                static fn (array $tab): ?string => $tab['group'] ?? null,
                SectorData::tabs($sector)
            ));

            $this->assertSame(
                [],
                array_values(array_diff(
                    SectorData::groupKeys($sector),
                    [...$emAba, ...SectorData::extraGroupKeys($sector)]
                ))
            );
        }
    }

    /** A ordem dos passos é a do registro, não a de quem escolheu os grupos. */
    public function test_os_passos_saem_na_ordem_declarada(): void
    {
        $foraDeOrdem = ['cadastros', 'raps', 'importacoes', 'coletas', 'partida', 'satisfacao', 'planos'];
        $passos = SectorData::steps('quality', $foraDeOrdem);
        $grupos = array_values(array_unique(array_column($passos, 'group')));

        $this->assertSame(
            ['raps', 'coletas', 'satisfacao', 'planos', 'partida', 'importacoes', 'cadastros'],
            $grupos
        );
        // Cadastro é pai de tudo: precisa cair por último.
        $this->assertSame('cadastros', end($grupos));
    }
}
