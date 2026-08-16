<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quality_imports', function (Blueprint $table): void {
            $table->id();
            $table->uuid('token')->unique();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('original_name');
            $table->char('file_hash', 64);
            $table->enum('status', ['pending', 'completed', 'failed'])->default('pending');
            $table->longText('payload');
            $table->json('summary');
            $table->json('errors')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'expires_at']);
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('customer_complaints', function (Blueprint $table): void {
            $table->char('source_key', 64)->nullable()->unique()->after('id');
        });

        Schema::table('startup_problems', function (Blueprint $table): void {
            $table->char('source_key', 64)->nullable()->unique()->after('id');
        });
    }

    public function down(): void
    {
        Schema::table('startup_problems', function (Blueprint $table): void {
            $table->dropUnique(['source_key']);
            $table->dropColumn('source_key');
        });
        Schema::table('customer_complaints', function (Blueprint $table): void {
            $table->dropUnique(['source_key']);
            $table->dropColumn('source_key');
        });
        Schema::dropIfExists('quality_imports');
    }
};
