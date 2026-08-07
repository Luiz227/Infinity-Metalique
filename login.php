<?php
// Nesta etapa o arquivo contém apenas a interface do login.
// A validação das credenciais será conectada ao backend em uma próxima etapa.
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Acesso ao sistema Metalique Infinity">
    <title>Login | Metalique Infinity</title>

    <!-- O mesmo arquivo de estilos mantém a identidade visual das duas páginas. -->
    <link rel="stylesheet" href="assets/css/login.css">
</head>
<body>
    <main class="page-frame login-frame">
        <!-- Painel visual: usa a imagem da máquina desfocada como na referência. -->
        <section class="login-visual" aria-label="Boas-vindas à Metalique Infinity">
            <!-- Imagem e máscara exportadas diretamente do frame de login. -->
            <div class="auth-machine-window">
                <img
                    class="auth-machine-image"
                    src="assets/images/figma-login-maquina.png"
                    alt="Máquina de corte a laser da Metalique"
                >
            </div>

            <img
                class="auth-panel-overlay"
                src="assets/images/figma-login-overlay.svg"
                alt=""
                aria-hidden="true"
            >

            <header class="top-navigation">
                <a class="brand-link" href="index.php" aria-label="Página inicial">
                    <img src="assets/images/LOGO%20B.svg" alt="Metalique Infinity">
                </a>

                <nav class="navigation-links" aria-label="Navegação principal">
                    <a class="active" href="index.php">Home</a>
                    <a href="#ajuda">Ajuda</a>
                    <a href="#contato">Contato</a>
                </nav>
            </header>

            <div class="welcome-copy">
                <h1>Bem Vindo de volta!</h1>
                <p>Seu trabalho é importante para nós!</p>
            </div>

            <a class="back-link" href="index.php">
                <span aria-hidden="true">
                    <img src="assets/images/figma-voltar-seta.svg" alt="">
                </span>
                Voltar
            </a>
        </section>

        <!-- Painel do formulário: será ligado à autenticação segura no backend. -->
        <section class="login-content">
            <img class="login-logo" src="assets/images/logo.svg" alt="Metalique Infinity">

            <form class="login-form" id="login-form" method="post" action="login.php">
                <div class="form-field">
                    <label for="email">E-mail</label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        autocomplete="email"
                        required
                    >
                </div>

                <div class="form-field">
                    <label for="senha">Senha</label>
                    <input
                        type="password"
                        id="senha"
                        name="senha"
                        autocomplete="current-password"
                        required
                    >
                </div>

                <a class="forgot-password" href="#recuperar-senha">Esqueceu sua senha?</a>

            </form>

            <!-- O botão pertence ao painel e envia o formulário indicado pelo atributo form. -->
            <button class="login-button" type="submit" form="login-form">Entrar</button>

            <div class="login-red-lines" aria-hidden="true">
                <img src="assets/images/figma-linha-1.svg" alt="">
                <img src="assets/images/figma-linha-2.svg" alt="">
                <img src="assets/images/figma-linha-3.svg" alt="">
            </div>
        </section>
    </main>
</body>
</html>
