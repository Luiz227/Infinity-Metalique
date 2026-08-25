import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

/**
 * O registro de rascunhos da central.
 *
 * Cada seção continua dona do próprio rascunho - é ela que sabe o que conta
 * como mudança ali dentro e como gravá-la. O que este contexto faz é juntá-las:
 * a barra do rodapé pergunta "alguém tem algo pendente?" e, no Salvar, manda
 * cada uma gravar o que é seu.
 *
 * Salvar é em série, e não em paralelo: são gravações independentes, em
 * endpoints diferentes, e se a senha for recusada a pessoa precisa saber qual
 * seção recusou. Disparadas juntas, a primeira falha esconderia as outras; em
 * série, a que falhar para a fila e diz o próprio nome.
 */
export type DraftSection = {
  /** Mesmo id da seção na barra lateral: é por ele que a falha é apontada. */
  id: string
  isDirty: boolean
  /** Grava o que é seu. Lançar interrompe o Salvar e mostra a mensagem. */
  save: () => Promise<void>
  /** Devolve a seção ao estado de quando a central abriu. */
  discard: () => void
}

type Commands = {
  sections: { current: Map<string, DraftSection> }
  setDirty: (id: string, isDirty: boolean) => void
}

/**
 * Dois contextos, e não um.
 *
 * O primeiro é estável: as seções falam por ele e nunca são re-renderizadas por
 * causa dele. O segundo carrega a lista de quem está sujo, e é ele que acorda a
 * barra - contexto avisa quem o consome quando o *valor* muda, e é essa a única
 * via que atravessa uma subárvore que o React, de resto, pularia (o `children`
 * do provedor é sempre o mesmo elemento, então mudar estado aqui dentro não
 * re-renderiza ninguém lá embaixo).
 *
 * Juntar os dois num objeto só custaria um render de todas as seções a cada
 * tecla digitada em qualquer uma delas.
 */
const CommandsContext = createContext<Commands | null>(null)
const DirtyContext = createContext<readonly string[]>([])

export function SettingsDraftProvider({ children }: { children: ReactNode }) {
  const sections = useRef(new Map<string, DraftSection>())
  const [dirtyIds, setDirtyIds] = useState<string[]>([])

  const setDirty = useCallback((id: string, isDirty: boolean) => {
    setDirtyIds((current) => {
      // Devolver a mesma lista quando nada muda é o que impede o vaivém: a
      // seção reavisa a cada render, e um array novo a cada aviso re-renderizaria
      // a barra, que re-renderiza a seção, que reavisa.
      if (current.includes(id) === isDirty) return current
      return isDirty ? [...current, id] : current.filter((item) => item !== id)
    })
  }, [])

  const commands = useMemo(() => ({ sections, setDirty }), [setDirty])

  return (
    <CommandsContext.Provider value={commands}>
      <DirtyContext.Provider value={dirtyIds}>{children}</DirtyContext.Provider>
    </CommandsContext.Provider>
  )
}

/**
 * Registra a seção no rascunho da central.
 *
 * O registro é reescrito a cada render: `isDirty` e os callbacks fecham sobre o
 * estado atual da seção, e um registro congelado na montagem gravaria o
 * rascunho de quando ela abriu. A barra só é avisada quando a seção cruza a
 * fronteira entre limpa e suja - dentro de cada um dos dois nada muda para ela.
 */
export function useDraftSection(section: DraftSection) {
  const commands = useContext(CommandsContext)
  const { id, isDirty } = section

  useEffect(() => {
    commands?.sections.current.set(id, section)
  })

  useEffect(() => {
    commands?.setDirty(id, isDirty)
  }, [commands, id, isDirty])

  useEffect(() => () => {
    // Uma seção desmontada não tem mais rascunho a oferecer. Na central as
    // visitadas ficam montadas, então isto só acontece ao fechar o modal.
    commands?.sections.current.delete(id)
    commands?.setDirty(id, false)
  }, [commands, id])
}

/** O que a barra do rodapé lê e comanda. */
export function useSettingsDraft() {
  const commands = useContext(CommandsContext)
  const dirtyIds = useContext(DirtyContext)

  /** Devolve o id da seção que recusou, ou null se tudo entrou. */
  const save = useCallback(async (): Promise<string | null> => {
    for (const section of [...(commands?.sections.current.values() || [])]) {
      if (!section.isDirty) continue
      try {
        await section.save()
      } catch {
        return section.id
      }
    }
    return null
  }, [commands])

  const discard = useCallback(() => {
    commands?.sections.current.forEach((section) => {
      if (section.isDirty) section.discard()
    })
  }, [commands])

  return { isDirty: dirtyIds.length > 0, save, discard }
}
