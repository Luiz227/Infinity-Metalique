<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::whenTableDoesntHaveColumn('users', 'employee_id', function (Blueprint $table): void {
            $table->unsignedBigInteger('employee_id')->nullable()->after('sector');
            $table->unique('employee_id', 'users_employee_unique');
            $table->foreign('employee_id', 'users_employee_foreign')
                ->references('id')->on('employees')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::whenTableHasColumn('users', 'employee_id', function (Blueprint $table): void {
            $table->dropForeign('users_employee_foreign');
            $table->dropUnique('users_employee_unique');
            $table->dropColumn('employee_id');
        });
    }
};
