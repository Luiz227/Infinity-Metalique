<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
|--------------------------------------------------------------------------
| O original da foto de perfil, e o enquadramento escolhido
|--------------------------------------------------------------------------
|
| Até aqui só o recorte de 512x512 era guardado, e o arquivo enviado morria na
| requisição. Isso tornava o reenquadramento uma via de mão única: o que ficou
| fora do círculo já tinha se perdido, então só dava para aproximar mais - e
| cada volta reamostrava 512 para 512, borrando um pouco mais.
|
| Guardar o original resolve os dois problemas de uma vez. O recorte continua
| sendo o que as telas mostram (pequeno, quadrado, pronto); o original só é lido
| quando alguém abre o recortador de novo.
|
| O enquadramento é gravado em pixels da imagem original - {x, y, size} -, e não
| como zoom e deslocamento de tela: o palco do recortador tem largura variável,
| então os mesmos números de tela dariam recortes diferentes em telas
| diferentes. Em pixels do original, o retângulo significa a mesma coisa em
| qualquer lugar.
|
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::whenTableDoesntHaveColumn('users', 'profile_photo_source', function (Blueprint $table): void {
            $table->string('profile_photo_source')->nullable()->after('profile_photo');
        });
        Schema::whenTableDoesntHaveColumn('users', 'profile_photo_crop', function (Blueprint $table): void {
            $table->json('profile_photo_crop')->nullable()->after('profile_photo_source');
        });
    }

    public function down(): void
    {
        Schema::whenTableHasColumn('users', 'profile_photo_crop', function (Blueprint $table): void {
            $table->dropColumn('profile_photo_crop');
        });
        Schema::whenTableHasColumn('users', 'profile_photo_source', function (Blueprint $table): void {
            $table->dropColumn('profile_photo_source');
        });
    }
};
