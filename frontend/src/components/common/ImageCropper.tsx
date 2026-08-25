import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react"
import { LoaderCircle, RotateCcw, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { encode, type PhotoCrop } from "@/lib/image"

const OUTPUT_SIZE = 512
const MAX_ZOOM = 4

type Size = { width: number; height: number }
type Offset = { x: number; y: number }
type View = { zoom: number; offset: Offset }
type Geometry = { stageSize: number; baseWidth: number; baseHeight: number }

// A imagem é posicionada por CSS: o palco só precisa saber o tamanho renderizado
// (antes do scale) para impedir que o arrasto deixe buraco dentro do recorte.
function readGeometry(stage: HTMLDivElement | null, image: HTMLImageElement | null): Geometry | null {
  if (!stage || !image || image.offsetWidth === 0) return null
  return { stageSize: stage.clientWidth, baseWidth: image.offsetWidth, baseHeight: image.offsetHeight }
}

function clampOffset(offset: Offset, geometry: Geometry, zoom: number): Offset {
  const maxX = Math.max(0, (geometry.baseWidth * zoom - geometry.stageSize) / 2)
  const maxY = Math.max(0, (geometry.baseHeight * zoom - geometry.stageSize) / 2)
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  }
}

/**
 * O caminho de volta de `confirm()`: do retângulo gravado para o zoom e o
 * deslocamento que o reproduzem neste palco. É o que faz "Reposicionar" abrir a
 * foto exatamente como ela está hoje, em vez de jogar quem chegou para corrigir
 * um detalhe de volta ao começo.
 */
function viewFromCrop(crop: PhotoCrop, natural: Size, geometry: Geometry): View {
  const scale = geometry.stageSize / crop.size
  const zoom = Math.min(MAX_ZOOM, Math.max(1, (scale * natural.width) / geometry.baseWidth))
  const offset = {
    x: (natural.width / 2 - (crop.x + crop.size / 2)) * scale,
    y: (natural.height / 2 - (crop.y + crop.size / 2)) * scale,
  }

  return { zoom, offset: clampOffset(offset, geometry, zoom) }
}

export function ImageCropper({ source, initialCrop, onConfirm, onCancel }: {
  source: string
  /** O enquadramento de onde começar, em pixels de `source`. */
  initialCrop?: PhotoCrop | null
  onConfirm: (blob: Blob, crop: PhotoCrop) => Promise<void>
  onCancel: () => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; offset: Offset } | null>(null)
  const restoredRef = useRef(false)
  const [natural, setNatural] = useState<Size | null>(null)
  const [view, setView] = useState<View>({ zoom: 1, offset: { x: 0, y: 0 } })
  const [isSaving, setIsSaving] = useState(false)
  const [isBroken, setIsBroken] = useState(false)
  const [error, setError] = useState("")
  const isLandscape = natural === null || natural.width >= natural.height

  const applyZoom = (value: number) => setView((current) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, value))
    const geometry = readGeometry(stageRef.current, imageRef.current)
    return { zoom, offset: geometry ? clampOffset(current.offset, geometry, zoom) : current.offset }
  })

  // O enquadramento só é restaurado depois que o tamanho natural entrou no estado:
  // é ele que decide se a imagem ocupa o palco pela largura ou pela altura, e antes
  // desse render a medida do `readGeometry` ainda seria a do palpite inicial.
  useEffect(() => {
    if (!natural || restoredRef.current) return
    restoredRef.current = true

    const geometry = readGeometry(stageRef.current, imageRef.current)
    if (!initialCrop || initialCrop.size <= 0 || !geometry) return
    setView(viewFromCrop(initialCrop, natural, geometry))
  }, [initialCrop, natural])

  // React registra "wheel" como passivo na raiz, então o listener nativo é o único
  // jeito de bloquear a rolagem enquanto o usuário aproxima a foto.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      setView((current) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(1, current.zoom - event.deltaY * 0.0015))
        const geometry = readGeometry(stageRef.current, imageRef.current)
        return { zoom, offset: geometry ? clampOffset(current.offset, geometry, zoom) : current.offset }
      })
    }
    stage.addEventListener("wheel", handleWheel, { passive: false })
    return () => stage.removeEventListener("wheel", handleWheel)
  }, [])

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!natural) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, offset: view.offset }
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const geometry = readGeometry(stageRef.current, imageRef.current)
    if (!drag || !geometry) return
    const moved = {
      x: drag.offset.x + (event.clientX - drag.pointerX),
      y: drag.offset.y + (event.clientY - drag.pointerY),
    }
    setView((current) => ({ ...current, offset: clampOffset(moved, geometry, current.zoom) }))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  const confirm = async () => {
    const image = imageRef.current
    const geometry = readGeometry(stageRef.current, image)
    if (!image || !natural || !geometry) return
    setIsSaving(true)
    setError("")

    try {
      // Pixels do palco por pixel da imagem original.
      const scale = (geometry.baseWidth * view.zoom) / natural.width
      const cropSize = geometry.stageSize / scale
      const centerX = natural.width / 2 - view.offset.x / scale
      const centerY = natural.height / 2 - view.offset.y / scale
      const cropX = Math.min(Math.max(0, centerX - cropSize / 2), Math.max(0, natural.width - cropSize))
      const cropY = Math.min(Math.max(0, centerY - cropSize / 2), Math.max(0, natural.height - cropSize))

      const canvas = document.createElement("canvas")
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Não foi possível preparar o recorte.")

      context.imageSmoothingQuality = "high"
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
      context.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

      const blob = (await encode(canvas, "image/webp", 0.92)) || (await encode(canvas, "image/jpeg", 0.9))
      if (!blob) throw new Error("Não foi possível gerar a imagem recortada.")

      // O retângulo vai junto: é o que permite reabrir aqui mesmo depois.
      await onConfirm(blob, { x: cropX, y: cropY, size: cropSize })
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "Erro inesperado.")
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div
        ref={stageRef}
        className="relative mx-auto aspect-square w-full max-w-[320px] cursor-grab touch-none select-none overflow-hidden rounded-md bg-neutral-900 active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          ref={imageRef}
          className="absolute left-1/2 top-1/2 max-w-none select-none"
          style={{
            width: isLandscape ? "auto" : "100%",
            height: isLandscape ? "100%" : "auto",
            transform: `translate(-50%, -50%) translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.zoom})`,
            visibility: natural ? "visible" : "hidden",
          }}
          src={source}
          alt=""
          draggable={false}
          onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => setIsBroken(true)}
        />
        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-metalique" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }} />
        {!natural && !isBroken && <div className="absolute inset-0 grid place-items-center text-white"><LoaderCircle className="size-6 animate-spin" /></div>}
        {isBroken && <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-white">Não foi possível ler esta imagem.</div>}
      </div>

      <div className="flex items-center gap-3">
        <ZoomOut className="size-4 shrink-0 text-ink-muted" />
        <input
          className="h-1.5 flex-1 cursor-pointer accent-[#db0f0f]"
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view.zoom}
          onChange={(event) => applyZoom(Number(event.target.value))}
          disabled={!natural}
          aria-label="Zoom da foto"
        />
        <ZoomIn className="size-4 shrink-0 text-ink-muted" />
        <span className="w-9 text-right text-xs tabular-nums text-ink-muted">{view.zoom.toFixed(1)}x</span>
      </div>

      <div className="flex justify-end">
        <button className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-black" type="button" onClick={() => setView({ zoom: 1, offset: { x: 0, y: 0 } })} disabled={!natural}>
          <RotateCcw className="size-3.5" /> Redefinir
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="flex flex-col-reverse gap-2 border-t border-hairline pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Cancelar</Button>
        {/* "Aplicar", e não "Salvar": daqui o recorte só vira rascunho - quem grava
            no servidor é o Salvar da barra das configurações. */}
        <Button type="button" onClick={() => void confirm()} disabled={isSaving || !natural}>
          {isSaving && <LoaderCircle className="animate-spin" />}
          {isSaving ? "Aplicando..." : "Aplicar"}
        </Button>
      </div>
    </div>
  )
}
