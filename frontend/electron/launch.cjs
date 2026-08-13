const { spawn } = require("node:child_process")
const electronPath = require("electron")

const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE

const electron = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
})

electron.on("exit", (code) => process.exit(code ?? 0))
