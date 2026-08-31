<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
|--------------------------------------------------------------------------
| Expurgos por setor
|--------------------------------------------------------------------------
|
| A tabela é as duas coisas ao mesmo tempo: o cofre do token entre o preparo e
| a confirmação, e a trilha permanente de quem zerou o quê. Por isso ela nunca
| entra na lista de tabelas que um expurgo apaga - se entrasse, o único registro
| do que aconteceu sumiria junto com o que aconteceu.
|
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sector_purges', function (Blueprint $table): void {
            $table->id();
            $table->string('token', 64)->unique();
            $table->string('sector', 40);
            // Os grupos escolhidos, na ordem do registro. Guardados na linha
            // porque a confirmação não repete a escolha: ela só apresenta o
            // token, e é daqui que sai o que de fato será apagado.
            $table->json('groups');
            // preparing -> pending -> downloaded -> completed | expired.
            // O passo `downloaded` não é enfeite: é ele que deixa a confirmação
            // recusar um expurgo cujo backup nunca saiu daqui.
            $table->string('status', 20)->default('preparing');
            $table->json('counts');
            $table->json('result')->nullable();
            $table->unsignedInteger('photo_count')->default(0);
            $table->unsignedBigInteger('archive_bytes')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            // Congelados de propósito: a trilha precisa dizer quem foi mesmo
            // depois que a conta for excluída e a FK virar nula.
            $table->string('user_name', 160);
            $table->string('user_email', 254);
            $table->string('ip_address', 45)->nullable();
            $table->string('archive_path')->nullable();
            /*
             * DATETIME, e não TIMESTAMP, de propósito.
             *
             * Com `explicit_defaults_for_timestamp=OFF` - o padrão do MariaDB
             * aqui - a primeira coluna TIMESTAMP da tabela ganha sozinha um
             * `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`. Como o
             * preparo grava a linha e depois a atualiza com o tamanho do
             * backup, o banco reescrevia a validade para o instante do UPDATE:
             * o token nascia com dez minutos e expirava em segundos. DATETIME
             * nunca recebe esse comportamento implícito.
             */
            $table->dateTime('expires_at');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('downloaded_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->index(['sector', 'status'], 'sector_purges_sector_status_index');
            $table->foreign('user_id', 'sector_purges_user_foreign')
                ->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sector_purges');
    }
};
