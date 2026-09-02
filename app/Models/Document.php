<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'title',
    'category',
    'sector',
    'original_name',
    'storage_path',
    'mime_type',
    'extension',
    'size_bytes',
    'version',
    'branded_at',
    'created_by_user_id',
    'updated_by_user_id',
])]
final class Document extends Model
{
    protected function casts(): array
    {
        return ['branded_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_user_id');
    }

    public function editors(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(User::class, 'document_editors')
            ->withPivot('authorized_by_user_id')
            ->withTimestamps();
    }
}
