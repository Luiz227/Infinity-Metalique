<?php

declare(strict_types=1);

use App\Http\Controllers\Api\ActionPlanController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\GeneralController;
use App\Http\Controllers\Api\PreferencesController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\QualityController;
use App\Http\Controllers\Api\QualitySettingsController;
use App\Http\Controllers\Api\SectorPurgeController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('backend/api')->group(function (): void {
    Route::get('documents/file.php/{document}', [DocumentController::class, 'signedFile'])
        ->middleware('signed:relative')
        ->name('documents.file');
    Route::post('documents/callback.php', [DocumentController::class, 'callback'])
        ->name('documents.callback');

    Route::get('csrf.php', [AuthController::class, 'csrf']);
    Route::get('session.php', [AuthController::class, 'session']);
    Route::get('summary.php', [GeneralController::class, 'summary']);
    // Pública como a Home que a consome: a aba Contato mostra os ramais sem sessão.
    Route::get('contact.php', [ContactController::class, 'index']);

    Route::middleware('api.csrf')->group(function (): void {
        Route::post('login.php', [AuthController::class, 'login']);
        Route::post('access-request.php', [AuthController::class, 'requestAccess']);
        Route::post('password-reset-request.php', [AuthController::class, 'requestPasswordReset']);
        Route::post('password-reset-status.php', [AuthController::class, 'passwordResetStatus']);
        Route::post('password-reset-complete.php', [AuthController::class, 'completePasswordReset']);
    });

    Route::middleware('api.auth:allow-password-change')->group(function (): void {
        Route::post('logout.php', [AuthController::class, 'logout'])->middleware('api.csrf');
        Route::post('password-change.php', [AuthController::class, 'changePassword'])->middleware('api.csrf');
    });

    Route::middleware('api.auth')->group(function (): void {
        Route::post('presence-heartbeat.php', [AuthController::class, 'heartbeat'])->middleware('api.csrf');
        Route::get('search.php', [GeneralController::class, 'search']);
        Route::get('notifications.php', [GeneralController::class, 'notifications']);
        Route::post('profile-update.php', [ProfileController::class, 'update'])->middleware('api.csrf');
        Route::post('profile-photo.php', [ProfileController::class, 'photo'])->middleware('api.csrf');
        // Só a escrita tem rota: as preferências já saem em csrf.php e session.php.
        Route::post('preferences-save.php', [PreferencesController::class, 'save'])->middleware('api.csrf');

        Route::prefix('documents')->middleware('permission:documents.view')->group(function (): void {
            Route::get('index.php', [DocumentController::class, 'index']);
            Route::get('download.php', [DocumentController::class, 'download']);
            Route::get('preview.php', [DocumentController::class, 'preview']);
            Route::get('editor-config.php', [DocumentController::class, 'editorConfig']);
            Route::get('collaborators.php', [DocumentController::class, 'collaborators']);
            Route::post('upload.php', [DocumentController::class, 'upload'])
                ->middleware('api.csrf');
            Route::post('delete.php', [DocumentController::class, 'delete'])
                ->middleware('api.csrf');
            Route::post('share.php', [DocumentController::class, 'share'])->middleware('api.csrf');
            Route::post('force-save.php', [DocumentController::class, 'forceSave'])->middleware('api.csrf');
        });

        /*
         * O Dashboard consome apenas consultas. Ele tem rotas próprias para que
         * um usuário com dashboard.view enxergue a visão da Qualidade sem ganhar
         * acesso ao módulo administrativo nem às ações de criação/exclusão.
         */
        Route::prefix('dashboard')->middleware('permission:dashboard.view')->group(function (): void {
            Route::get('supervisors.php', [GeneralController::class, 'supervisors']);
            Route::get('quality-revision.php', [QualityController::class, 'revision']);
            Route::get('quality.php', [QualityController::class, 'dashboard']);
            Route::get('quality-reports.php', [QualityController::class, 'reports']);
            Route::get('quality-dispatches.php', [QualityController::class, 'dispatches']);
        });

        Route::prefix('admin')->group(function (): void {
            Route::get('users.php', [UserController::class, 'index'])->middleware('permission:users.manage');
            Route::post('user-save.php', [UserController::class, 'save'])
                ->middleware(['api.csrf', 'permission:users.manage']);
            Route::post('user-delete.php', [UserController::class, 'delete'])->middleware('api.csrf');
            Route::post('password-reset-decision.php', [UserController::class, 'decidePasswordReset'])
                ->middleware('api.csrf');
            Route::get('contact.php', [ContactController::class, 'admin'])
                ->middleware('permission:contact.manage');
            Route::post('contact-save.php', [ContactController::class, 'save'])
                ->middleware(['api.csrf', 'permission:contact.manage']);

            /*
             * Zona de perigo. Sem `permission:` de propósito: o cargo é conferido
             * no controller porque este acesso não é para conceder a ninguém.
             * O preparo é limitado por tentativa - ele confere uma senha.
             */
            Route::get('sector-purge.php', [SectorPurgeController::class, 'index']);
            // POST porque o token autoriza baixar e apagar o setor: numa query
            // string ele iria parar no access.log e no histórico do navegador.
            Route::post('sector-purge-download.php', [SectorPurgeController::class, 'download'])
                ->middleware('api.csrf');
            Route::post('sector-purge-prepare.php', [SectorPurgeController::class, 'prepare'])
                ->middleware(['api.csrf', 'throttle:10,1']);
            Route::post('sector-purge-confirm.php', [SectorPurgeController::class, 'confirm'])
                ->middleware('api.csrf');
        });

        Route::prefix('quality')->middleware('permission:quality.view')->group(function (): void {
            Route::get('revision.php', [QualityController::class, 'revision']);
            Route::get('options.php', [QualityController::class, 'options']);
            Route::get('dashboard.php', [QualityController::class, 'dashboard']);
            Route::get('export.php', [QualityController::class, 'export']);
            Route::get('reports.php', [QualityController::class, 'reports']);
            Route::get('report.php', [QualityController::class, 'report']);
            Route::get('dispatches.php', [QualityController::class, 'dispatches']);
            Route::get('dispatch.php', [QualityController::class, 'dispatch']);
            Route::get('complaints.php', [QualityController::class, 'complaints']);
            Route::get('complaint.php', [QualityController::class, 'complaint']);
            Route::get('action-plans.php', [ActionPlanController::class, 'index']);
            Route::get('action-plan.php', [ActionPlanController::class, 'show']);
            /*
             * O plano de ação é a tratativa da reclamação, então ele reaproveita
             * a permissão de quem já lança a reclamação: quem registra, trata.
             */
            Route::post('action-plan-create.php', [ActionPlanController::class, 'create'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.create_complaint']);
            Route::post('action-plan-entry.php', [ActionPlanController::class, 'entry'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.create_complaint']);
            Route::post('action-plan-close.php', [ActionPlanController::class, 'close'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.create_complaint']);
            Route::post('action-plan-delete.php', [ActionPlanController::class, 'delete'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.manage']);
            Route::post('report-create.php', [QualityController::class, 'createReport'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.create_rap']);
            Route::post('dispatch-create.php', [QualityController::class, 'createDispatch'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.create_dispatch']);
            Route::post('complaint-create.php', [QualityController::class, 'createComplaint'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.create_complaint']);
            Route::post('report-update.php', [QualityController::class, 'updateReport'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.edit']);
            Route::post('dispatch-update.php', [QualityController::class, 'updateDispatch'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.edit']);
            Route::post('complaint-update.php', [QualityController::class, 'updateComplaint'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.edit']);
            Route::post('import-preview.php', [QualityController::class, 'importPreview'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.import']);
            Route::post('import-confirm.php', [QualityController::class, 'importConfirm'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.import']);
            Route::get('import-history.php', [QualityController::class, 'importHistory'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware('permission:quality.import');
            Route::post('report-delete.php', [QualityController::class, 'deleteReport'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.manage']);
            Route::post('dispatch-delete.php', [QualityController::class, 'deleteDispatch'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.manage']);
            Route::post('complaint-delete.php', [QualityController::class, 'deleteComplaint'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.manage']);
            Route::get('settings.php', [QualitySettingsController::class, 'show'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware('permission:quality.manage');
            Route::post('settings-save.php', [QualitySettingsController::class, 'save'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.manage']);
        });
    });
});
