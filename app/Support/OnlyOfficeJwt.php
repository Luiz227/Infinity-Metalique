<?php

declare(strict_types=1);

namespace App\Support;

use JsonException;
use RuntimeException;

final class OnlyOfficeJwt
{
    /** @param array<string, mixed> $payload */
    public static function encode(array $payload, string $secret): string
    {
        self::assertSecret($secret);
        $header = self::base64Url(json_encode(['alg' => 'HS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $body = self::base64Url(json_encode($payload, JSON_THROW_ON_ERROR));
        $signature = self::base64Url(hash_hmac('sha256', $header.'.'.$body, $secret, true));

        return $header.'.'.$body.'.'.$signature;
    }

    /** @return array<string, mixed> */
    public static function decode(string $token, string $secret): array
    {
        self::assertSecret($secret);
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new RuntimeException('Token do editor inválido.');
        }

        [$header, $body, $signature] = $parts;
        $expected = self::base64Url(hash_hmac('sha256', $header.'.'.$body, $secret, true));
        if (! hash_equals($expected, $signature)) {
            throw new RuntimeException('Assinatura do editor inválida.');
        }

        try {
            $decodedHeader = json_decode(self::base64UrlDecode($header), true, 512, JSON_THROW_ON_ERROR);
            $payload = json_decode(self::base64UrlDecode($body), true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new RuntimeException('Token do editor inválido.', 0, $error);
        }

        if (($decodedHeader['alg'] ?? null) !== 'HS256' || ! is_array($payload)) {
            throw new RuntimeException('Token do editor inválido.');
        }

        return $payload;
    }

    private static function assertSecret(string $secret): void
    {
        if (trim($secret) === '') {
            throw new RuntimeException('A integração com o editor de documentos não foi configurada.');
        }
    }

    private static function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $value): string
    {
        $padding = (4 - strlen($value) % 4) % 4;
        $decoded = base64_decode(strtr($value.str_repeat('=', $padding), '-_', '+/'), true);
        if ($decoded === false) {
            throw new RuntimeException('Token do editor inválido.');
        }

        return $decoded;
    }
}
