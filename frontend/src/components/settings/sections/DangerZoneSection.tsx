import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Link2, LoaderCircle, TriangleAlert } from "lucide-react"

import { SectorPurgeDialog } from "@/components/settings/sections/SectorPurgeDialog"
import type { PurgeChoice, PurgeSector } from "@/components/settings/sections/SectorPurgeDialog"
import { SettingsGroup } from "@/components/settings/SettingsRow"
import { Button } from "@/components/ui/button"
import { getJson } from "@/lib/api"
import { cn } from "@/lib/utils"

type LastPurge = { sector: string; groups: string[]; user: string; at: string }

/**
 * A zona de perigo.
 *
 * Não registra rascunho na central de propósito: aqui não há nada a salvar
 * depois. O que esta seção faz acontece no momento do clique, atrás de duas
 * travas, e um rascunho registrado faria a barra "alterações não salvas"
 * aparecer para uma seção que nunca terá alterações a salvar.
 *
 * A lista de abas e o que cada uma apaga vêm do servidor, de `SectorData`.
 * Repeti-las aqui criaria uma segunda verdade sobre o que cada marcação leva.
 */
export function DangerZoneSection({ csrfToken }: { csrfToken: string }) {
  const [sectors, setSectors] = useState<PurgeSector[]>([])
  const [lastPurge, setLastPurge] = useState<LastPurge | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setError("")
    try {
      const payload = await getJson<{ sectors: PurgeSector[]; lastPurge: LastPurge | null }>(
        "/backend/api/admin/sector-purge.php",
      )
      setSectors(payload.sectors)
      setLastPurge(payload.lastPurge)
      setChosen([])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar as abas.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Um expurgo é de um setor só. Hoje existe apenas a Qualidade, mas manter a
  // escolha presa a um setor é o que evita marcar abas de dois módulos e mandar
  // ao servidor uma lista que ele não pode atender.
  const [sectorId, setSectorId] = useState("")
  const sector = sectors.find((item) => item.id === sectorId) || sectors[0] || null

  /**
   * O que cai por cascata sai do resumo, como o servidor também faz: os planos
   * de ação morrem com a reclamação, e contá-los à parte somaria as mesmas
   * linhas duas vezes na tela.
   */
  const arrastados = useMemo(() => {
    const porQuem = new Map<string, string>()
    if (!sector) return porQuem

    const rotulos = new Map<string, string>()
    const cascades = new Map<string, string[]>()
    sector.tabs.forEach((tab) => {
      if (!tab.group) return
      rotulos.set(tab.group, tab.label)
      cascades.set(tab.group, tab.cascades ?? [])
    })
    sector.extras.forEach((extra) => {
      rotulos.set(extra.group, extra.label ?? extra.group)
      cascades.set(extra.group, extra.cascades ?? [])
    })

    chosen.forEach((key) => {
      (cascades.get(key) ?? []).forEach((arrastado) => {
        porQuem.set(arrastado, rotulos.get(key) ?? key)
      })
    })

    return porQuem
  }, [sector, chosen])

  const escolhidos = useMemo((): PurgeChoice[] => {
    if (!sector) return []

    const daAba = sector.tabs
      .filter((tab) => tab.group && chosen.includes(tab.group) && !arrastados.has(tab.group))
      .map((tab) => ({ key: tab.group as string, label: tab.label, rows: tab.rows ?? 0, files: tab.files ?? 0 }))
    const dosExtras = sector.extras
      .filter((extra) => chosen.includes(extra.group) && !arrastados.has(extra.group))
      .map((extra) => ({ key: extra.group, label: extra.label ?? extra.group, rows: extra.rows, files: extra.files }))

    return [...daAba, ...dosExtras]
  }, [sector, chosen, arrastados])

  const rows = escolhidos.reduce((total, item) => total + item.rows, 0)

  /** Um grupo que exige companhia não pode ser marcado sozinho. */
  const toggle = (group: string, requiresAll: boolean) => {
    if (!sector) return
    setSectorId(sector.id)

    const todos = [
      ...sector.tabs.map((tab) => tab.group).filter((key): key is string => Boolean(key)),
      ...sector.extras.map((extra) => extra.group),
    ]
    const exigeTudo = (key: string) =>
      sector.tabs.find((tab) => tab.group === key)?.requiresAll
      || sector.extras.find((extra) => extra.group === key)?.requiresAll

    setChosen((current) => {
      if (current.includes(group)) {
        // Desmarcar qualquer um derruba junto os que exigiam todos.
        const next = current.filter((key) => key !== group)
        return next.filter((key) => !exigeTudo(key))
      }
      return requiresAll ? todos : [...current, group]
    })
  }

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-ink-muted">
        <LoaderCircle className="size-4 animate-spin" /> Carregando as abas...
      </p>
    )
  }

  /** Uma linha marcável: aba com dados próprios, ou item de fora das abas. */
  const linha = (
    key: string,
    label: string,
    description: string,
    rowCount: number,
    files: number,
    requiresAll: boolean,
  ) => {
    const arrastadoPor = arrastados.get(key)
    const arrastado = arrastadoPor !== undefined
    const isChosen = chosen.includes(key) || arrastado
    const isEmpty = rowCount === 0

    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={isChosen}
        disabled={arrastado || (isEmpty && !isChosen)}
        onClick={() => toggle(key, requiresAll)}
        className={cn(
          "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/35",
          isChosen ? "border-red-200 bg-red-50" : "border-hairline hover:border-hairline-strong",
          isEmpty && !isChosen && "opacity-50",
        )}
      >
        <span
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded border",
            isChosen ? "border-red-700 bg-red-700 text-white" : "border-hairline-strong",
          )}
          aria-hidden="true"
        >
          {isChosen && <Check className="size-3.5" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className={cn("text-sm font-medium", isChosen ? "text-red-800" : "text-ink")}>{label}</span>
            <span
              className={cn(
                "text-sm font-medium tabular-nums",
                isChosen ? "text-red-800" : "text-ink-soft",
              )}
            >
              {rowCount}
              {files > 0 && ` · ${files} foto(s)`}
            </span>
          </span>
          <span
            className={cn("mt-0.5 block text-[13px] leading-5", isChosen ? "text-red-700" : "text-ink-muted")}
          >
            {description}
            {requiresAll && " Só podem ser apagados junto com todo o resto."}
            {arrastado && ` Já vai junto com ${arrastadoPor}, que apaga estes registros por tabela compartilhada.`}
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" /> Isto apaga dados de verdade
        </p>
        <p className="mt-1.5 text-[13px] leading-5 text-red-700">
          Apagar não tem desfazer. As tabelas do banco continuam existindo — o que sai são
          as linhas delas. Antes da exclusão o sistema gera um backup do módulo inteiro e o
          entrega a você; se o download não completar, nada é apagado. Contas, permissões e
          ramais nunca são tocados.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-[#b00c0c]" role="alert">{error}</p>
      )}

      {sector && (
        <>
          <SettingsGroup
            title={`Abas de ${sector.label}`}
            description="Marque as abas que devem ficar vazias. O que não estiver marcado não é tocado."
          >
            <ul className="mt-2 space-y-2">
              {sector.tabs.map((tab) => {
                if (tab.group) {
                  return (
                    <li key={tab.id}>
                      {linha(
                        tab.group,
                        tab.label,
                        tab.description ?? "",
                        tab.rows ?? 0,
                        tab.files ?? 0,
                        tab.requiresAll ?? false,
                      )}
                    </li>
                  )
                }

                // Aba sem banco próprio: ela esvazia quando as donas esvaziam.
                const nomesDasFontes = tab.sources.map(
                  (source) => sector.tabs.find((item) => item.group === source)?.label ?? source,
                )
                const acesa = tab.sources.length > 0 && tab.sources.every((source) => chosen.includes(source))

                return (
                  <li key={tab.id}>
                    <div
                      className={cn(
                        "flex items-start gap-3 rounded-md border border-dashed p-3",
                        acesa ? "border-red-200 bg-red-50" : "border-hairline",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center",
                          acesa ? "text-red-700" : "text-ink-muted",
                        )}
                        aria-hidden="true"
                      >
                        <Link2 className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("text-sm font-medium", acesa ? "text-red-800" : "text-ink-soft")}>
                          {tab.label}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block text-[13px] leading-5",
                            acesa ? "text-red-700" : "text-ink-muted",
                          )}
                        >
                          Não tem dados próprios — é a mesma base de{" "}
                          {nomesDasFontes.join(" e ")}. {acesa ? "Vai ficar vazia." : "Esvazia junto."}
                        </span>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </SettingsGroup>

          {sector.extras.length > 0 && (
            <SettingsGroup
              title="Fora das abas"
              description="Dados do módulo que não aparecem em nenhuma aba."
            >
              <ul className="mt-2 space-y-2">
                {sector.extras.map((extra) => (
                  <li key={extra.group}>
                    {linha(
                      extra.group,
                      extra.label ?? extra.group,
                      extra.description,
                      extra.rows,
                      extra.files,
                      extra.requiresAll,
                    )}
                  </li>
                ))}
              </ul>
            </SettingsGroup>
          )}

          <div className="flex items-center justify-end gap-3">
            <span className="text-[13px] text-ink-muted">
              {escolhidos.length === 0
                ? "Nada marcado."
                : `${rows} registro(s) em ${escolhidos.length} item(ns).`}
            </span>
            <Button
              type="button"
              className="bg-red-700 hover:bg-red-800"
              disabled={escolhidos.length === 0 || rows === 0}
              onClick={() => setIsDialogOpen(true)}
            >
              <TriangleAlert /> Apagar o que está marcado
            </Button>
          </div>
        </>
      )}

      <p className="border-t border-hairline pt-4 text-[13px] text-ink-muted">
        {lastPurge
          ? `Última exclusão: ${new Date(lastPurge.at).toLocaleString("pt-BR")} por ${lastPurge.user} na ${lastPurge.sector} — ${lastPurge.groups.join(", ")}.`
          : "Nenhuma exclusão registrada até agora."}
      </p>

      {sector && escolhidos.length > 0 && (
        <SectorPurgeDialog
          sector={sector}
          choices={escolhidos}
          csrfToken={csrfToken}
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onPurged={() => { void load() }}
        />
      )}
    </div>
  )
}
