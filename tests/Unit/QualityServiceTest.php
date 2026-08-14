<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\QualityService;
use PHPUnit\Framework\TestCase;

final class QualityServiceTest extends TestCase
{
    public function test_normaliza_intervalo_de_datas_do_dashboard(): void
    {
        $filters = (new QualityService())->filters([
            'startDate' => '2026-08-31',
            'endDate' => '2026-08-01',
        ]);

        self::assertSame('2026-08-01', $filters['startDate']);
        self::assertSame('2026-08-31', $filters['endDate']);
    }

    public function test_descarta_datas_invalidas(): void
    {
        $filters = (new QualityService())->filters([
            'startDate' => '31/08/2026',
            'endDate' => '2026-02-30',
        ]);

        self::assertNull($filters['startDate']);
        self::assertNull($filters['endDate']);
    }
}
