<?php
// Esta página recebe a solicitação de cadastro de um novo usuário.
// O envio ao responsável de T.I. será conectado ao backend posteriormente.
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Solicitação de cadastro no sistema Metalique Infinity">
    <title>Cadastro | Metalique Infinity</title>

    <!-- O estilo compartilhado mantém as telas com a mesma identidade visual. -->
    <link rel="stylesheet" href="assets/css/cadastro.css">
</head>
<body>
    <main class="page-frame login-frame registration-page">
        <!-- Painel visual com a mensagem de boas-vindas. -->
        <section class="login-visual" aria-label="Boas-vindas à Metalique Infinity">
            <!-- Imagem e máscara específicas do frame de cadastro. -->
            <div class="auth-machine-window">
                <img
                    class="auth-machine-image"
                    src="assets/images/figma-cadastro-maquina.png"
                    alt="Máquina de corte a laser da Metalique"
                >
            </div>

            <img
                class="auth-panel-overlay"
                src="assets/images/figma-cadastro-overlay.svg"
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

            <div class="welcome-copy registration-welcome">
                <h1>Seja Bem Vindo!</h1>
                <p>Seu processo está a caminho de se<br>tornar infinitamente melhor!</p>
            </div>

            <a class="back-link" href="index.php">
                <span aria-hidden="true">
                    <img src="assets/images/figma-voltar-seta.svg" alt="">
                </span>
                Voltar
            </a>
        </section>

        <!-- Formulário que futuramente enviará a solicitação ao profissional de T.I. -->
        <section class="login-content registration-content">
            <img class="login-logo" src="assets/images/logo.svg" alt="Metalique Infinity">

            <form class="login-form registration-form" id="registration-form" method="post" action="cadastro.php">
                <div class="form-field">
                    <label for="email-recuperacao">E-mail de Recuperação</label>
                    <input
                        type="email"
                        id="email-recuperacao"
                        name="email_recuperacao"
                        autocomplete="email"
                        required
                    >
                </div>

                <div class="form-field">
                    <label for="nome-completo">Nome Completo</label>
                    <input
                        type="text"
                        id="nome-completo"
                        name="nome_completo"
                        autocomplete="name"
                        minlength="3"
                        required
                    >
                </div>

                <div class="form-field">
                    <label for="senha-preferencia">Senha de preferência</label>
                    <input
                        type="password"
                        id="senha-preferencia"
                        name="senha_preferencia"
                        autocomplete="new-password"
                        minlength="8"
                        required
                    >
                </div>

                <p class="registration-notice">
                    O cadastro é feito apenas pelo profissional de T.I!
                </p>

            </form>

            <!-- O botão pertence ao painel e envia o formulário indicado pelo atributo form. -->
            <button class="login-button" type="submit" form="registration-form">Solicitar!</button>

            <div class="login-red-lines" aria-hidden="true">
                <img src="assets/images/figma-linha-1.svg" alt="">
                <img src="assets/images/figma-linha-2.svg" alt="">
                <img src="assets/images/figma-linha-3.svg" alt="">
            </div>
        </section>
    </main>

    <!--
        O modal fica oculto inicialmente e aparece após a validação dos campos.
        Quando o backend for conectado, ele deverá abrir somente após o servidor
        confirmar que a solicitação foi registrada com sucesso.
    -->
    <div
        class="confirmation-modal"
        id="confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Solicitação requisitada com sucesso"
        hidden
    >
        <section class="confirmation-card">
            <!-- A arte enviada já contém a máquina, a mensagem e o X. -->
            <img
                class="confirmation-art"
                src="assets/images/confirmacao-cadastro.png"
                alt="Sua solicitação foi requisitada com sucesso. Que ótimo ter você na nossa equipe!"
            >

            <!-- Área transparente posicionada exatamente sobre o X existente na imagem. -->
            <button class="close-modal" id="close-modal" type="button" aria-label="Fechar confirmação">×</button>
        </section>
    </div>

    <!-- Controla a abertura e o fechamento da confirmação sem recarregar a página. -->
    <script src="assets/js/cadastro.js"></script>
</body>
</html>
