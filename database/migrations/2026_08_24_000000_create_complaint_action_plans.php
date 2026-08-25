<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
|--------------------------------------------------------------------------
| Planos de ação das reclamações
|--------------------------------------------------------------------------
|
| A reclamação do cliente (RSC) registrava a ocorrência e parava ali. O plano
| de ação é a tratativa dela: quem responde, o que será feito, até quando, e
| os andamentos escritos até o encerramento - que quase nunca cai no mesmo dia
| da abertura.
|
| Um plano por reclamação, garantido pelo unique em customer_complaint_id.
|
*/
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('complaint_action_plans')) {
            Schema::create('complaint_action_plans', function (Blueprint $table): void {
                $table->id();
                $table->string('code', 20)->unique();
                $table->unsignedInteger('sequence')->unique();
                $table->unsignedBigInteger('customer_complaint_id')->unique();
                $table->date('opened_on');
                $table->date('due_on')->nullable();
                /*
                 * Não existe coluna de situação: ela sai daqui. Nula é plano em
                 * aberto; preenchida é plano concluído. Guardar o estado numa
                 * segunda coluna criaria duas verdades que podem discordar.
                 */
                $table->date('closed_on')->nullable();
                $table->unsignedBigInteger('employee_id')->nullable();
                $table->text('root_cause')->nullable();
                $table->text('action');
                $table->unsignedBigInteger('created_by_user_id')->nullable();
                $table->unsignedBigInteger('closed_by_user_id')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

                $table->index('opened_on', 'complaint_action_plans_opened_on_index');
                $table->index('closed_on', 'complaint_action_plans_closed_on_index');
                $table->index('due_on', 'complaint_action_plans_due_on_index');
                $table->foreign('customer_complaint_id', 'complaint_action_plans_complaint_foreign')
                    ->references('id')->on('customer_complaints')->cascadeOnDelete();
                $table->foreign('employee_id', 'complaint_action_plans_employee_foreign')
                    ->references('id')->on('employees')->nullOnDelete();
                $table->foreign('created_by_user_id', 'complaint_action_plans_created_by_foreign')
                    ->references('id')->on('users')->nullOnDelete();
                $table->foreign('closed_by_user_id', 'complaint_action_plans_closed_by_foreign')
                    ->references('id')->on('users')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('complaint_action_plan_entries')) {
            Schema::create('complaint_action_plan_entries', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('complaint_action_plan_id');
                /*
                 * A data do andamento é digitada, não é a do lançamento: quem
                 * trata costuma registrar dias depois o que resolveu em campo.
                 */
                $table->date('entry_date');
                $table->text('note');
                $table->unsignedBigInteger('created_by_user_id')->nullable();
                $table->timestamp('created_at')->useCurrent();

                $table->index(
                    ['complaint_action_plan_id', 'entry_date'],
                    'complaint_action_plan_entries_plan_date_index'
                );
                $table->foreign('complaint_action_plan_id', 'complaint_action_plan_entries_plan_foreign')
                    ->references('id')->on('complaint_action_plans')->cascadeOnDelete();
                $table->foreign('created_by_user_id', 'complaint_action_plan_entries_user_foreign')
                    ->references('id')->on('users')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('complaint_action_plan_entries');
        Schema::dropIfExists('complaint_action_plans');
    }
};
