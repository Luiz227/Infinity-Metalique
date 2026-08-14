const fs = require("node:fs")
const path = require("node:path")

const frontendDirectory = path.resolve(__dirname, "..")
const projectDirectory = path.resolve(frontendDirectory, "..")
const sourceIcon = path.join(frontendDirectory, "public", "images", "Infinity-icon.svg")
const masterIcon = path.join(frontendDirectory, "build", "icon.ico")
const iconCopies = [
  path.join(frontendDirectory, "public", "favicon.ico"),
  path.join(projectDirectory, "public", "favicon.ico"),
]

function fail(message) {
  console.error(`\nERRO: ${message}\n`)
  process.exit(1)
}

// O rasterizador vive num caminho interno do electron-builder, entao um upgrade pode
// move-lo. Nao e bloqueante: os .ico ficam versionados e este script so roda quando a
// marca muda. Se quebrar, basta apontar para o novo caminho ou rasterizar por fora.
function loadIconsTool() {
  try {
    return require("app-builder-lib/out/toolsets/icons").runIconsTool
  } catch (error) {
    return fail(
      "Nao foi possivel carregar o rasterizador do electron-builder em "
      + `app-builder-lib/out/toolsets/icons. Detalhe: ${error.message}`,
    )
  }
}

// Le o diretorio do container ICO so para relatar as resolucoes geradas.
function icoSizes(filePath) {
  const buffer = fs.readFileSync(filePath)
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    fail(`${filePath} nao e um container ICO valido.`)
  }

  return Array.from({ length: buffer.readUInt16LE(4) }, (_unused, index) => {
    const entry = 6 + index * 16
    return buffer[entry] || 256
  }).sort((a, b) => a - b)
}

async function main() {
  if (!fs.existsSync(sourceIcon)) fail(`SVG de origem nao encontrado: ${sourceIcon}`)

  const runIconsTool = loadIconsTool()
  const outputDirectory = path.dirname(masterIcon)
  fs.mkdirSync(outputDirectory, { recursive: true })

  console.log(`Rasterizando ${path.relative(frontendDirectory, sourceIcon)}...`)
  await runIconsTool({ inputFile: sourceIcon, outputFormat: "ico", outDir: outputDirectory })

  if (!fs.existsSync(masterIcon)) fail(`O rasterizador nao gerou ${masterIcon}.`)
  const masterSize = fs.statSync(masterIcon).size
  if (masterSize === 0) fail(`${masterIcon} foi gerado vazio.`)

  const sizes = icoSizes(masterIcon)
  if (!sizes.includes(256)) {
    fail(`O .ico precisa conter a resolucao 256x256; gerou apenas ${sizes.join(", ")}.`)
  }

  iconCopies.forEach((target) => {
    fs.copyFileSync(masterIcon, target)
  })

  console.log(`\n${path.relative(projectDirectory, masterIcon)} (${masterSize} bytes, ${sizes.join("/")} px)`)
  iconCopies.forEach((target) => console.log(`${path.relative(projectDirectory, target)}`))
  console.log("\nIcones atualizados. Faca commit dos .ico junto com o SVG de origem.")
}

main().catch((error) => fail(error.stack || error.message))
