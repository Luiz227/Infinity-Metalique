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
        Schema::create('data_revisions', function (Blueprint $table): void {
            $table->string('scope', 40)->primary();
            $table->unsignedBigInteger('revision')->default(0);
            $table->timestamp('updated_at')->nullable();
        });

        DB::table('data_revisions')->insert([
            'scope' => 'quality',
            'revision' => 0,
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('data_revisions');
    }
};
