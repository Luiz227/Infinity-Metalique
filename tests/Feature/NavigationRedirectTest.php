<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class NavigationRedirectTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['app.frontend_url' => 'http://127.0.0.1:5173']);
    }

    public function test_a_raiz_redireciona_para_o_frontend(): void
    {
        $this->get('/')->assertRedirect('http://127.0.0.1:5173/');
    }

    public function test_login_redireciona_para_a_tela_de_login(): void
    {
        $this->get('/login')->assertRedirect('http://127.0.0.1:5173/login');
    }

    public function test_cadastro_redireciona_para_solicitar_acesso(): void
    {
        $this->get('/cadastro')->assertRedirect('http://127.0.0.1:5173/solicitar-acesso');
    }

    public function test_sistema_sem_sessao_volta_para_o_login(): void
    {
        $this->get('/sistema')->assertRedirect('http://127.0.0.1:5173/login');
    }

    public function test_a_url_do_frontend_respeita_a_configuracao(): void
    {
        config(['app.frontend_url' => 'https://sistema.exemplo.com.br/']);

        $this->get('/login')->assertRedirect('https://sistema.exemplo.com.br/login');
    }
}
