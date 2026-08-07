import { AppLink } from "@/lib/router"

export function AuthVisual({ accessRequest = false }: { accessRequest?: boolean }) {
  return (
    <section className="login-visual" aria-label="Boas-vindas à Metalique Infinity">
      <div className="auth-machine-window">
        <img
          className="auth-machine-image"
          src={accessRequest ? "/images/figma-cadastro-maquina.png" : "/images/figma-login-maquina.png"}
          alt="Máquina de corte a laser da Metalique"
        />
      </div>
      <img
        className="auth-panel-overlay"
        src={accessRequest ? "/images/figma-cadastro-overlay.svg" : "/images/figma-login-overlay.svg"}
        alt=""
        aria-hidden="true"
      />

      <header className="top-navigation">
        <AppLink className="brand-link" to="/" ariaLabel="Página inicial">
          <img src="/images/logo-b.svg" alt="Metalique Infinity" />
        </AppLink>
        <nav className="navigation-links" aria-label="Navegação principal">
          <AppLink className="active" to="/">Home</AppLink>
          <a href="#ajuda">Ajuda</a>
          <a href="#contato">Contato</a>
        </nav>
      </header>

      <div className={`welcome-copy${accessRequest ? " registration-welcome" : ""}`}>
        <h1>{accessRequest ? "Solicite seu acesso!" : "Bem Vindo de volta!"}</h1>
        {accessRequest ? (
          <p>Seu processo está a caminho de se<br />tornar infinitamente melhor!</p>
        ) : (
          <p>Seu trabalho é importante para nós!</p>
        )}
      </div>

      <AppLink className="back-link" to="/">
        <span aria-hidden="true"><img src="/images/figma-voltar-seta.svg" alt="" /></span>
        Voltar
      </AppLink>
    </section>
  )
}

export function RedLines() {
  return (
    <div className="login-red-lines" aria-hidden="true">
      <img src="/images/figma-linha-1.svg" alt="" />
      <img src="/images/figma-linha-2.svg" alt="" />
      <img src="/images/figma-linha-3.svg" alt="" />
    </div>
  )
}
