import { LoaderCircle, TriangleAlert } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { Button } from "@/components/ui/button"

/**
 * A barra que aparece no rodapé assim que existe algo por salvar.
 *
 * Ela atravessa o modal inteiro, lateral inclusive: o rascunho é de todas as
 * seções ao mesmo tempo, e uma barra que começasse depois da lateral pareceria
 * falar só do painel aberto.
 *
 * `sticky` não serviria: o rodapé precisa ficar por cima de um painel que rola
 * atrás dele, e a barra é irmã da linha lateral+painel, não filha do que rola.
 * O `z-10` a põe acima do conteúdo e o `shadow` para cima separa os dois sem
 * precisar de mais uma linha.
 */
export function SettingsSaveBar({ visible, isSaving, error, attention, onSave, onDiscard }: {
  visible: boolean
  isSaving: boolean
  error: string
  /** Sobe a cada tentativa de fechar com pendência: é o que dispara o chamado. */
  attention: number
  onSave: () => void
  onDiscard: () => void
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="settings-save-bar"
          className="relative z-10 shrink-0 border-t border-hairline bg-surface shadow-[0_-8px_24px_rgb(11_11_11/0.08)]"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
        >
          {/* A sacudida mora num nível de dentro para não brigar com o `y` da
              entrada: dois `animate` no mesmo elemento se sobrescreveriam. */}
          <motion.div
            key={attention}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 md:px-6"
            animate={attention > 0 ? { x: [0, -7, 7, -4, 4, 0] } : undefined}
            transition={{ duration: 0.42, ease: "easeInOut" }}
          >
            <p className={`flex min-w-0 items-center gap-2 text-sm ${error ? "text-[#b00c0c]" : "text-ink-soft"}`} role={error ? "alert" : "status"}>
              {error && <TriangleAlert className="size-4 shrink-0" />}
              <span className="min-w-0">{error || "Você tem alterações não salvas."}</span>
            </p>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4"
                disabled={isSaving}
                onClick={onDiscard}
              >
                Descartar
              </Button>
              <Button type="button" className="h-10 px-5" disabled={isSaving} onClick={onSave}>
                {isSaving && <LoaderCircle className="animate-spin" />}
                {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
