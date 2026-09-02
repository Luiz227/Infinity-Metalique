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
        Schema::whenTableDoesntHaveColumn('complaint_action_plans', 'no_complaint_month', function (Blueprint $table): void {
            $table->date('no_complaint_month')->nullable()->after('customer_complaint_id');
            $table->text('no_complaint_note')->nullable()->after('no_complaint_month');
            $table->unique('no_complaint_month', 'complaint_action_plans_no_complaint_month_unique');
        });

        if (Schema::hasColumn('complaint_action_plans', 'customer_complaint_id')) {
            Schema::table('complaint_action_plans', function (Blueprint $table): void {
                $table->unsignedBigInteger('customer_complaint_id')->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        DB::table('complaint_action_plans')->whereNull('customer_complaint_id')->delete();

        Schema::whenTableHasColumn('complaint_action_plans', 'no_complaint_month', function (Blueprint $table): void {
            $table->dropUnique('complaint_action_plans_no_complaint_month_unique');
            $table->dropColumn(['no_complaint_month', 'no_complaint_note']);
        });

        if (Schema::hasColumn('complaint_action_plans', 'customer_complaint_id')) {
            Schema::table('complaint_action_plans', function (Blueprint $table): void {
                $table->unsignedBigInteger('customer_complaint_id')->nullable(false)->change();
            });
        }
    }
};
