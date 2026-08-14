<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\Cache;

final class UserPresence
{
    private const AWAY_AFTER_MINUTES = 5;

    public static function touch(int $userId): void
    {
        self::keepAlive($userId);

        Cache::put(
            self::activityCacheKey($userId),
            now()->getTimestamp(),
            now()->addMinutes(self::sessionLifetimeMinutes()),
        );
    }

    public static function keepAlive(int $userId): void
    {
        Cache::put(
            self::loggedInCacheKey($userId),
            true,
            now()->addMinutes(self::sessionLifetimeMinutes()),
        );
    }

    public static function forget(int $userId): void
    {
        Cache::forget(self::activityCacheKey($userId));
        Cache::forget(self::loggedInCacheKey($userId));
    }

    public static function status(int $userId): string
    {
        if (Cache::get(self::loggedInCacheKey($userId)) !== true) {
            return 'offline';
        }

        $lastActivity = Cache::get(self::activityCacheKey($userId));

        if (! is_int($lastActivity) && ! is_numeric($lastActivity)) {
            return 'away';
        }

        $inactiveForSeconds = max(0, now()->getTimestamp() - (int) $lastActivity);

        if ($inactiveForSeconds < self::AWAY_AFTER_MINUTES * 60) {
            return 'online';
        }

        return 'away';
    }

    private static function activityCacheKey(int $userId): string
    {
        return "user-presence:activity:{$userId}";
    }

    private static function loggedInCacheKey(int $userId): string
    {
        return "user-presence:logged-in:{$userId}";
    }

    private static function sessionLifetimeMinutes(): int
    {
        return max(self::AWAY_AFTER_MINUTES + 1, (int) config('session.lifetime', 120));
    }
}
