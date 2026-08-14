const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const frontendDirectory = path.resolve(__dirname, "..")
const projectDirectory = path.resolve(frontendDirectory, "..")
const mode = process.argv[2] || "preview"
const checkOnly = process.argv.includes("--check")
const temporaryOutputDirectory = path.join(
  os.tmpdir(),
  `metalique-infinity-desktop-${mode}-${process.pid}-${Date.now()}`,
)

function fail(message) {
  console.error(`\nERRO: ${message}\n`)
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: frontendDirectory,
    env: options.env || process.env,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32" && /\.cmd$/i.test(command),
  })

  if (result.error) fail(result.error.message)
  if (result.status !== 0) {
    const detail = options.capture ? String(result.stderr || result.stdout || "").trim() : ""
    fail(detail || `O comando ${command} ${args.join(" ")} falhou.`)
  }

  return options.capture ? String(result.stdout).trim() : ""
}

function git(...args) {
  return run("git", args, { capture: true })
}

function gitReleaseVersion() {
  const baseTag = git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", "HEAD")
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(baseTag)
  if (!match) fail(`A tag ${baseTag} não segue o formato vMAJOR.MINOR.PATCH.`)

  const commitDistance = Number(git("rev-list", "--count", `${baseTag}..HEAD`))
  const [, major, minor, patch] = match
  return {
    baseTag,
    commitDistance,
    version: `${major}.${minor}.${Number(patch) + commitDistance}`,
  }
}

function assertProductionCommit() {
  const productionBranch = process.env.INFINITY_PRODUCTION_BRANCH || "main"
  const branch = git("branch", "--show-current")
  if (branch !== productionBranch) {
    fail(`A release só pode ser publicada na branch ${productionBranch}; branch atual: ${branch || "detached"}.`)
  }

  if (git("status", "--porcelain")) {
    fail("Faça commit de todas as alterações antes de publicar a release de produção.")
  }

  const head = git("rev-parse", "HEAD")
  const remoteHead = git("rev-parse", `origin/${productionBranch}`)
  if (head !== remoteHead) {
    fail(`O commit ${head.slice(0, 7)} ainda não corresponde a origin/${productionBranch}. Faça push antes da release.`)
  }

  return { branch, head }
}

function copyArtifacts(outputDirectory, targetDirectory, fileNames) {
  fs.mkdirSync(targetDirectory, { recursive: true })
  fileNames.forEach((fileName) => {
    const source = path.join(outputDirectory, fileName)
    if (!fs.existsSync(source)) fail(`Artefato não encontrado: ${source}`)
    fs.copyFileSync(source, path.join(targetDirectory, fileName))
  })
}

function copyReleaseArtifacts(version, commit, outputDirectory) {
  const updatesDirectory = path.join(projectDirectory, "public", "desktop-updates")
  const requiredFiles = [
    "latest.yml",
    `Metalique-Infinity-${version}-Setup.exe`,
    `Metalique-Infinity-${version}-Setup.exe.blockmap`,
  ]

  copyArtifacts(outputDirectory, updatesDirectory, requiredFiles)

  fs.writeFileSync(path.join(updatesDirectory, "release.json"), `${JSON.stringify({
    version,
    gitCommit: commit,
    gitShortCommit: commit.slice(0, 7),
    publishedAt: new Date().toISOString(),
    installer: `Metalique-Infinity-${version}-Setup.exe`,
  }, null, 2)}\n`, "utf8")

  console.log(`\nRelease ${version} publicada em ${updatesDirectory}`)
}

if (mode === "version") {
  const release = gitReleaseVersion()
  console.log(JSON.stringify({ ...release, gitCommit: git("rev-parse", "HEAD") }, null, 2))
  process.exit(0)
}

if (mode === "production") {
  const commit = assertProductionCommit()
  const release = gitReleaseVersion()
  console.log(`Release de produção ${release.version} (${commit.head.slice(0, 7)}, base ${release.baseTag}).`)
  if (checkOnly) process.exit(0)

  const environment = {
    ...process.env,
    INFINITY_RELEASE_VERSION: release.version,
    INFINITY_PRODUCTION_RELEASE: "1",
    INFINITY_DESKTOP_OUTPUT: temporaryOutputDirectory,
  }
  run("npm.cmd", ["run", "build"], { env: environment })
  run("npx.cmd", ["electron-builder", "--config", "electron-builder.config.cjs", "--win", "nsis"], { env: environment })
  copyReleaseArtifacts(release.version, commit.head, temporaryOutputDirectory)
  process.exit(0)
}

if (mode !== "preview") fail(`Modo desconhecido: ${mode}.`)

const packageVersion = require(path.join(frontendDirectory, "package.json")).version
const environment = {
  ...process.env,
  INFINITY_RELEASE_VERSION: packageVersion,
  INFINITY_PRODUCTION_RELEASE: "0",
  INFINITY_DESKTOP_OUTPUT: temporaryOutputDirectory,
}
run("npm.cmd", ["run", "build"], { env: environment })
run("npx.cmd", ["electron-builder", "--config", "electron-builder.config.cjs", "--win", "nsis"], { env: environment })
copyArtifacts(temporaryOutputDirectory, path.join(frontendDirectory, "out", "nsis"), [
  "latest.yml",
  `Metalique-Infinity-${packageVersion}-Setup.exe`,
  `Metalique-Infinity-${packageVersion}-Setup.exe.blockmap`,
])
console.log(`\nInstalador de prévia ${packageVersion} gerado. Atualizações automáticas permanecem desativadas.`)
