<?php

namespace App\Models;

use App\Support\Permissions;
use App\Support\UserPreferences;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

#[Fillable([
    'name',
    'nickname',
    'email',
    'job_title',
    'sector',
    'employee_id',
    'profile_photo',
    'profile_photo_source',
    'profile_photo_crop',
    'password_hash',
    'role',
    'is_primary_admin',
    'is_active',
    'must_change_password',
])]
#[Hidden(['password_hash'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /** O schema compartilhado usa password_hash e nao possui remember_token. */
    protected $authPasswordName = 'password_hash';

    protected $rememberTokenName = null;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password_hash' => 'hashed',
            'profile_photo_crop' => 'array',
            'employee_id' => 'integer',
            'is_primary_admin' => 'boolean',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
        ];
    }

    /** @return list<string> */
    public function permissionKeys(): array
    {
        if ($this->role === 'admin') {
            return Permissions::keys();
        }

        $permissions = DB::table('user_permissions')
            ->where('user_id', $this->getKey())
            ->orderBy('permission')
            ->pluck('permission')
            ->map(static fn (mixed $permission): string => (string) $permission)
            ->intersect(Permissions::keys())
            // quality.edit nunca é atribuível: mesmo que um banco legado
            // contenha a chave, somente o cargo (ou role admin) pode concedê-la.
            ->reject(static fn (string $permission): bool => $permission === 'quality.edit')
            ->values()
            ->all();

        $hasQualityAccess = array_filter(
            $permissions,
            static fn (string $permission): bool => str_starts_with($permission, 'quality.')
        ) !== [];
        if ($hasQualityAccess && $this->hasQualityEditSeniority()) {
            $permissions[] = 'quality.edit';
        }

        if (array_intersect(
            [
                'quality.manage', 'quality.create_rap', 'quality.create_dispatch',
                'quality.create_complaint', 'quality.import', 'quality.edit',
            ],
            $permissions
        ) !== []) {
            $permissions[] = 'quality.view';
        }

        if (in_array('documents.manage', $permissions, true)) {
            $permissions[] = 'documents.view';
        }

        return array_values(array_unique($permissions));
    }

    /**
     * A edição dos registros é derivada do cargo e não pode ser concedida pela
     * tela de permissões. O prefixo permite cargos descritivos, como
     * "Supervisor de Qualidade", sem depender de maiúsculas ou acentos.
     */
    private function hasQualityEditSeniority(): bool
    {
        $title = Str::upper(Str::ascii(trim((string) $this->job_title)));
        $title = trim((string) preg_replace('/[^A-Z0-9]+/', ' ', $title));

        foreach ([
            'SUPERVISOR', 'SUPERVISORA', 'COORDENADOR', 'COORDENADORA', 'GERENTE',
            'SUPERINTENDENTE', 'DIRETOR', 'DIRETORA', 'PRESIDENTE',
            'VICE PRESIDENTE', 'ADMINISTRADOR', 'ADMINISTRADORA', 'HEAD', 'CEO',
        ] as $seniority) {
            if ($title === $seniority || str_starts_with($title, $seniority.' ')) {
                return true;
            }
        }

        return false;
    }

    public function hasPermission(string $permission): bool
    {
        return $this->is_active
            && ($this->role === 'admin' || in_array($permission, $this->permissionKeys(), true));
    }

    /** @return array<string, mixed> */
    public function toPublicArray(): array
    {
        return [
            'id' => (int) $this->getKey(),
            'name' => (string) $this->name,
            'nickname' => $this->nickname ? (string) $this->nickname : null,
            'email' => (string) $this->email,
            'job_title' => (string) $this->job_title,
            'sector' => (string) $this->sector,
            'employee_id' => $this->employee_id === null ? null : (int) $this->employee_id,
            'role' => (string) $this->role,
            'is_primary_admin' => (bool) $this->is_primary_admin,
            'is_active' => (bool) $this->is_active,
            'must_change_password' => (bool) $this->must_change_password,
            'profile_photo' => $this->profile_photo ? (string) $this->profile_photo : null,
            // O original e o retângulo escolhido só interessam a quem vai abrir o
            // recortador de novo - as telas que mostram o avatar param no de cima.
            'profile_photo_source' => $this->profile_photo_source ? (string) $this->profile_photo_source : null,
            'profile_photo_crop' => is_array($this->profile_photo_crop) ? $this->profile_photo_crop : null,
            'permissions' => $this->permissionKeys(),
            // Viajam junto com a sessão de propósito: é o que deixa o tema
            // salvo valer já no primeiro paint, sem uma segunda requisição.
            'preferences' => UserPreferences::forUser((int) $this->getKey()),
        ];
    }
}
