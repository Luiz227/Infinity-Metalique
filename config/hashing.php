<?php

return [
    /*
     * Argon2id combina resistência a ataques por GPU e por canais laterais.
     * Os custos podem ser ajustados por ambiente sem alterar o código.
     */
    'driver' => env('HASH_DRIVER', 'argon2id'),

    'bcrypt' => [
        'rounds' => env('BCRYPT_ROUNDS', 12),
        'verify' => false,
        'limit' => null,
    ],

    'argon' => [
        'memory' => env('ARGON_MEMORY', 65536),
        'time' => env('ARGON_TIME', 4),
        'threads' => env('ARGON_THREADS', 2),
        // Permite validar hashes antigos para migrá-los no próximo login.
        'verify' => false,
    ],
];
