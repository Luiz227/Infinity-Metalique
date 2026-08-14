const fs = require("node:fs")
const path = require("node:path")

const projectDirectory = __dirname
const serverConfig = JSON.parse(
  fs.readFileSync(path.join(projectDirectory, "server.config.json"), "utf8"),
)
const releaseVersion = process.env.INFINITY_RELEASE_VERSION || require("./package.json").version
const productionRelease = process.env.INFINITY_PRODUCTION_RELEASE === "1"

module.exports = {
  appId: "com.metalique.infinity",
  productName: "Metalique Infinity",
  copyright: "Copyright © Metalique",
  asar: true,
  directories: {
    output: process.env.INFINITY_DESKTOP_OUTPUT || "out/nsis",
  },
  files: [
    "electron/**/*",
    "server.config.json",
    "package.json",
    "node_modules/**/*",
    "!node_modules/.cache{,/**/*}",
    "!node_modules/.vite{,/**/*}",
  ],
  extraMetadata: {
    version: releaseVersion,
    productionRelease,
  },
  win: {
    icon: "build/icon.ico",
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: `Metalique-Infinity-${releaseVersion}-Setup.\${ext}`,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Metalique Infinity",
    uninstallDisplayName: `Metalique Infinity ${releaseVersion}`,
    runAfterFinish: true,
    installerLanguages: ["pt_BR"],
    language: "1046",
  },
  publish: [{
    provider: "generic",
    url: process.env.INFINITY_UPDATE_URL || serverConfig.updateUrl,
  }],
}
