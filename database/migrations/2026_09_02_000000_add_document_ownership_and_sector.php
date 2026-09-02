<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table): void {
            $table->string('sector', 120)->default('Não informado')->after('category');
            $table->timestamp('branded_at')->nullable()->after('version');
            $table->index(['sector', 'updated_at']);
        });

        DB::table('documents')
            ->select(['id', 'created_by_user_id'])
            ->orderBy('id')
            ->each(function (object $document): void {
                $sector = DB::table('users')->where('id', $document->created_by_user_id)->value('sector');
                DB::table('documents')->where('id', $document->id)->update([
                    'sector' => is_string($sector) && trim($sector) !== '' ? $sector : 'Não informado',
                ]);
            });

        Schema::create('document_editors', function (Blueprint $table): void {
            $table->foreignId('document_id')->constrained('documents')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('authorized_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->primary(['document_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_editors');

        Schema::table('documents', function (Blueprint $table): void {
            $table->dropIndex(['sector', 'updated_at']);
            $table->dropColumn('branded_at');
            $table->dropColumn('sector');
        });
    }
};
