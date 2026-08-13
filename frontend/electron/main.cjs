const path = require("node:path")
const { app, BrowserWindow, WebContentsView, ipcMain, session } = require("electron")

const INFINITY_URL = process.env.INFINITY_URL || "http://127.0.0.1:5173"
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
  },
}

let mainWindow = null
const externalViews = new Map()
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

function normalizeBounds(bounds) {
  if (!mainWindow || !bounds) return null

  const contentBounds = mainWindow.getContentBounds()
  const x = Math.min(contentBounds.width - 1, Math.max(0, Math.round(Number(bounds.x) || 0)))
  const y = Math.min(contentBounds.height - 1, Math.max(0, Math.round(Number(bounds.y) || 0)))
  const width = Math.min(Math.max(1, Math.round(Number(bounds.width) || 1)), contentBounds.width - x)
  const height = Math.min(Math.max(1, Math.round(Number(bounds.height) || 1)), contentBounds.height - y)

  return { x, y, width, height }
}

function hideExternalViews(except = null) {
  externalViews.forEach((view, id) => view.setVisible(id === except))
}

function createExternalView(appId) {
  if (!mainWindow || externalViews.has(appId)) return externalViews.get(appId)

  const appConfig = EXTERNAL_APPS[appId]
  if (!appConfig) return null

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: appConfig.partition,
    },
  })

  view.setBackgroundColor("#ffffff")
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(appConfig, url)) void view.webContents.loadURL(url)
    return { action: "deny" }
  })
  view.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(appConfig, url)) event.preventDefault()
  })

  mainWindow.contentView.addChildView(view)
  externalViews.set(appId, view)
  void view.webContents.loadURL(appConfig.url)
  return view
}

function validSender(event) {
  return Boolean(mainWindow && event.sender === mainWindow.webContents)
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#db0f0f",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  mainWindow.webContents.on("did-start-navigation", () => hideExternalViews())
  void mainWindow.loadURL(INFINITY_URL)
  mainWindow.on("closed", () => {
    externalViews.clear()
    mainWindow = null
  })
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  Object.values(EXTERNAL_APPS).forEach(({ partition }) => {
    session.fromPartition(partition).setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  })

  ipcMain.handle("external-app:show", (event, appId, bounds) => {
    if (!validSender(event) || !EXTERNAL_APPS[appId]) return false
    const view = createExternalView(appId)
    const safeBounds = normalizeBounds(bounds)
    if (!view || !safeBounds) return false
    hideExternalViews(appId)
    view.setBounds(safeBounds)
    view.setVisible(true)
    return true
  })
  ipcMain.on("external-app:resize", (event, appId, bounds) => {
    if (!validSender(event)) return
    const view = externalViews.get(appId)
    const safeBounds = normalizeBounds(bounds)
    if (view && safeBounds) view.setBounds(safeBounds)
  })
  ipcMain.on("external-app:hide", (event, appId) => {
    if (!validSender(event)) return
    externalViews.get(appId)?.setVisible(false)
  })

  createMainWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
