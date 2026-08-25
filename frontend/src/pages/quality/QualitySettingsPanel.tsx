import { useCallback, useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { CatalogRow, CatalogSection, move, nextDraftKey, patch } from "@/components/settings/CatalogEditor"
import { useDraftSection } from "@/components/settings/SettingsDraft"
import { SettingsFeedback } from "@/components/settings/SettingsRow"
import { Input } from "@/components/ui/input"
import { getJson, postJson } from "@/lib/api"
import type { QualitySettings } from "@/pages/quality/types"

/** `key` existe só para o React: linhas novas ainda não têm id do banco. */
type DraftGate = { key: string; id: number | null; name: string; active: boolean; usage: number }
type DraftCode = { key: string; id: number | null; code: string; description: string; active: boolean; usage: number }

const nextKey = nextDraftKey

/** O que sobe ao servidor - e, por isso mesmo, o que define "mexeram nisto". */
const shape = (gates: DraftGate[], codes: DraftCode[], target: string) => JSON.stringify({
  target: target.trim(),
  gates: gates.map((gate) => [gate.id, gate.name, gate.active]),
  codes: codes.map((code) => [code.id, code.code, code.description, code.active]),
})

/**
 * Catálogos e meta da Qualidade num rascunho local que só vai ao servidor no
 * Salvar - e vai inteiro, numa transação. Editar catálogo é mexer no que os
 * formulários de RAP oferecem, e um meio-termo gravado deixaria a tela de
 * lançamento num estado que ninguém pediu.
 *
 * Quem salva é a barra da central, como em todas as seções. O rascunho daqui já
 * era assim antes de ela existir; o que mudou foi de onde vem o botão.
 */
export function QualitySettingsPanel({ csrfToken }: { csrfToken: string }) {
  const [gates, setGates] = useState<DraftGate[]>([])
  const [codes, setCodes] = useState<DraftCode[]>([])
  const [target, setTarget] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  // O retrato do último estado gravado, para saber o que é mudança e para o
  // Descartar ter a que voltar sem pedir tudo ao servidor de novo.
  const baseline = useRef("")
  const [baselineVersion, setBaselineVersion] = useState(0)
  const lastPayload = useRef<QualitySettings | null>(null)

  const adopt = useCallback((payload: QualitySettings) => {
    const nextGates = payload.gates.map((gate) => ({
      key: `gate-${gate.id}`,
      id: gate.id,
      name: gate.name,
      active: gate.active,
      usage: gate.usage,
    }))
    const nextCodes = payload.codes.map((code) => ({
      key: `code-${code.id}`,
      id: code.id,
      code: code.code,
      description: code.description,
      active: code.active,
      usage: code.usage,
    }))
    const nextTarget = payload.targets.rapsPerMonth === null ? "" : String(payload.targets.rapsPerMonth)

    setGates(nextGates)
    setCodes(nextCodes)
    setTarget(nextTarget)
    lastPayload.current = payload
    baseline.current = shape(nextGates, nextCodes, nextTarget)
    setBaselineVersion((current) => current + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError("")

    getJson<QualitySettings>("/backend/api/quality/settings.php", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((payload) => {
        if (controller.signal.aborted) return
        adopt(payload)
        setIsLoading(false)
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return
        setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar as configurações.")
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [adopt])

  const save = useCallback(async () => {
    setError("")
    setNotice("")
    setIsSaving(true)

    try {
      const payload = await postJson<QualitySettings & { message: string }>(
        "/backend/api/quality/settings-save.php",
        {
          csrfToken,
          rapsMonthlyTarget: target.trim() === "" ? null : Number(target),
          gates: gates.map((gate) => ({ id: gate.id, name: gate.name, active: gate.active })),
          codes: codes.map((code) => ({
            id: code.id,
            code: code.code,
            description: code.description,
            active: code.active,
          })),
        },
      )
      adopt(payload)
      setNotice(payload.message)
      // O painel mora nas configurações, mas quem precisa recarregar é a tela da
      // Qualidade atrás dele: mexer no catálogo muda o que os filtros e os
      // formulários oferecem. O poller de revisão chegaria lá em alguns
      // segundos; o aviso direto poupa a espera.
      window.dispatchEvent(new CustomEvent<string>("metalique:quality-settings-saved", { detail: payload.message }))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar as configurações.")
      throw requestError
    } finally {
      setIsSaving(false)
    }
  }, [adopt, codes, csrfToken, gates, target])

  const discard = useCallback(() => {
    if (lastPayload.current) adopt(lastPayload.current)
    setError("")
    setNotice("")
  }, [adopt])

  useDraftSection({
    id: "qualidade",
    // `baselineVersion` entra na conta só para a comparação ser refeita quando
    // o retrato muda: `baseline` é uma referência, e sozinha não dispara render.
    isDirty: !isLoading && Boolean(baselineVersion) && shape(gates, codes, target) !== baseline.current,
    save,
    discard,
  })

  const busy = isLoading || isSaving

  if (isLoading) {
    return (
      <div className="grid h-40 place-items-center text-ink-muted">
        <LoaderCircle className="size-6 animate-spin" aria-label="Carregando configurações" />
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <SettingsFeedback error={error} notice={notice} />

      <p className="text-[13px] leading-5 text-ink-muted">
        Item já usado em algum apontamento não pode ser apagado — desative-o para tirá-lo dos formulários sem perder
        o histórico.
      </p>

      <section className="rounded-md border border-hairline p-4">
        <h3 className="text-sm font-semibold">Meta de RAPs</h3>
        <label className="mt-3 block text-sm font-medium">
          Máximo de RAPs por mês
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            className="mt-2 block max-w-[220px]"
            placeholder="sem meta"
            value={target}
            disabled={busy}
            onChange={(event) => setTarget(event.target.value)}
          />
        </label>
        <p className="mt-2 text-xs text-ink-soft">
          A meta é um teto: o número do mês precisa ficar abaixo dela. Ela vira a linha pontilhada
          vermelha nos gráficos mensais, e o mês que passar dela aparece em vermelho. Deixe o campo
          vazio para não acompanhar meta nenhuma.
        </p>
      </section>

      <CatalogSection
        title="Gates"
        description="Etapas de inspeção oferecidas no formulário de RAP."
        addLabel="Adicionar gate"
        onAdd={() => setGates((current) => [...current, { key: nextKey(), id: null, name: "", active: true, usage: 0 }])}
        disabled={busy}
      >
        {gates.map((gate, index) => (
          <CatalogRow
            key={gate.key}
            index={index}
            total={gates.length}
            active={gate.active}
            lockedLabel={usageLabel(gate.usage)}
            lockedTitle="Não pode ser apagado: desative-o para tirá-lo dos formulários."
            disabled={busy}
            onMove={(to) => setGates((current) => move(current, index, to))}
            onToggle={() => setGates((current) => patch(current, index, { active: !gate.active }))}
            onRemove={() => setGates((current) => current.filter((_, item) => item !== index))}
          >
            <Input
              aria-label={`Nome do gate ${index + 1}`}
              className="h-10"
              placeholder="GATE 4"
              value={gate.name}
              disabled={busy}
              onChange={(event) => setGates((current) => patch(current, index, { name: event.target.value }))}
            />
          </CatalogRow>
        ))}
      </CatalogSection>

      <CatalogSection
        title="Códigos"
        description="Causas padronizadas escolhidas ao lançar um RAP."
        addLabel="Adicionar código"
        onAdd={() => setCodes((current) => [...current, { key: nextKey(), id: null, code: "", description: "", active: true, usage: 0 }])}
        disabled={busy}
      >
        {codes.map((code, index) => (
          <CatalogRow
            key={code.key}
            index={index}
            total={codes.length}
            active={code.active}
            lockedLabel={usageLabel(code.usage)}
            lockedTitle="Não pode ser apagado: desative-o para tirá-lo dos formulários."
            disabled={busy}
            onMove={(to) => setCodes((current) => move(current, index, to))}
            onToggle={() => setCodes((current) => patch(current, index, { active: !code.active }))}
            onRemove={() => setCodes((current) => current.filter((_, item) => item !== index))}
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)]">
              <Input
                aria-label={`Sigla do código ${index + 1}`}
                className="h-10"
                placeholder="COD 11"
                value={code.code}
                disabled={busy}
                onChange={(event) => setCodes((current) => patch(current, index, { code: event.target.value }))}
              />
              <Input
                aria-label={`Descrição do código ${index + 1}`}
                className="h-10"
                placeholder="O que essa causa significa"
                value={code.description}
                disabled={busy}
                onChange={(event) => setCodes((current) => patch(current, index, { description: event.target.value }))}
              />
            </div>
          </CatalogRow>
        ))}
      </CatalogSection>

    </div>
  )
}

/**
 * A lixeira só desaparece quando há apontamento usando o item: no lugar dela fica
 * a contagem, que é a resposta a "por que não dá para apagar".
 */
function usageLabel(usage: number): string | null {
  if (usage <= 0) return null

  return `${usage} ${usage === 1 ? "RAP" : "RAPs"}`
}
