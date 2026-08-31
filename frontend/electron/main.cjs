const fs = require("node:fs")
const path = require("node:path")
const { app, BrowserWindow, ipcMain, session } = require("electron")
const { autoUpdater } = require("electron-updater")
const packageMetadata = require("../package.json")

const DEFAULT_SERVER_CONFIG = {
  frontendUrl: "http://127.0.0.1:5173",
  backendUrl: "http://127.0.0.1:82",
  updateUrl: "http://127.0.0.1:82/desktop-updates",
}
const EXTERNAL_APPS = {
  piperun: {
    url: "https://app.pipe.run/v2/login",
    partition: "persist:piperun",
    allowedHosts: ["pipe.run"],
  },
  sige: {
    url: "https://app.sigecloud.com.br/Login.aspx",
    partition: "persist:sige",
    allowedHosts: ["sigecloud.com.br"],
    singleSurfaceNavigation: true,
  },
}

app.setAppUserModelId("com.metalique.infinity")

let mainWindow = null
let infinityUrl = DEFAULT_SERVER_CONFIG.frontendUrl
let updateState = {
  state: "idle",
  currentVersion: app.getVersion(),
  productionRelease: packageMetadata.productionRelease === true,
}
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) app.quit()

app.on("second-instance", () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function isAllowedUrl(appConfig, value) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && appConfig.allowedHosts.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  } catch {
    return false
  }
}

function externalAppForSession(externalSession) {
  return Object.values(EXTERNAL_APPS).find(
    ({ partition }) => session.fromPartition(partition) === externalSession,
  )
}

function normalizeHttpUrl(value, fallback) {
  try {
    const url = new URL(String(value || fallback))
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback
    return url.toString().replace(/\/$/, "")
  } catch {
    return fallback
  }
}

function loadServerConfig() {
  const configPath = path.join(app.getPath("userData"), "server.config.json")
  let bundledConfig = DEFAULT_SERVER_CONFIG
  let storedConfig = null

  try {
    const bundledConfigPath = path.join(__dirname, "..", "server.config.json")
    if (fs.existsSync(bundledConfigPath)) {
      bundledConfig = { ...bundledConfig, ...JSON.parse(fs.readFileSync(bundledConfigPath, "utf8")) }
    }

    if (fs.existsSync(configPath)) {
      storedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))
    } else {
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(configPath, `${JSON.stringify(bundledConfig, null, 2)}\n`, "utf8")
    }
  } catch (error) {
    console.warn(`Não foi possível ler a configuração do servidor em ${configPath}.`, error)
  }

  const effectiveConfig = { ...bundledConfig, ...(storedConfig || {}) }

  return {
    configPath,
    frontendUrl: normalizeHttpUrl(
      process.env.INFINITY_URL || effectiveConfig.frontendUrl,
      DEFAULT_SERVER_CONFIG.frontendUrl,
    ),
    backendUrl: normalizeHttpUrl(
      process.env.INFINITY_BACKEND_URL || effectiveConfig.backendUrl,
      DEFAULT_SERVER_CONFIG.backendUrl,
    ),
    updateUrl: normalizeHttpUrl(
      process.env.INFINITY_UPDATE_URL || effectiveConfig.updateUrl,
      DEFAULT_SERVER_CONFIG.updateUrl,
    ),
  }
}

function validMainWindowSender(event) {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents)
}

// Limites do zoom da seção App das configurações. O piso e o teto existem para
// a janela nunca chegar a um tamanho em que os controles saem da tela.
const MIN_ZOOM = 0.8
const MAX_ZOOM = 1.4

/**
 * O estado que a seção App mostra. `openAtLogin` é lido do sistema, e não de um
 * arquivo nosso: quem desliga a inicialização pelo Gerenciador de Tarefas do
 * Windows precisa ver o interruptor desligado aqui também.
 */
function systemInfo() {
  return {
    version: app.getVersion(),
    platform: process.platform,
    productionRelease: packageMetadata.productionRelease === true,
    openAtLogin: process.platform === "win32" ? app.getLoginItemSettings().openAtLogin : false,
    zoomFactor: mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.getZoomFactor() : 1,
  }
}

function registerSystemHandlers() {
  ipcMain.handle("desktop-system:get-info", (event) => (
    validMainWindowSender(event) ? systemInfo() : { ...systemInfo(), platform: "unknown" }
  ))

  ipcMain.handle("desktop-system:set-open-at-login", (event, openAtLogin) => {
    if (!validMainWindowSender(event) || process.platform !== "win32") return systemInfo()

    // `openAsHidden` fica de fora de propósito: no Windows ele não tem efeito, e
    // quem liga isso quer o Infinity aberto ao ligar a máquina, não escondido.
    app.setLoginItemSettings({ openAtLogin: openAtLogin === true })
    return systemInfo()
  })

  ipcMain.handle("desktop-system:set-zoom", (event, zoomFactor) => {
    if (!validMainWindowSender(event)) return systemInfo()

    const factor = Number(zoomFactor)
    if (Number.isFinite(factor)) {
      mainWindow.webContents.setZoomFactor(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor)))
    }

    return systemInfo()
  })
}

function publishUpdateState(nextState) {
  updateState = { ...updateState, ...nextState }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop-update:status", updateState)
  }
}

function configureAutoUpdater(updateUrl) {
  if (!app.isPackaged || process.platform !== "win32" || !updateState.productionRelease) {
    publishUpdateState({ state: "disabled" })
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.setFeedURL({ provider: "generic", url: updateUrl })

  autoUpdater.on("checking-for-update", () => publishUpdateState({ state: "checking", error: undefined }))
  autoUpdater.on("update-available", (info) => publishUpdateState({
    state: "available",
    version: info.version,
    error: undefined,
  }))
  autoUpdater.on("update-not-available", () => publishUpdateState({
    state: "idle",
    version: undefined,
    error: undefined,
  }))
  autoUpdater.on("download-progress", (progress) => publishUpdateState({
    state: "downloading",
    progress: Math.max(0, Math.min(100, Math.round(progress.percent))),
  }))
  autoUpdater.on("update-downloaded", (info) => publishUpdateState({
    state: "downloaded",
    version: info.version,
    progress: 100,
    error: undefined,
  }))
  autoUpdater.on("error", (error) => {
    console.error("Falha ao verificar ou baixar atualização do desktop.", error)
    publishUpdateState({ state: "error", error: error.message })
  })

  const checkForUpdates = () => {
    if (updateState.state === "checking" || updateState.state === "downloading") return
    void autoUpdater.checkForUpdates().catch((error) => {
      console.error("Falha ao iniciar a verificação de atualização.", error)
    })
  }

  ipcMain.handle("desktop-update:check", (event) => {
    if (!validMainWindowSender(event)) return updateState
    checkForUpdates()
    return updateState
  })
  ipcMain.handle("desktop-update:download", async (event) => {
    if (!validMainWindowSender(event) || updateState.state !== "available") return updateState
    publishUpdateState({ state: "downloading", progress: 0 })
    await autoUpdater.downloadUpdate()
    return updateState
  })
  ipcMain.on("desktop-update:install", (event) => {
    if (!validMainWindowSender(event) || updateState.state !== "downloaded") return
    autoUpdater.quitAndInstall(false, true)
  })

  const firstCheckDelay = process.argv.includes("--squirrel-firstrun") ? 15_000 : 5_000
  setTimeout(checkForUpdates, firstCheckDelay)
  setInterval(checkForUpdates, 60 * 60 * 1000)
}

function connectionErrorPage(errorDescription) {
  const safeDescription = String(errorDescription || "Servidor indisponível")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
  const safeInfinityUrl = infinityUrl
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")

  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Servidor indisponível | Metalique Infinity</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px; background: #db0f0f; color: #171717; font-family: Arial, sans-serif; }
          main { width: min(560px, 100%); padding: 40px; border-radius: 28px; background: #fff; text-align: center; box-shadow: 0 24px 70px rgba(0,0,0,.2); }
          h1 { margin: 0; font-size: 28px; }
          p { margin: 14px 0 0; color: #666; line-height: 1.6; }
          code { display: block; margin-top: 20px; padding: 12px; border-radius: 10px; background: #f2f2f2; overflow-wrap: anywhere; }
          button { margin-top: 24px; border: 0; border-radius: 999px; padding: 12px 24px; background: #db0f0f; color: #fff; font-weight: 700; cursor: pointer; }
        </style>
      </head>
      <body>
        <main>
          <h1>Servidor indisponível</h1>
          <p>Confirme se o Live Share está ativo e compartilhando a porta 5173.</p>
          <code>${safeInfinityUrl}</code>
          <p>${safeDescription}</p>
          <button type="button" onclick='location.href=${JSON.stringify(infinityUrl)}'>Tentar novamente</button>
        </main>
      </body>
    </html>`)}`
}

function secureExternalWebContents(contents, appConfig) {
  const keepNavigationInsidePanel = () => {
    void contents.executeJavaScript(`(() => {
      if (window.__infinitySingleSurfaceNavigation) return
      window.__infinitySingleSurfaceNavigation = true

      const useCurrentSurface = (element) => {
        const target = String(element?.getAttribute?.("target") || "").toLowerCase()
        if (target && target !== "_self" && target !== "_top" && target !== "_parent") {
          element.setAttribute("target", "_self")
        }
      }

      document.addEventListener("click", (event) => {
        const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null
        if (anchor) useCurrentSurface(anchor)
      }, true)

      document.addEventListener("submit", (event) => {
        if (event.target instanceof HTMLFormElement) useCurrentSurface(event.target)
      }, true)

      const nativeSubmit = HTMLFormElement.prototype.submit
      HTMLFormElement.prototype.submit = function infinitySubmit() {
        useCurrentSurface(this)
        return nativeSubmit.call(this)
      }

      Object.defineProperty(window, "open", {
        configurable: true,
        value(url) {
          const destination = String(url || "").trim()
          if (destination && destination !== "about:blank") window.location.assign(destination)
          return window
        },
      })
    })()`)
      .catch((error) => console.warn("Nao foi possivel ajustar a navegacao incorporada.", error))
  }

  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(appConfig, url)) void contents.loadURL(url)
    return { action: "deny" }
  })
  if (appConfig.singleSurfaceNavigation) contents.on("dom-ready", keepNavigationInsidePanel)
  contents.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(appConfig, url)) event.preventDefault()
  })
  contents.on("will-redirect", (event, url) => {
    if (!isAllowedUrl(appConfig, url)) event.preventDefault()
  })
}

function createMainWindow() {
  // build/ fica fora do pacote, entao o icone explicito so existe rodando pelo repositorio.
  // No app instalado o Windows usa o icone gravado no proprio executavel.
  const windowIcon = path.join(__dirname, "..", "build", "icon.ico")

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#db0f0f",
    ...(fs.existsSync(windowIcon) ? { icon: windowIcon } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== new URL(infinityUrl).origin) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  })
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || validatedUrl !== infinityUrl) return
    void mainWindow?.loadURL(connectionErrorPage(errorDescription))
  })
  mainWindow.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    const appConfig = Object.values(EXTERNAL_APPS).find(
      (config) => config.partition === params.partition && isAllowedUrl(config, params.src),
    )

    if (!appConfig) {
      event.preventDefault()
      return
    }

    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
  })
  mainWindow.webContents.on("did-attach-webview", (_event, contents) => {
    const appConfig = externalAppForSession(contents.session)
    if (appConfig) secureExternalWebContents(contents, appConfig)
  })
  void mainWindow.loadURL(infinityUrl)
  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  const serverConfig = loadServerConfig()
  infinityUrl = serverConfig.frontendUrl
  console.info(`Infinity Desktop conectado ao frontend ${infinityUrl}.`)
  console.info(`Backend central configurado em ${serverConfig.backendUrl}.`)
  console.info(`Atualizações de produção configuradas em ${serverConfig.updateUrl}.`)
  console.info(`Configuração persistente: ${serverConfig.configPath}`)

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  Object.values(EXTERNAL_APPS).forEach(({ partition }) => {
    session.fromPartition(partition).setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  })

  createMainWindow()
  ipcMain.handle("desktop-update:get-status", (event) => (
    validMainWindowSender(event) ? updateState : { ...updateState, state: "disabled" }
  ))
  registerSystemHandlers()
  configureAutoUpdater(serverConfig.updateUrl)
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
