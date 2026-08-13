const http = require("node:http")
const { spawn, spawnSync } = require("node:child_process")
const waitOn = require("wait-on")

function frontendIsRunning() {
  return new Promise((resolve) => {
    const request = http.get("http://127.0.0.1:5173", (response) => {
      response.resume()
      resolve(response.statusCode >= 200 && response.statusCode < 500)
    })
    request.setTimeout(1000, () => request.destroy())
    request.on("error", () => resolve(false))
  })
}

async function run() {
  let vite = null
  if (!(await frontendIsRunning())) {
    if (process.platform === "win32") {
      vite = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm run dev"], {
        cwd: process.cwd(),
        stdio: "inherit",
      })
    } else {
      vite = spawn("npm", ["run", "dev"], { cwd: process.cwd(), stdio: "inherit" })
    }
    await waitOn({ resources: ["http://127.0.0.1:5173"], timeout: 30000 })
  }

  const launcher = spawn(process.execPath, ["electron/launch.cjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
  })

  launcher.on("exit", (code) => {
    if (vite && process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(vite.pid), "/t", "/f"], { stdio: "ignore" })
    } else if (vite) {
      vite.kill("SIGTERM")
    }
    process.exit(code ?? 0)
  })
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
