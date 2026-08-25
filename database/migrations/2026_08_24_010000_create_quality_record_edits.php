<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quality_record_edits', function (Blueprint $table): void {
            $table->id();
            $table->string('record_type', 20);
            $table->unsignedBigInteger('record_id');
            $table->string('record_code', 20);
            $table->unsignedBigInteger('edited_by_user_id')->nullable();
            $table->string('edited_by_name', 120)->nullable();
            $table->string('edited_by_job_title', 100)->nullable();
            $table->json('changes');
            $table->timestamps();

            // O registro pode ser excluído sem apagar sua trilha. Por isso o
            // alvo é identificado de forma polimórfica, sem FK para as três
            // tabelas de Qualidade; o editor, por outro lado, é uma FK real.
            $table->index(
                ['record_type', 'record_id', 'created_at'],
                'quality_record_edits_record_history_index'
            );
            $table->foreign('edited_by_user_id', 'quality_record_edits_editor_foreign')
                ->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quality_record_edits');
    }
};
