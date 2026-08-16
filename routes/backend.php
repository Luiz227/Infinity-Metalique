<?php

declare(strict_types=1);

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\GeneralController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\QualityController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('backend/api')->group(function (): void {
    Route::get('csrf.php', [AuthController::class, 'csrf']);
    Route::get('session.php', [AuthController::class, 'session']);
    Route::get('summary.php', [GeneralController::class, 'summary']);

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

        /*
         * O Dashboard consome apenas consultas. Ele tem rotas próprias para que
         * um usuário com dashboard.view enxergue a visão da Qualidade sem ganhar
         * acesso ao módulo administrativo nem às ações de criação/exclusão.
         */
        Route::prefix('dashboard')->middleware('permission:dashboard.view')->group(function (): void {
            Route::get('supervisors.php', [GeneralController::class, 'supervisors']);
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
        });

        Route::prefix('quality')->middleware('permission:quality.view')->group(function (): void {
            Route::get('options.php', [QualityController::class, 'options']);
            Route::get('dashboard.php', [QualityController::class, 'dashboard']);
            Route::get('reports.php', [QualityController::class, 'reports']);
            Route::get('report.php', [QualityController::class, 'report']);
            Route::get('dispatches.php', [QualityController::class, 'dispatches']);
            Route::get('dispatch.php', [QualityController::class, 'dispatch']);
            Route::post('report-create.php', [QualityController::class, 'createReport'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.create_rap']);
            Route::post('dispatch-create.php', [QualityController::class, 'createDispatch'])
                ->withoutMiddleware('permission:quality.view')
                ->middleware(['api.csrf', 'permission:quality.create_dispatch']);
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
        });
    });
});
