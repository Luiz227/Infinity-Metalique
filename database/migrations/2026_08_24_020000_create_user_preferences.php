<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
|--------------------------------------------------------------------------
| Preferências de uso de cada conta
|--------------------------------------------------------------------------
|
| Um bloco JSON por usuário, e não uma coluna por preferência: elas são sempre
| lidas e gravadas inteiras (a tela é um painel com salvamento imediato), e
| assim acrescentar uma preferência nova não custa migration. Quem valida cada
| chave é App\Support\UserPreferences - o banco só guarda o bloco.
|
| Preferência presa ao aparelho (lembrar usuário, zoom da janela) não mora aqui:
| ela vale para a máquina, não para a conta, e fica no localStorage.
|
*/
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('user_preferences')) {
            return;
        }

        Schema::create('user_preferences', function (Blueprint $table): void {
            // A conta é a chave: uma linha por usuário, e ela morre junto com ele.
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->json('preferences');
            $table->timestamp('updated_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_preferences');
    }
};
