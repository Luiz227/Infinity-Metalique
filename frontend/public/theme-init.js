(() => {
  // Roda no <head>, antes da folha de estilo e do bundle: é esta a guarda de
  // verdade contra o clarão branco ao recarregar com o tema escuro salvo.
  // `lib/preferences.ts` repete a leitura depois e é quem manda dali em diante -
  // aqui só interessa acertar a pintura do primeiro quadro.
  let theme = "light"
  let reduceMotion = false

  try {
    const stored = JSON.parse(window.localStorage.getItem("metalique:preferences") || "null")
    if (stored && typeof stored === "object") {
      if (stored.theme === "dark" || stored.theme === "light" || stored.theme === "system") theme = stored.theme
      reduceMotion = stored.reduceMotion === true
    } else if (window.localStorage.getItem("metalique:color-theme") === "dark") {
      // A chave da época em que só existia o toggle do menu. Quem a aposenta é
      // o módulo, que também precisa mandá-la ao banco - aqui ela só é lida.
      theme = "dark"
    }
  } catch {
    // O tema claro é a rede quando a preferência local não pode ser lida.
  }

  if (theme === "system") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.classList.toggle("reduce-motion", reduceMotion)
  root.dataset.theme = theme
  root.style.colorScheme = theme
})()
