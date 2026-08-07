<?php
// Esta página é a entrada do sistema. Por enquanto, ela contém somente a interface.
// O link "Log-in" direciona o usuário para a página de autenticação.
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Portal de integração da Metalique Infinity">
    <title>Metalique Infinity</title>

    <!-- O CSS é compartilhado entre a página inicial e a página de login. -->
    <link rel="stylesheet" href="assets/css/home.css">
</head>
<body>
    <main class="page-frame home-frame">
        <!-- Lado esquerdo: imagem institucional, navegação e chamada para a equipe. -->
        <section class="home-visual" aria-label="Apresentação da Metalique Infinity">
            <!-- Janela de recorte com as mesmas proporções utilizadas no Figma. -->
            <div class="machine-window">
                <img
                    class="machine-image"
                    src="assets/images/figma-maquina.png"
                    alt="Máquina de corte a laser da Metalique"
                >
            </div>

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

            <div class="team-card">
                <!-- Forma translúcida exportada diretamente do frame do Figma. -->
                <img
                    class="team-card-shape"
                    src="assets/images/figma-equipe-card.svg"
                    alt=""
                    aria-hidden="true"
                >

                <!-- Avatares originais utilizados no layout. -->
                <div class="team-summary">
                    <img src="assets/images/figma-avatar-1.png" alt="">
                    <img src="assets/images/figma-avatar-2.png" alt="">
                    <img src="assets/images/figma-avatar-3.png" alt="">
                    <small>70+ Usuarios</small>
                </div>

                <p class="team-message">Venha fazer<br>parte da equipe!</p>

                <a class="round-arrow" href="#contato" aria-label="Conheça a equipe">
                    <img src="assets/images/figma-seta.svg" alt="">
                </a>
            </div>
        </section>

        <!-- Lado direito: mensagem principal e acessos ao cadastro e ao login. -->
        <section class="home-content">
            <div class="access-links">
                <a class="outline-button" href="cadastro.php">Cadastrar</a>
                <a class="solid-button" href="login.php">Log-in</a>
            </div>

            <div class="hero-copy">
                <h1>A integração Metalique chegou para simplificar</h1>
                <p>E deixar seus processos infinitamente melhor!</p>
            </div>

            <!-- As três linhas usam os vetores originais exportados do Figma. -->
            <div class="red-lines" aria-hidden="true">
                <img src="assets/images/figma-linha-1.svg" alt="">
                <img src="assets/images/figma-linha-2.svg" alt="">
                <img src="assets/images/figma-linha-3.svg" alt="">
            </div>

            <a class="start-button" href="login.php">Comece agora!</a>
        </section>
    </main>
</body>
</html>
