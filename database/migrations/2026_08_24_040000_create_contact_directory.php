<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
|--------------------------------------------------------------------------
| Ramais e contatos da Metalique
|--------------------------------------------------------------------------
|
| A lista de ramais vivia numa planilha que circulava por fora do sistema. Aqui
| ela vira tabela, com o mesmo desenho dos catálogos da Qualidade: posição para
| a ordem, `is_active` para tirar de circulação sem apagar.
|
| A área (prédio/andar) é uma coluna de texto, e não uma segunda tabela: os
| grupos saem da ordem de `position` - a primeira linha de uma área é quem
| decide onde o grupo entra na lista. Criar uma área nova é digitar um nome
| novo, e reordenar uma linha reordena o grupo junto.
|
*/
return new class extends Migration
{
    /**
     * A planilha entregue pela recepção, na ordem em que ela aparece impressa.
     * A acentuação foi corrigida nos rótulos que a planilha trazia sem acento
     * ("MANUTENCAO", "PRODUCÃO LASER"): são rótulos de exibição, e o painel de
     * administração deixa qualquer um deles editável depois.
     *
     * @var list<array{0: string, 1: string, 2: string|null, 3: string}>
     */
    private const SEED = [
        ['Térreo Fábrica 1', 'COZINHA', null, '2025'],
        ['Térreo Fábrica 1', 'ASSISTÊNCIA TÉCNICA 1', 'RICKELME E LUCAS SILVA', '2022'],
        ['Térreo Fábrica 1', 'ASSISTÊNCIA TÉCNICA 2', 'KAUAN E ARTHUR', '2023'],
        ['Térreo Fábrica 1', 'MANUTENÇÃO', null, '2003'],
        ['Térreo Fábrica 1', 'EXPEDIÇÃO', 'RYAN', '2019'],
        ['Térreo Fábrica 1', 'RECEPÇÃO 1', 'CARINA', '2000'],
        ['Térreo Fábrica 1', 'RECEPÇÃO 2', 'ANA LAURA', '2040'],
        ['Térreo Fábrica 1', 'PROJETOS', null, '2020'],
        ['Térreo Fábrica 1', 'SUPERVISOR PRODUÇÃO', 'SIDNEI', '2026'],
        ['Térreo Fábrica 1', 'QUALIDADE/SEGURANÇA', 'FABIO', '2030'],
        ['Térreo Fábrica 1', 'GRÊMIO', null, '2034'],
        ['Térreo Fábrica 1', 'GUARITA', null, '2033'],
        ['Térreo Fábrica 1', 'PORTEIRO — FÁBRICA 1', null, '2037'],
        ['Térreo Fábrica 1', 'PRODUÇÃO LASER', null, '2035'],
        ['Térreo Fábrica 1', 'LABORATÓRIO LASER', null, '2021'],
        ['1º Andar Fábrica 1', 'ALMOXARIFADO', null, '2024'],
        ['2º Andar Fábrica 1', 'AGENDA', 'KARINE E RAFAELE', '2001'],
        ['2º Andar Fábrica 1', 'VENDAS 1', 'ROSSI E RAFAELA', '2006'],
        ['2º Andar Fábrica 1', 'VENDAS 2', 'HARRYSON E PEDRO', '2005'],
        ['2º Andar Fábrica 1', 'VENDAS 3', 'LUCAS AFONSO', '2004'],
        ['2º Andar Fábrica 1', 'MARKETING', null, '2010'],
        ['2º Andar Fábrica 1', 'COMPRAS', null, '2011'],
        ['2º Andar Fábrica 1', 'GERENTE', 'DAYSE', '2031'],
        ['2º Andar Fábrica 1', 'SUP. SUPORTE', null, '2016'],
        ['2º Andar Fábrica 1', 'FINANCEIRO 1', 'RONEIDE', '2015'],
        ['2º Andar Fábrica 1', 'FINANCEIRO 2', 'ADRIANE', '2014'],
        ['2º Andar Fábrica 1', 'FINANCEIRO 3', 'RUTH', '2013'],
        ['2º Andar Fábrica 1', 'DIRETOR 1', 'GUSTAVO', '2027'],
        ['2º Andar Fábrica 1', 'DIRETOR 2', 'DENISE', '2009'],
        ['2º Andar Fábrica 1', 'RECURSOS HUMANOS — RH', 'ROBERTA', '2012'],
        ['2º Andar Fábrica 1', 'TI', 'LUIZ', '2043'],
        ['2º Andar Fábrica 1', 'REUNIÃO SALA 1', null, '2018'],
        ['2º Andar Fábrica 1', 'REUNIÃO SALA 2', null, '2032'],
        ['2º Andar Fábrica 1', 'ELEVADOR', null, '2039'],
        ['Térreo Fábrica 2', 'PORTEIRO — FÁBRICA 2', null, '2041'],
        ['Térreo Fábrica 2', 'SUPERVISOR FÁBRICA 2', 'ROGER', '2008'],
        ['Térreo Fábrica 2', 'MONTAGEM — FÁBRICA 2', null, '2042'],
        ['Fábrica 3', 'PRODUÇÃO FÁBRICA 3', null, '2044'],
        ['Fábrica 3', 'SHOWROOM', null, '2045'],
    ];

    /** Os canais públicos da empresa, preenchidos pelo painel de administração. */
    private const SETTING_KEYS = ['phone', 'email', 'address', 'hours'];

    public function up(): void
    {
        if (! Schema::hasTable('phone_extensions')) {
            Schema::create('phone_extensions', function (Blueprint $table): void {
                $table->id();
                $table->string('area', 60);
                $table->string('sector', 80);
                // Quem atende, quando a planilha nomeia: "CARINA", "KAUAN E ARTHUR".
                $table->string('people', 120)->nullable();
                // Texto, e não inteiro: ramal é identificador, não número para contar.
                $table->string('number', 10)->unique();
                $table->unsignedInteger('position')->default(0);
                $table->boolean('is_active')->default(true);
            });
        }

        foreach (self::SEED as $position => [$area, $sector, $people, $number]) {
            DB::table('phone_extensions')->insertOrIgnore([
                'area' => $area,
                'sector' => $sector,
                'people' => $people,
                'number' => $number,
                'position' => $position + 1,
                'is_active' => true,
            ]);
        }

        if (! Schema::hasTable('contact_settings')) {
            Schema::create('contact_settings', function (Blueprint $table): void {
                $table->string('name', 60)->primary();
                $table->string('value', 255)->nullable();
                $table->timestamp('updated_at')->nullable();
            });
        }

        // Valor nulo de propósito: enquanto ninguém preencher, o bloco de
        // contatos gerais não aparece na tela pública.
        foreach (self::SETTING_KEYS as $name) {
            DB::table('contact_settings')->insertOrIgnore([
                'name' => $name,
                'value' => null,
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_settings');
        Schema::dropIfExists('phone_extensions');
    }
};
