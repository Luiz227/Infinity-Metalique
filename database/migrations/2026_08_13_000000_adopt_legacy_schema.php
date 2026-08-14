<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
|--------------------------------------------------------------------------
| Marco zero do banco legado
|--------------------------------------------------------------------------
|
| Esta migration permite que o Laravel passe a controlar o mesmo banco que
| antes era criado pelos arquivos SQL historicos do projeto.
|
| Em uma instalacao existente, as tabelas sao preservadas e somente colunas
| conhecidas como incrementais sao completadas quando estiverem ausentes. Em
| um banco vazio, toda a estrutura consolidada e criada pelo Schema Builder.
|
| O down() nao remove tabelas: esta migration adota dados preexistentes e nao
| consegue distinguir com seguranca o que foi criado por ela do que ja existia.
| As migrations posteriores devem ter rollbacks normais e reversiveis.
|
*/
return new class extends Migration
{
    public function up(): void
    {
        $this->createOrUpgradeAccountTables();
        $this->createQualitySupportTables();
        $this->createQualityRecordTables();
        $this->applyLegacyDataTransitions();
    }

    public function down(): void
    {
        // Marco de adocao nao destrutivo. Nunca remova tabelas legadas aqui.
    }

    private function createOrUpgradeAccountTables(): void
    {
        if (! Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 120);
                $table->string('nickname', 50)->nullable();
                $table->string('email', 254)->unique();
                $table->string('job_title', 100)->default('Colaborador');
                $table->string('sector', 120)->default('Não informado');
                $table->string('profile_photo')->nullable();
                $table->string('password_hash');
                $table->enum('role', ['admin', 'user'])->default('user');
                $table->boolean('is_primary_admin')->default(false);
                $table->boolean('is_active')->default(true);
                $table->boolean('must_change_password')->default(false);
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
            });
        } else {
            $this->upgradeUsersTable();
        }

        if (! Schema::hasTable('user_permissions')) {
            Schema::create('user_permissions', function (Blueprint $table): void {
                $table->unsignedBigInteger('user_id');
                $table->string('permission', 80);
                $table->timestamp('created_at')->useCurrent();

                $table->primary(['user_id', 'permission']);
                $table->foreign('user_id', 'user_permissions_user_foreign')
                    ->references('id')->on('users')->cascadeOnDelete();
            });
        }

        if (! Schema::hasTable('access_requests')) {
            Schema::create('access_requests', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 120);
                $table->string('sector', 120);
                $table->string('job_title', 120);
                $table->date('admission_date');
                $table->string('email', 254)->nullable();
                $table->string('password_hash')->nullable();
                $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

                $table->index(['email', 'status'], 'access_requests_email_status_index');
                $table->index(
                    ['name', 'admission_date', 'status'],
                    'access_requests_employee_status_index'
                );
            });
        } else {
            $this->upgradeAccessRequestsTable();
        }

        if (! Schema::hasTable('password_reset_requests')) {
            Schema::create('password_reset_requests', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('user_id');
                $table->char('request_token_hash', 64);
                $table->enum('status', ['pending', 'approved', 'rejected', 'completed'])
                    ->default('pending');
                $table->unsignedBigInteger('reviewed_by_user_id')->nullable();
                $table->dateTime('reviewed_at')->nullable();
                $table->dateTime('expires_at')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

                $table->index(['user_id', 'status'], 'password_reset_user_status_index');
                $table->index(['status', 'created_at'], 'password_reset_status_created_index');
                $table->foreign('user_id', 'password_reset_user_foreign')
                    ->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('reviewed_by_user_id', 'password_reset_reviewer_foreign')
                    ->references('id')->on('users')->nullOnDelete();
            });
        }
    }

    private function upgradeUsersTable(): void
    {
        Schema::whenTableDoesntHaveColumn('users', 'nickname', function (Blueprint $table): void {
            $table->string('nickname', 50)->nullable()->after('name');
        });
        Schema::whenTableDoesntHaveColumn('users', 'profile_photo', function (Blueprint $table): void {
            $table->string('profile_photo')->nullable()->after('email');
        });
        Schema::whenTableDoesntHaveColumn('users', 'job_title', function (Blueprint $table): void {
            $table->string('job_title', 100)->default('Colaborador')->after('email');
        });
        Schema::whenTableDoesntHaveColumn('users', 'sector', function (Blueprint $table): void {
            $table->string('sector', 120)->default('Não informado')->after('job_title');
        });
        Schema::whenTableDoesntHaveColumn('users', 'role', function (Blueprint $table): void {
            $table->enum('role', ['admin', 'user'])->default('user')->after('password_hash');
        });
        Schema::whenTableDoesntHaveColumn('users', 'is_primary_admin', function (Blueprint $table): void {
            $table->boolean('is_primary_admin')->default(false)->after('role');
        });
        Schema::whenTableDoesntHaveColumn('users', 'is_active', function (Blueprint $table): void {
            $table->boolean('is_active')->default(true)->after('is_primary_admin');
        });
        Schema::whenTableDoesntHaveColumn('users', 'must_change_password', function (Blueprint $table): void {
            $table->boolean('must_change_password')->default(false)->after('is_active');
        });
    }

    private function upgradeAccessRequestsTable(): void
    {
        Schema::whenTableDoesntHaveColumn('access_requests', 'sector', function (Blueprint $table): void {
            $table->string('sector', 120)->nullable()->after('name');
        });
        Schema::whenTableDoesntHaveColumn('access_requests', 'job_title', function (Blueprint $table): void {
            $table->string('job_title', 120)->nullable()->after('sector');
        });
        Schema::whenTableDoesntHaveColumn('access_requests', 'admission_date', function (Blueprint $table): void {
            $table->date('admission_date')->nullable()->after('job_title');
        });

        if (Schema::hasColumn('access_requests', 'email')
            && ! $this->columnIsNullable('access_requests', 'email')) {
            Schema::table('access_requests', function (Blueprint $table): void {
                $table->string('email', 254)->nullable()->change();
            });
        }

        if (Schema::hasColumn('access_requests', 'password_hash')
            && ! $this->columnIsNullable('access_requests', 'password_hash')) {
            Schema::table('access_requests', function (Blueprint $table): void {
                $table->string('password_hash')->nullable()->change();
            });
        }

        Schema::whenTableDoesntHaveIndex(
            'access_requests',
            'access_requests_employee_status_index',
            function (Blueprint $table): void {
                $table->index(
                    ['name', 'admission_date', 'status'],
                    'access_requests_employee_status_index'
                );
            }
        );
    }

    private function createQualitySupportTables(): void
    {
        if (! Schema::hasTable('clients')) {
            Schema::create('clients', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 180);
                $table->string('normalized_name', 180)->unique();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        if (! Schema::hasTable('employees')) {
            Schema::create('employees', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 160);
                $table->string('normalized_name', 160)->unique();
                $table->boolean('is_active')->default(true);
                $table->timestamp('created_at')->useCurrent();
            });
        }

        if (! Schema::hasTable('quality_codes')) {
            Schema::create('quality_codes', function (Blueprint $table): void {
                $table->id();
                $table->string('code', 20)->unique();
                $table->string('description');
                $table->unsignedInteger('position')->default(0);
            });
        }

        if (! Schema::hasTable('machine_types')) {
            Schema::create('machine_types', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 60)->unique();
            });
        }

        if (! Schema::hasTable('machine_models')) {
            Schema::create('machine_models', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('machine_type_id');
                $table->string('name', 80);

                $table->unique(
                    ['machine_type_id', 'name'],
                    'machine_models_type_name_unique'
                );
                $table->foreign('machine_type_id', 'machine_models_type_foreign')
                    ->references('id')->on('machine_types')->cascadeOnDelete();
            });
        }
    }

    private function createQualityRecordTables(): void
    {
        if (! Schema::hasTable('inspection_reports')) {
            Schema::create('inspection_reports', function (Blueprint $table): void {
                $table->id();
                $table->string('code', 20)->unique();
                $table->unsignedInteger('sequence')->unique();
                $table->date('report_date');
                $table->string('action_type', 30);
                $table->unsignedBigInteger('client_id')->nullable();
                $table->unsignedBigInteger('machine_type_id')->nullable();
                $table->string('model', 80)->nullable();
                $table->string('shed', 20)->nullable();
                $table->string('sector', 40)->nullable();
                $table->string('gate', 30)->nullable();
                $table->string('problem_type', 60)->nullable();
                $table->unsignedBigInteger('quality_code_id')->nullable();
                $table->text('description')->nullable();
                $table->boolean('needs_checklist_update')->default(false);
                $table->text('checklist_change')->nullable();
                $table->text('immediate_action')->nullable();
                $table->enum('status', ['registered', 'pending_review'])->default('registered');
                $table->unsignedBigInteger('created_by_user_id')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

                $table->index('report_date', 'inspection_reports_report_date_index');
                $table->index('quality_code_id', 'inspection_reports_quality_code_index');
                $table->index(['shed', 'gate'], 'inspection_reports_shed_gate_index');
                $table->index('problem_type', 'inspection_reports_problem_type_index');
                $table->index('machine_type_id', 'inspection_reports_machine_type_index');
                $table->foreign('client_id', 'inspection_reports_client_foreign')
                    ->references('id')->on('clients')->nullOnDelete();
                $table->foreign('machine_type_id', 'inspection_reports_machine_type_foreign')
                    ->references('id')->on('machine_types')->nullOnDelete();
                $table->foreign('quality_code_id', 'inspection_reports_quality_code_foreign')
                    ->references('id')->on('quality_codes')->nullOnDelete();
                $table->foreign('created_by_user_id', 'inspection_reports_user_foreign')
                    ->references('id')->on('users')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('inspection_report_employees')) {
            Schema::create('inspection_report_employees', function (Blueprint $table): void {
                $table->unsignedBigInteger('inspection_report_id');
                $table->unsignedBigInteger('employee_id');
                $table->unsignedTinyInteger('position')->default(1);

                $table->primary(['inspection_report_id', 'employee_id']);
                $table->index('employee_id', 'inspection_report_employees_employee_index');
                $table->foreign('inspection_report_id', 'inspection_report_employees_report_foreign')
                    ->references('id')->on('inspection_reports')->cascadeOnDelete();
                $table->foreign('employee_id', 'inspection_report_employees_employee_foreign')
                    ->references('id')->on('employees')->cascadeOnDelete();
            });
        }

        if (! Schema::hasTable('machine_dispatches')) {
            Schema::create('machine_dispatches', function (Blueprint $table): void {
                $table->id();
                $table->string('code', 20)->unique();
                $table->unsignedInteger('sequence')->unique();
                $table->date('dispatch_date');
                $table->unsignedBigInteger('client_id')->nullable();
                $table->unsignedBigInteger('machine_type_id')->nullable();
                $table->string('model', 80)->nullable();
                $table->text('notes')->nullable();
                $table->boolean('needs_form_update')->default(false);
                $table->text('form_change')->nullable();
                $table->text('immediate_action')->nullable();
                $table->unsignedBigInteger('created_by_user_id')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

                $table->index('dispatch_date', 'machine_dispatches_dispatch_date_index');
                $table->index('machine_type_id', 'machine_dispatches_machine_type_index');
                $table->foreign('client_id', 'machine_dispatches_client_foreign')
                    ->references('id')->on('clients')->nullOnDelete();
                $table->foreign('machine_type_id', 'machine_dispatches_machine_type_foreign')
                    ->references('id')->on('machine_types')->nullOnDelete();
                $table->foreign('created_by_user_id', 'machine_dispatches_user_foreign')
                    ->references('id')->on('users')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('machine_dispatch_employees')) {
            Schema::create('machine_dispatch_employees', function (Blueprint $table): void {
                $table->unsignedBigInteger('machine_dispatch_id');
                $table->unsignedBigInteger('employee_id');
                $table->unsignedTinyInteger('position')->default(1);

                $table->primary(['machine_dispatch_id', 'employee_id']);
                $table->index('employee_id', 'machine_dispatch_employees_employee_index');
                $table->foreign('machine_dispatch_id', 'machine_dispatch_employees_dispatch_foreign')
                    ->references('id')->on('machine_dispatches')->cascadeOnDelete();
                $table->foreign('employee_id', 'machine_dispatch_employees_employee_foreign')
                    ->references('id')->on('employees')->cascadeOnDelete();
            });
        }

        if (! Schema::hasTable('machine_dispatch_photos')) {
            Schema::create('machine_dispatch_photos', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('machine_dispatch_id');
                $table->string('path');
                $table->unsignedTinyInteger('position')->default(1);
                $table->timestamp('created_at')->useCurrent();

                $table->index('machine_dispatch_id', 'machine_dispatch_photos_dispatch_index');
                $table->foreign('machine_dispatch_id', 'machine_dispatch_photos_dispatch_foreign')
                    ->references('id')->on('machine_dispatches')->cascadeOnDelete();
            });
        }

        if (! Schema::hasTable('customer_complaints')) {
            Schema::create('customer_complaints', function (Blueprint $table): void {
                $table->id();
                $table->date('complaint_date');
                $table->unsignedBigInteger('client_id')->nullable();
                $table->unsignedBigInteger('machine_type_id')->nullable();
                $table->string('model', 80)->nullable();
                $table->text('problem')->nullable();
                $table->text('local_treatment')->nullable();
                $table->string('quality_alert')->nullable();
                $table->string('signatures')->nullable();
                $table->timestamp('created_at')->useCurrent();

                $table->index('complaint_date', 'customer_complaints_complaint_date_index');
                $table->foreign('client_id', 'customer_complaints_client_foreign')
                    ->references('id')->on('clients')->nullOnDelete();
                $table->foreign('machine_type_id', 'customer_complaints_machine_type_foreign')
                    ->references('id')->on('machine_types')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('startup_problems')) {
            Schema::create('startup_problems', function (Blueprint $table): void {
                $table->id();
                $table->date('occurred_on');
                $table->unsignedBigInteger('client_id')->nullable();
                $table->unsignedBigInteger('machine_type_id')->nullable();
                $table->string('model', 80)->nullable();
                $table->string('technician', 120)->nullable();
                $table->text('problem')->nullable();
                $table->text('local_treatment')->nullable();
                $table->text('resolution')->nullable();
                $table->timestamp('created_at')->useCurrent();

                $table->index('occurred_on', 'startup_problems_occurred_on_index');
                $table->foreign('client_id', 'startup_problems_client_foreign')
                    ->references('id')->on('clients')->nullOnDelete();
                $table->foreign('machine_type_id', 'startup_problems_machine_type_foreign')
                    ->references('id')->on('machine_types')->nullOnDelete();
            });
        }
    }

    private function applyLegacyDataTransitions(): void
    {
        $managedUserIds = DB::table('user_permissions')
            ->where('permission', 'quality.manage')
            ->pluck('user_id');

        foreach ($managedUserIds as $userId) {
            DB::table('user_permissions')->insertOrIgnore([
                ['user_id' => $userId, 'permission' => 'quality.create_rap'],
                ['user_id' => $userId, 'permission' => 'quality.create_dispatch'],
            ]);
        }

        DB::table('users')
            ->where('email', 'marketing@metalique.com.br')
            ->update([
                'job_title' => 'Administrador',
                'sector' => 'Administração',
                'role' => 'admin',
                'is_primary_admin' => true,
                'is_active' => true,
                'must_change_password' => false,
            ]);

        DB::table('users')
            ->where('is_primary_admin', true)
            ->update(['must_change_password' => false]);
    }

    private function columnIsNullable(string $table, string $column): bool
    {
        foreach (Schema::getColumns($table) as $definition) {
            if (strtolower($definition['name']) === strtolower($column)) {
                return $definition['nullable'];
            }
        }

        return false;
    }
};
