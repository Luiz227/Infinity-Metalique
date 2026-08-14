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
})
