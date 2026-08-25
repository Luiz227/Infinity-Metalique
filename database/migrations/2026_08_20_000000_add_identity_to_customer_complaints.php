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
        Schema::table('customer_complaints', function (Blueprint $table): void {
            $table->string('code', 20)->nullable()->unique()->after('id');
            $table->unsignedInteger('sequence')->nullable()->after('code');
            $table->unsignedBigInteger('created_by_user_id')->nullable()->after('signatures');

            $table->foreign('created_by_user_id', 'customer_complaints_created_by_foreign')
                ->references('id')->on('users')->nullOnDelete();
        });

        // As reclamações que vieram da planilha entram na mesma numeração dos
        // registros lançados à mão: sem código elas não teriam como aparecer na
        // coluna Nº nem no diálogo de exclusão.
        $sequence = 0;
        DB::table('customer_complaints')->orderBy('complaint_date')->orderBy('id')
            ->select('id')->get()
            ->each(function (object $row) use (&$sequence): void {
                $sequence++;
                DB::table('customer_complaints')->where('id', $row->id)->update([
                    'sequence' => $sequence,
                    'code' => 'RSC'.str_pad((string) $sequence, 2, '0', STR_PAD_LEFT),
                ]);
            });
    }

    public function down(): void
    {
        Schema::table('customer_complaints', function (Blueprint $table): void {
            $table->dropForeign('customer_complaints_created_by_foreign');
            $table->dropUnique(['code']);
            $table->dropColumn(['code', 'sequence', 'created_by_user_id']);
        });
    }
};
