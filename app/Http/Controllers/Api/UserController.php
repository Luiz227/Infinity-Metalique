<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\UploadService;
use App\Support\Input;
use App\Support\Permissions;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

final class UserController extends Controller
{
    public function index(): JsonResponse
    {
        try {
            $users = User::query()
                ->orderByDesc('is_primary_admin')
                ->orderBy('name')
                ->get()
                ->map(static fn (User $user): array => [
                    'id' => (int) $user->id,
                    'name' => (string) $user->name,
                    'email' => (string) $user->email,
                    'job_title' => (string) $user->job_title,
                    'sector' => (string) $user->sector,
                    'employee_id' => $user->employee_id === null ? null : (int) $user->employee_id,
                    'employee_name' => $user->employee_id === null ? null : (string) DB::table('employees')
                        ->where('id', $user->employee_id)
                        ->value('name'),
                    'role' => (string) $user->role,
                    'is_primary_admin' => (bool) $user->is_primary_admin,
                    'is_active' => (bool) $user->is_active,
                    'must_change_password' => (bool) $user->must_change_password,
                    'profile_photo' => $user->profile_photo ? (string) $user->profile_photo : null,
                    'created_at' => (string) $user->created_at,
                    'permissions' => $user->permissionKeys(),
                ])
                ->all();
            $employees = DB::table('employees')
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(static fn (object $employee): array => [
                    'id' => (int) $employee->id,
                    'name' => (string) $employee->name,
                ])
                ->all();
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar os usuários.'], 503);
        }

        return response()->json([
            'users' => $users,
            'permissions' => Permissions::definitions(),
            'employees' => $employees,
        ]);
    }

    public function save(Request $request): JsonResponse
    {
        /** @var User $administrator */
        $administrator = $request->user();
        $id = max(0, $request->integer('id'));
        $name = Input::name($request->input('name'));
        $email = Input::email($request->input('email'));
        $jobTitle = Input::name($request->input('jobTitle'));
        $sector = Input::name($request->input('sector'));
        $employeeId = max(0, $request->integer('employeeId'));
        $employeeId = $employeeId > 0 ? $employeeId : null;
        $role = (string) $request->input('role', 'user');
        $password = (string) $request->input('password', '');
        $isActive = filter_var($request->input('isActive', true), FILTER_VALIDATE_BOOL);
        $submitted = is_array($request->input('permissions')) ? $request->input('permissions') : [];
        $permissions = array_values(array_unique(array_intersect(
            array_map('strval', $submitted),
            Permissions::assignableKeys()
        )));

        if (strlen($name) < 3 || strlen($name) > 120) {
            return response()->json(['message' => 'Informe um nome válido de 3 a 120 caracteres.'], 422);
        }
        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            return response()->json(['message' => 'Informe um e-mail válido.'], 422);
        }
        if (strlen($jobTitle) < 2 || strlen($jobTitle) > 100) {
            return response()->json(['message' => 'Informe um cargo válido.'], 422);
        }
        if (strlen($sector) < 2 || strlen($sector) > 120) {
            return response()->json(['message' => 'Informe um setor válido.'], 422);
        }
        if (! in_array($role, ['admin', 'user'], true)) {
            return response()->json(['message' => 'Escolha um tipo de conta válido.'], 422);
        }
        if ($employeeId !== null && ! DB::table('employees')->where('id', $employeeId)->where('is_active', true)->exists()) {
            return response()->json(['message' => 'O colaborador selecionado nÃ£o existe mais.'], 422);
        }
        if ($employeeId !== null && DB::table('users')
            ->where('employee_id', $employeeId)
            ->when($id > 0, static fn ($query) => $query->where('id', '<>', $id))
            ->exists()) {
            return response()->json(['message' => 'Este colaborador jÃ¡ estÃ¡ vinculado a outra conta.'], 422);
        }
        /*
         * `users.manage` é permissão de administrar contas, não de fabricar
         * pares. Sem esta linha, quem a tem cria uma conta `admin`, entra nela e
         * alcança tudo que é restrito ao cargo - inclusive a zona de perigo.
         */
        if ($role === 'admin' && $administrator->role !== 'admin') {
            return response()->json([
                'message' => 'Somente administradores podem conceder o cargo de administrador.',
            ], 403);
        }
        if ($id === 0 && $password === '') {
            return response()->json(['message' => 'Informe uma senha inicial.'], 422);
        }
        if ($id > 0 && $password !== '') {
            return response()->json([
                'message' => 'Administradores não podem alterar a senha de outros usuários.',
            ], 422);
        }
        if ($password !== '' && ($error = Input::passwordPolicyError($password))) {
            return response()->json(['message' => $error], 422);
        }

        if ($role === 'admin') {
            $permissions = Permissions::assignableKeys();
        } else {
            $quality = [
                'quality.manage', 'quality.create_rap', 'quality.create_dispatch',
                'quality.create_complaint', 'quality.import',
                'quality.raps', 'quality.units', 'quality.products', 'quality.dispatches',
                'quality.employees', 'quality.satisfaction', 'quality.records',
            ];
            if (array_intersect($quality, $permissions) !== []) {
                $permissions[] = 'quality.view';
            }
            if (in_array('documents.manage', $permissions, true)) {
                $permissions[] = 'documents.view';
            }
            $permissions = array_values(array_unique($permissions));
        }

        if ($permissions === []) {
            return response()->json(['message' => 'Selecione pelo menos uma permissão para a conta.'], 422);
        }

        $isNew = $id === 0;

        try {
            $result = DB::transaction(function () use (
                $administrator, &$id, $name, $email, $jobTitle, $sector, $employeeId, $role,
                $password, $isActive, $permissions, $isNew
            ): array {
                if (! $isNew) {
                    $target = User::query()->lockForUpdate()->find($id);
                    if ($target === null) {
                        return ['error' => 'Usuário não encontrado.', 'status' => 404];
                    }
                    if ($target->is_primary_admin) {
                        return ['error' => 'A conta administradora principal é protegida.', 'status' => 422];
                    }
                    if ($id === (int) $administrator->id && (! $isActive || $role !== 'admin')) {
                        return ['error' => 'Você não pode remover o próprio acesso administrativo.', 'status' => 422];
                    }
                    /*
                     * O simétrico do guarda lá de cima: não é escalada, mas quem
                     * tem `users.manage` poderia rebaixar ou desativar todos os
                     * administradores e, com isso, trancar a zona de perigo por
                     * fora. Só o cargo mexe no cargo.
                     */
                    if ($target->role === 'admin' && $administrator->role !== 'admin') {
                        return [
                            'error' => 'Somente administradores podem alterar uma conta administradora.',
                            'status' => 403,
                        ];
                    }

                    $values = [
                        'name' => $name,
                        'email' => $email,
                        'job_title' => $jobTitle,
                        'sector' => $sector,
                        'employee_id' => $employeeId,
                        'role' => $role,
                        'is_active' => $isActive,
                    ];
                    $target->forceFill($values)->save();
                    $message = 'Usuário atualizado com sucesso.';
                } else {
                    $target = User::query()->create([
                        'name' => $name,
                        'email' => $email,
                        'job_title' => $jobTitle,
                        'sector' => $sector,
                        'employee_id' => $employeeId,
                        'password_hash' => Hash::make($password),
                        'role' => $role,
                        'is_active' => $isActive,
                        'must_change_password' => true,
                    ]);
                    $id = (int) $target->id;
                    $message = 'Usuário criado com sucesso.';
                }

                DB::table('user_permissions')->where('user_id', $id)->delete();
                DB::table('user_permissions')->insert(array_map(
                    static fn (string $permission): array => [
                        'user_id' => $id,
                        'permission' => $permission,
                        'created_at' => now(),
                    ],
                    $permissions
                ));

                DB::table('access_requests')
                    ->where('status', 'pending')
                    ->where(function ($query) use ($email, $name): void {
                        $query->where('email', $email)
                            ->orWhere(function ($withoutEmail) use ($name): void {
                                $withoutEmail->whereNull('email')->where('name', $name);
                            });
                    })
                    ->update(['status' => 'approved', 'updated_at' => now()]);

                return ['message' => $message];
            });
        } catch (QueryException $error) {
            if ((string) $error->getCode() === '23000') {
                return response()->json(['message' => 'Já existe uma conta com este e-mail.'], 409);
            }

            return response()->json(['message' => 'Não foi possível salvar o usuário.'], 503);
        }

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], $result['status']);
        }

        return response()->json(['message' => $result['message'], 'id' => $id], $isNew ? 201 : 200);
    }

    public function delete(Request $request, UploadService $uploads): JsonResponse
    {
        /** @var User $administrator */
        $administrator = $request->user();
        if ($administrator->role !== 'admin') {
            return response()->json(['message' => 'Somente administradores podem excluir contas.'], 403);
        }

        $id = max(0, $request->integer('id'));
        if ($id === 0) {
            return response()->json(['message' => 'Usuário inválido.'], 422);
        }

        try {
            $result = DB::transaction(function () use ($id, $administrator): array {
                $target = User::query()->lockForUpdate()->find($id);
                if ($target === null) {
                    return ['error' => 'Usuário não encontrado.', 'status' => 404];
                }
                if ($target->is_primary_admin) {
                    return ['error' => 'A conta administradora principal não pode ser excluída.', 'status' => 422];
                }
                if ($id === (int) $administrator->id) {
                    return ['error' => 'Você não pode excluir a própria conta.', 'status' => 422];
                }

                // A foto de perfil são dois arquivos: o recorte que as telas mostram
                // e o original de onde ele saiu. Levar só o primeiro deixaria o
                // segundo órfão em assets/uploads/profiles.
                $data = [
                    'name' => (string) $target->name,
                    'photos' => array_filter([$target->profile_photo, $target->profile_photo_source]),
                ];
                $target->delete();

                return $data;
            });
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível excluir a conta.'], 503);
        }

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], $result['status']);
        }
        $uploads->remove(array_map(strval(...), $result['photos']));

        return response()->json(['message' => 'Conta de '.$result['name'].' excluída com sucesso.']);
    }

    public function decidePasswordReset(Request $request): JsonResponse
    {
        /** @var User $administrator */
        $administrator = $request->user();
        if ($administrator->role !== 'admin') {
            return response()->json(['message' => 'Somente administradores podem analisar esta solicitação.'], 403);
        }

        $id = max(0, $request->integer('id'));
        $decision = (string) $request->input('decision', '');
        if ($id === 0 || ! in_array($decision, ['approve', 'reject'], true)) {
            return response()->json(['message' => 'Decisão inválida.'], 422);
        }

        try {
            $result = DB::transaction(function () use ($id, $decision, $administrator): ?string {
                $record = DB::table('password_reset_requests')
                    ->where('id', $id)->where('status', 'pending')->lockForUpdate()->first();
                if ($record === null) {
                    return null;
                }

                $approved = $decision === 'approve';
                DB::table('password_reset_requests')->where('id', $id)->update([
                    'status' => $approved ? 'approved' : 'rejected',
                    'reviewed_by_user_id' => $administrator->id,
                    'reviewed_at' => now(),
                    'expires_at' => $approved ? now()->addDay() : null,
                    'updated_at' => now(),
                ]);

                return $approved ? 'Recuperação de senha aprovada.' : 'Recuperação de senha recusada.';
            });
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível analisar a solicitação.'], 503);
        }

        if ($result === null) {
            return response()->json(['message' => 'Esta solicitação já foi analisada.'], 409);
        }

        return response()->json(['message' => $result]);
    }
}
