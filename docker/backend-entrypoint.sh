#!/bin/sh
set -eu

mkdir -p \
    storage/framework/cache/data \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs \
    bootstrap/cache \
    public/assets/uploads/profiles \
    public/assets/uploads/dispatches

chown -R www-data:www-data storage bootstrap/cache public/assets/uploads

rm -f bootstrap/cache/*.php
php artisan package:discover --ansi
php artisan config:clear --ansi

attempt=1
until php -r '
    try {
        new PDO(
            sprintf("mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4", getenv("DB_HOST"), getenv("DB_PORT"), getenv("DB_DATABASE")),
            getenv("DB_USERNAME"),
            getenv("DB_PASSWORD"),
            [PDO::ATTR_TIMEOUT => 3]
        );
    } catch (Throwable $exception) {
        exit(1);
    }
'; do
    if [ "$attempt" -ge 30 ]; then
        echo "Banco de dados indisponivel apos 30 tentativas." >&2
        exit 1
    fi

    echo "Aguardando o banco de dados (tentativa $attempt/30)..."
    attempt=$((attempt + 1))
    sleep 2
done

php artisan migrate --force --ansi
php artisan config:cache --ansi

exec "$@"
