/** O retângulo de um recorte, em pixels da imagem de origem. */
export type PhotoCrop = { x: number; y: number; size: number }

/** O maior lado do original guardado. Ver `downscaleImage`. */
const SOURCE_MAX_SIDE = 1600

export function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Não foi possível ler esta imagem."))
    image.src = url
  })
}

/**
 * Reduz o arquivo escolhido ao tamanho em que ele vale a pena ser guardado como
 * original do recorte.
 *
 * 1600px é folga de sobra para um recorte de 512: mesmo enquadrando um pedaço
 * pequeno da foto, ainda sobra resolução. E mantém o arquivo bem abaixo do
 * limite de 5 MB do UploadService, que uma foto de celular estoura sozinha.
 *
 * A imagem menor que isso também passa pelo canvas: o redesenho normaliza o
 * formato, derruba os metadados EXIF (que costumam pesar mais que a foto de
 * perfil inteira) e resolve a orientação de uma vez - o navegador já aplica a
 * rotação do EXIF ao desenhar, então o que sai daqui não depende mais dela.
 */
export async function downscaleImage(file: File, maxSide = SOURCE_MAX_SIDE): Promise<Blob> {
  const url = URL.createObjectURL(file)

  try {
    const image = await load(url)
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

    const context = canvas.getContext("2d")
    if (!context) throw new Error("Não foi possível preparar a imagem.")
    context.imageSmoothingQuality = "high"
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = (await encode(canvas, "image/webp", 0.85)) || (await encode(canvas, "image/jpeg", 0.85))
    if (!blob) throw new Error("Não foi possível preparar a imagem.")

    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** A extensão que combina com o tipo gerado pelo canvas. */
export function extensionFor(blob: Blob): string {
  return blob.type === "image/webp" ? "webp" : "jpg"
}
