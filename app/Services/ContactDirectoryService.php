<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Os ramais da fábrica e os canais públicos de contato.
 *
 * Duas leituras para dois públicos: `publicDirectory()` é o que a Home e o modal
 * do menu do perfil mostram - só o que está ativo, já agrupado por área -, e
 * `admin()` é a lista crua que o painel de administração edita, inativos
 * inclusive.
 *
 * A gravação segue o mesmo contrato do painel da Qualidade: a tela é um rascunho
 * com um botão Salvar, então ou o payload inteiro entra numa transação, ou nada
 * muda. Meio-termo gravado deixaria a lista pública num estado que ninguém pediu.
 */
final class ContactDirectoryService
{
    private const AREA_LIMIT = 60;

    private const SECTOR_LIMIT = 80;

    private const PEOPLE_LIMIT = 120;

    private const NUMBER_LIMIT = 10;

    private const CONTACT_LIMIT = 255;

    /** As chaves de `contact_settings`, na ordem em que aparecem no painel. */
    private const CONTACT_KEYS = ['phone', 'email', 'address', 'hours'];

    /**
     * O que a tela pública consome: contatos gerais e os ramais ativos agrupados
     * por área. A ordem dos grupos é a ordem de aparição das linhas - a primeira
     * linha de uma área é quem coloca o grupo no lugar dele.
     *
     * @return array<string, mixed>
     */
    public function publicDirectory(): array
    {
        $areas = [];

        foreach ($this->rows(true) as $row) {
            $area = (string) $row->area;
            $areas[$area] ??= ['area' => $area, 'extensions' => []];
            $areas[$area]['extensions'][] = [
                'id' => (int) $row->id,
                'sector' => (string) $row->sector,
                'people' => $row->people ? (string) $row->people : null,
                'number' => (string) $row->number,
            ];
        }

        return [
            'contacts' => $this->contacts(),
            'areas' => array_values($areas),
        ];
    }

    /** @return array<string, mixed> */
    public function admin(): array
    {
        $extensions = array_map(static fn (object $row): array => [
            'id' => (int) $row->id,
            'area' => (string) $row->area,
            'sector' => (string) $row->sector,
            'people' => $row->people ? (string) $row->people : '',
            'number' => (string) $row->number,
            'position' => (int) $row->position,
            'active' => (bool) $row->is_active,
        ], $this->rows(false));

        return ['contacts' => $this->contacts(), 'extensions' => $extensions];
    }

    /**
     * Grava o painel inteiro de uma vez.
     *
     * @param  array<string, mixed>  $input
     * @return array{success: bool, message: string}
     */
    public function save(array $input): array
    {
        $fail = static fn (string $message): array => ['success' => false, 'message' => $message];

        $extensions = $this->parseExtensions($input['extensions'] ?? []);
        if (is_string($extensions)) {
            return $fail($extensions);
        }

        $contacts = $this->parseContacts($input['contacts'] ?? []);
        if (is_string($contacts)) {
            return $fail($contacts);
        }

        DB::transaction(function () use ($extensions, $contacts): void {
            // O que sumiu do payload é remoção. Ramal não deixa histórico preso a
            // ele (nenhum registro guarda o id), então apagar é apagar.
            $kept = array_values(array_filter(
                array_column($extensions, 'id'),
                static fn (?int $id): bool => $id !== null,
            ));
            DB::table('phone_extensions')->whereNotIn('id', $kept === [] ? [0] : $kept)->delete();

            foreach ($extensions as $position => $extension) {
                $row = [
                    'area' => $extension['area'],
                    'sector' => $extension['sector'],
                    'people' => $extension['people'] === '' ? null : $extension['people'],
                    'number' => $extension['number'],
                    'position' => $position + 1,
                    'is_active' => $extension['active'],
                ];
                $extension['id'] === null
                    ? DB::table('phone_extensions')->insert($row)
                    : DB::table('phone_extensions')->where('id', $extension['id'])->update($row);
            }

            foreach ($contacts as $name => $value) {
                DB::table('contact_settings')->updateOrInsert(
                    ['name' => $name],
                    ['value' => $value === '' ? null : $value, 'updated_at' => now()],
                );
            }
        });

        return ['success' => true, 'message' => 'Ramais e contatos salvos.'];
    }

    /** @return list<object> */
    private function rows(bool $onlyActive): array
    {
        return DB::table('phone_extensions')
            ->when($onlyActive, static fn ($query) => $query->where('is_active', true))
            ->orderBy('position')
            ->orderBy('id')
            ->get(['id', 'area', 'sector', 'people', 'number', 'position', 'is_active'])
            ->all();
    }

    /** @return array<string, string|null> */
    private function contacts(): array
    {
        $stored = DB::table('contact_settings')->pluck('value', 'name');
        $contacts = [];

        foreach (self::CONTACT_KEYS as $key) {
            $value = $stored[$key] ?? null;
            $contacts[$key] = $value === null || $value === '' ? null : (string) $value;
        }

        return $contacts;
    }

    /**
     * @return list<array{id: int|null, area: string, sector: string, people: string, number: string, active: bool}>|string
     */
    private function parseExtensions(mixed $input): array|string
    {
        $extensions = [];
        $seen = [];

        foreach (is_array($input) ? $input : [] as $item) {
            if (! is_array($item)) {
                continue;
            }

            $area = $this->text($item['area'] ?? null, self::AREA_LIMIT);
            if ($area === '') {
                return 'Todo ramal precisa de uma área - o prédio ou o andar onde ele fica.';
            }

            $sector = $this->text($item['sector'] ?? null, self::SECTOR_LIMIT);
            if ($sector === '') {
                return 'Todo ramal precisa do nome do setor.';
            }

            $number = $this->text($item['number'] ?? null, self::NUMBER_LIMIT);
            if (preg_match('/^\d{2,10}$/', $number) !== 1) {
                return "O ramal de {$sector} precisa ser um número de 2 a 10 dígitos.";
            }
            if (isset($seen[$number])) {
                return "O ramal {$number} aparece duas vezes na lista.";
            }
            $seen[$number] = true;

            $extensions[] = [
                'id' => $this->identifier($item['id'] ?? null),
                'area' => $area,
                'sector' => $sector,
                'people' => $this->text($item['people'] ?? null, self::PEOPLE_LIMIT),
                'number' => $number,
                'active' => filter_var($item['active'] ?? true, FILTER_VALIDATE_BOOLEAN),
            ];
        }

        return $extensions;
    }

    /** @return array<string, string>|string */
    private function parseContacts(mixed $input): array|string
    {
        $input = is_array($input) ? $input : [];
        $contacts = [];

        foreach (self::CONTACT_KEYS as $key) {
            $contacts[$key] = $this->text($input[$key] ?? null, self::CONTACT_LIMIT);
        }

        if ($contacts['email'] !== '' && filter_var($contacts['email'], FILTER_VALIDATE_EMAIL) === false) {
            return 'O e-mail de contato não parece um endereço válido.';
        }

        return $contacts;
    }

    private function identifier(mixed $value): ?int
    {
        return is_numeric($value) && (int) $value > 0 ? (int) $value : null;
    }

    /**
     * Sem espaço sobrando e sem quebra de linha. Aqui não há caixa alta forçada:
     * endereço e horário são frases, e o rótulo do setor é escolha de quem edita.
     */
    private function text(mixed $value, int $limit): string
    {
        $value = is_string($value) ? trim(preg_replace('/\s+/', ' ', $value) ?? '') : '';

        return mb_substr($value, 0, $limit);
    }
}
