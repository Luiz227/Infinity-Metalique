const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("infinityDesktop", {
  isDesktop: true,
  showExternalApp: (appId, bounds) => ipcRenderer.invoke("external-app:show", appId, bounds),
  resizeExternalApp: (appId, bounds) => ipcRenderer.send("external-app:resize", appId, bounds),
  hideExternalApp: (appId) => ipcRenderer.send("external-app:hide", appId),
})
