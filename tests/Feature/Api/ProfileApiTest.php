<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class ProfileApiTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private array $created = [];

    protected function tearDown(): void
    {
        // O UploadService grava direto em public/, fora de qualquer disco falso:
        // sem isto cada rodada deixaria imagens espalhadas no repositório.
        foreach ($this->created as $path) {
            $full = public_path($path);
            if (is_file($full)) {
                @unlink($full);
            }
        }
        $this->created = [];

        parent::tearDown();
    }

    /** @return array{0: User, 1: string} */
    private function signIn(): array
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        return [$user, (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken')];
    }

    /** @param array<string, mixed> $extra */
    private function sendPhoto(string $token, array $extra = []): TestResponse
    {
        $response = $this->post('/backend/api/profile-photo.php', array_merge([
            'csrfToken' => $token,
            'profilePhoto' => UploadedFile::fake()->image('recorte.jpg', 512, 512),
        ], $extra));

        foreach (['user.profile_photo', 'user.profile_photo_source'] as $key) {
            $path = $response->json($key);
            if (is_string($path)) {
                $this->created[] = $path;
            }
        }

        return $response;
    }

    public function test_envio_grava_o_recorte_o_original_e_o_enquadramento(): void
    {
        [$user, $token] = $this->signIn();

        $response = $this->sendPhoto($token, [
            'profilePhotoSource' => UploadedFile::fake()->image('original.jpg', 1600, 1200),
            'crop' => json_encode(['x' => 120, 'y' => 40, 'size' => 900]),
        ])->assertOk();

        $photo = (string) $response->json('user.profile_photo');
        $source = (string) $response->json('user.profile_photo_source');

        $this->assertStringStartsWith('assets/uploads/profiles/', $photo);
        $this->assertStringStartsWith('assets/uploads/profiles/', $source);
        $this->assertNotSame($photo, $source);
        $this->assertFileExists(public_path($photo));
        $this->assertFileExists(public_path($source));
        $response->assertJsonPath('user.profile_photo_crop', ['x' => 120, 'y' => 40, 'size' => 900]);

        $user->refresh();
        $this->assertSame($photo, $user->profile_photo);
        $this->assertSame($source, $user->profile_photo_source);
    }

    public function test_reposicionar_troca_o_recorte_e_preserva_o_original(): void
    {
        [$user, $token] = $this->signIn();

        $first = $this->sendPhoto($token, [
            'profilePhotoSource' => UploadedFile::fake()->image('original.jpg', 1600, 1200),
            'crop' => json_encode(['x' => 0, 'y' => 0, 'size' => 1200]),
        ])->assertOk();
        $oldPhoto = (string) $first->json('user.profile_photo');
        $source = (string) $first->json('user.profile_photo_source');

        // Reposicionar manda recorte e retângulo novos, mas nenhum original: o
        // que já está guardado precisa continuar de pé.
        $second = $this->sendPhoto($token, [
            'crop' => json_encode(['x' => 300, 'y' => 150, 'size' => 600]),
        ])->assertOk();

        $second->assertJsonPath('user.profile_photo_source', $source)
            ->assertJsonPath('user.profile_photo_crop', ['x' => 300, 'y' => 150, 'size' => 600]);

        $newPhoto = (string) $second->json('user.profile_photo');
        $this->assertNotSame($oldPhoto, $newPhoto);
        $this->assertFileExists(public_path($source));
        $this->assertFileExists(public_path($newPhoto));
        $this->assertFileDoesNotExist(public_path($oldPhoto));

        $user->refresh();
        $this->assertSame($source, $user->profile_photo_source);
    }

    public function test_trocar_o_original_apaga_o_anterior_do_disco(): void
    {
        [, $token] = $this->signIn();

        $first = $this->sendPhoto($token, [
            'profilePhotoSource' => UploadedFile::fake()->image('original.jpg', 1600, 1200),
        ])->assertOk();
        $oldSource = (string) $first->json('user.profile_photo_source');

        $second = $this->sendPhoto($token, [
            'profilePhotoSource' => UploadedFile::fake()->image('outro.jpg', 1200, 1200),
        ])->assertOk();
        $newSource = (string) $second->json('user.profile_photo_source');

        $this->assertNotSame($oldSource, $newSource);
        $this->assertFileExists(public_path($newSource));
        $this->assertFileDoesNotExist(public_path($oldSource));
    }

    public function test_enquadramento_invalido_grava_nulo_sem_recusar_a_foto(): void
    {
        [, $token] = $this->signIn();

        $this->sendPhoto($token, ['crop' => 'nem json isto e'])
            ->assertOk()
            ->assertJsonPath('user.profile_photo_crop', null);

        $this->sendPhoto($token, ['crop' => json_encode(['x' => 0, 'y' => 0, 'size' => 0])])
            ->assertOk()
            ->assertJsonPath('user.profile_photo_crop', null);
    }

    public function test_envio_sem_imagem_e_recusado(): void
    {
        [, $token] = $this->signIn();

        $this->post('/backend/api/profile-photo.php', ['csrfToken' => $token])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Escolha uma imagem para continuar.');
    }
}
