<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Input;
use App\Support\UserPresence;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Throwable;

final class AuthController extends Controller
{
    public function csrf(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user !== null && ! $user->is_active) {
            Auth::logout();
            $user = null;
        }

        if ($user !== null) {
            UserPresence::touch((int) $user->getKey());
        }

        return response()->json([
            'csrfToken' => $request->session()->token(),
            'user' => $user?->toPublicArray(),
        ]);
    }

    public function session(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user === null || ! $user->is_active) {
            return response()->json(['user' => null], 401);
        }

        return response()->json(['user' => $user->toPublicArray()]);
    }

    public function login(Request $request): JsonResponse
    {
        $email = Input::email($request->input('email'));
        $password = (string) $request->input('password', '');

        try {
            $user = User::query()->where('email', $email)->where('is_active', true)->first();
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível acessar o banco de dados.'], 503);
        }

        if ($user === null || ! Hash::check($password, (string) $user->password_hash)) {
            return response()->json(['message' => 'E-mail ou senha inválidos.'], 401);
        }

        Auth::login($user);
        $request->session()->regenerate();
        UserPresence::touch((int) $user->getKey());

        return response()->json([
            'message' => 'Login realizado com sucesso.',
            'user' => $user->fresh()->toPublicArray(),
            'csrfToken' => $request->session()->token(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $userId = $request->user()?->getKey();

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        if ($userId !== null) {
            UserPresence::forget((int) $userId);
        }

        return response()->json([
            'message' => 'Sessão encerrada.',
            'csrfToken' => $request->session()->token(),
        ]);
    }

    public function heartbeat(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        UserPresence::touch((int) $user->getKey());

        return response()->json(['presence' => 'online']);
    }

    public function requestAccess(Request $request): JsonResponse
    {
        $name = Input::name($request->input('name'));
        $sector = Input::name($request->input('sector'));
        $jobTitle = Input::name($request->input('jobTitle'));
        $admissionDate = (string) $request->input('admissionDate', '');

        if (strlen($name) < 3 || strlen($name) > 120) {
            return response()->json(['message' => 'Informe um nome completo válido.'], 422);
        }
        if (strlen($sector) < 2 || strlen($sector) > 120) {
            return response()->json(['message' => 'Informe um setor válido.'], 422);
        }
        if (strlen($jobTitle) < 2 || strlen($jobTitle) > 120) {
            return response()->json(['message' => 'Informe um cargo válido.'], 422);
        }

        try {
            $date = CarbonImmutable::createFromFormat('!Y-m-d', $admissionDate);
        } catch (Throwable) {
            $date = null;
        }

        if ($date === null || $date->format('Y-m-d') !== $admissionDate || $date->isFuture()) {
            return response()->json(['message' => 'Informe uma data de admissão válida.'], 422);
        }

        try {
            $pending = DB::table('access_requests')
                ->where('name', $name)
                ->where('admission_date', $admissionDate)
                ->where('status', 'pending')
                ->exists();

            if ($pending) {
                return response()->json([
                    'message' => 'Já existe uma solicitação pendente para este colaborador.',
                ], 422);
            }

            DB::table('access_requests')->insert([
                'name' => $name,
                'sector' => $sector,
                'job_title' => $jobTitle,
                'admission_date' => $admissionDate,
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (QueryException) {
            return response()->json([
                'message' => 'Não foi possível acessar o banco de dados. Verifique o MySQL do XAMPP.',
            ], 503);
        }

        return response()->json(['message' => 'Solicitação de acesso enviada com sucesso.'], 201);
    }

    public function changePassword(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $currentPassword = (string) $request->input('currentPassword', '');
        $newPassword = (string) $request->input('newPassword', '');
        $confirmation = (string) $request->input('confirmation', '');

        if ($error = Input::passwordPolicyError($newPassword)) {
            return response()->json(['message' => $error], 422);
        }
        if ($newPassword !== $confirmation) {
            return response()->json(['message' => 'A confirmação da nova senha não confere.'], 422);
        }
        if (! Hash::check($currentPassword, (string) $user->password_hash)) {
            return response()->json(['message' => 'A senha atual está incorreta.'], 422);
        }
        if (Hash::check($newPassword, (string) $user->password_hash)) {
            return response()->json(['message' => 'Escolha uma senha diferente da atual.'], 422);
        }

        try {
            $user->forceFill([
                'password_hash' => Hash::make($newPassword),
                'must_change_password' => false,
            ])->save();
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível alterar a senha.'], 503);
        }

        return response()->json([
            'message' => 'Senha alterada com sucesso.',
            'user' => $user->fresh()->toPublicArray(),
        ]);
    }

    public function requestPasswordReset(Request $request): JsonResponse
    {
        $email = Input::email($request->input('email'));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            return response()->json(['message' => 'Informe um e-mail válido.'], 422);
        }

        $generic = 'Se o e-mail estiver cadastrado, a solicitação será enviada ao administrador.';

        try {
            $userId = (int) (User::query()
                ->where('email', $email)
                ->where('is_active', true)
                ->value('id') ?? 0);

            if ($userId === 0) {
                return response()->json(['message' => $generic]);
            }

            $existing = DB::table('password_reset_requests')
                ->where('user_id', $userId)
                ->where(function ($query): void {
                    $query->where('status', 'pending')
                        ->orWhere(function ($approved): void {
                            $approved->where('status', 'approved')->where('expires_at', '>', now());
                        });
                })
                ->exists();

            if ($existing) {
                return response()->json([
                    'message' => 'Já existe uma solicitação em análise para este usuário.',
                    'alreadyPending' => true,
                ]);
            }

            $token = bin2hex(random_bytes(32));
            DB::table('password_reset_requests')->insert([
                'user_id' => $userId,
                'request_token_hash' => hash('sha256', $token),
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível solicitar a recuperação de senha.'], 503);
        }

        return response()->json([
            'message' => 'Solicitação enviada. Aguarde a aprovação do administrador.',
            'requestToken' => $token,
        ]);
    }

    public function passwordResetStatus(Request $request): JsonResponse
    {
        $email = Input::email($request->input('email'));
        $token = (string) $request->input('requestToken', '');

        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || ! preg_match('/^[a-f0-9]{64}$/', $token)) {
            return response()->json(['status' => 'invalid']);
        }

        try {
            $record = DB::table('password_reset_requests as request')
                ->join('users as user', 'user.id', '=', 'request.user_id')
                ->where('user.email', $email)
                ->where('request.request_token_hash', hash('sha256', $token))
                ->orderByDesc('request.id')
                ->select('request.status', 'request.expires_at')
                ->first();
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível consultar a solicitação.'], 503);
        }

        if ($record === null) {
            return response()->json(['status' => 'invalid']);
        }

        $status = (string) $record->status;
        if ($status === 'approved' && ($record->expires_at === null || now()->gte($record->expires_at))) {
            $status = 'expired';
        }

        return response()->json(['status' => $status]);
    }

    public function completePasswordReset(Request $request): JsonResponse
    {
        $email = Input::email($request->input('email'));
        $token = (string) $request->input('requestToken', '');
        $newPassword = (string) $request->input('newPassword', '');
        $confirmation = (string) $request->input('confirmation', '');

        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || ! preg_match('/^[a-f0-9]{64}$/', $token)) {
            return response()->json(['message' => 'Solicitação de recuperação inválida.'], 422);
        }
        if ($error = Input::passwordPolicyError($newPassword)) {
            return response()->json(['message' => $error], 422);
        }
        if ($newPassword !== $confirmation) {
            return response()->json(['message' => 'A confirmação da nova senha não confere.'], 422);
        }

        try {
            $completed = DB::transaction(function () use ($email, $token, $newPassword): bool {
                $record = DB::table('password_reset_requests as request')
                    ->join('users as user', function ($join): void {
                        $join->on('user.id', '=', 'request.user_id')->where('user.is_active', true);
                    })
                    ->where('user.email', $email)
                    ->where('request.request_token_hash', hash('sha256', $token))
                    ->where('request.status', 'approved')
                    ->where('request.expires_at', '>', now())
                    ->orderByDesc('request.id')
                    ->select('request.id', 'request.user_id')
                    ->lockForUpdate()
                    ->first();

                if ($record === null) {
                    return false;
                }

                User::query()->whereKey($record->user_id)->update([
                    'password_hash' => Hash::make($newPassword),
                    'must_change_password' => false,
                ]);
                DB::table('password_reset_requests')->where('id', $record->id)->update([
                    'status' => 'completed',
                    'updated_at' => now(),
                ]);

                return true;
            });
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível cadastrar a nova senha.'], 503);
        }

        if (! $completed) {
            return response()->json(['message' => 'A aprovação expirou ou não é mais válida.'], 422);
        }

        return response()->json(['message' => 'Senha alterada com sucesso. Você já pode entrar no sistema.']);
    }
}
