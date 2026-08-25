const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("infinityDesktop", {
  isDesktop: true,
  updates: {
    getStatus: () => ipcRenderer.invoke("desktop-update:get-status"),
    check: () => ipcRenderer.invoke("desktop-update:check"),
    download: () => ipcRenderer.invoke("desktop-update:download"),
    install: () => ipcRenderer.send("desktop-update:install"),
    onStatus: (listener) => {
      const handleStatus = (_event, status) => listener(status)
      ipcRenderer.on("desktop-update:status", handleStatus)
      return () => ipcRenderer.removeListener("desktop-update:status", handleStatus)
    },
  },
  // O que a seção App das configurações lê e escreve. Cada uma devolve o estado
  // inteiro depois de agir, então a tela nunca precisa adivinhar o resultado.
  system: {
    getInfo: () => ipcRenderer.invoke("desktop-system:get-info"),
    setOpenAtLogin: (openAtLogin) => ipcRenderer.invoke("desktop-system:set-open-at-login", openAtLogin),
    setZoom: (zoomFactor) => ipcRenderer.invoke("desktop-system:set-zoom", zoomFactor),
  },
})
