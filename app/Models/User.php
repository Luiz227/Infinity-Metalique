<?php

namespace App\Models;

use App\Support\Permissions;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;

#[Fillable([
    'name',
    'nickname',
    'email',
    'job_title',
    'sector',
    'profile_photo',
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
            ->values()
            ->all();

        if (array_intersect(
            ['quality.manage', 'quality.create_rap', 'quality.create_dispatch', 'quality.import'],
            $permissions
        ) !== []) {
            $permissions[] = 'quality.view';
        }

        return array_values(array_unique($permissions));
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
            'role' => (string) $this->role,
            'is_primary_admin' => (bool) $this->is_primary_admin,
            'is_active' => (bool) $this->is_active,
            'must_change_password' => (bool) $this->must_change_password,
            'profile_photo' => $this->profile_photo ? (string) $this->profile_photo : null,
            'permissions' => $this->permissionKeys(),
        ];
    }
}
