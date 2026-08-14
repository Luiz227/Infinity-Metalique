import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const projectDirectory = path.dirname(fileURLToPath(import.meta.url))
const storedServerConfig = JSON.parse(
  fs.readFileSync(path.resolve(projectDirectory, "server.config.json"), "utf8"),
) as { frontendUrl?: string; backendUrl?: string }
const configuredFrontend = new URL(
  process.env.INFINITY_URL || storedServerConfig.frontendUrl || "http://127.0.0.1:5173",
)
const frontendHost = process.env.INFINITY_FRONTEND_HOST || configuredFrontend.hostname
const frontendPort = Number(configuredFrontend.port) || 5173
const backendUrl = process.env.INFINITY_BACKEND_URL || storedServerConfig.backendUrl || "http://127.0.0.1:82"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(projectDirectory, "src"),
    },
  },
  server: {
    host: frontendHost,
    port: frontendPort,
    strictPort: true,
    proxy: {
      "/backend": {
        target: backendUrl,
        changeOrigin: true,
      },
      "/assets/uploads": {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
})
