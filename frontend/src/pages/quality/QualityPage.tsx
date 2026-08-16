import { useCallback, useEffect, useRef, useState } from "react"
import { ClipboardList, FileUp, LoaderCircle, MousePointerClick, PackagePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getJson, postJson } from "@/lib/api"
import { FilterBar } from "@/pages/quality/FilterBar"
import { DispatchForm } from "@/pages/quality/forms/DispatchForm"
import { RapForm } from "@/pages/quality/forms/RapForm"
import { QualityImportDialog } from "@/pages/quality/QualityImportDialog"
import { PrintSheet } from "@/pages/quality/print/PrintSheet"
import { DispatchSection } from "@/pages/quality/sections/DispatchSection"
import { ProductsSection } from "@/pages/quality/sections/ProductsSection"
import { RapsSection } from "@/pages/quality/sections/RapsSection"
import { ReportsSection } from "@/pages/quality/sections/ReportsSection"
import { SatisfactionSection } from "@/pages/quality/sections/SatisfactionSection"
import { TeamSection } from "@/pages/quality/sections/TeamSection"
import { UnitsSection } from "@/pages/quality/sections/UnitsSection"
import {
  type DispatchDetail,
  type DispatchRow,
  type Paginated,
  type QualityChartSelection,
  type QualityDashboard,
  type QualityFilters,
  type QualityOptions,
  type ReportDetail,
  type ReportRow,
  emptyFilters,
  filtersToQuery,
} from "@/pages/quality/types"
import type { PermissionKey } from "@/types"

const TABS = [
  { id: "raps", label: "RAPs", permission: "quality.raps" },
  { id: "unidades", label: "Unidades", permission: "quality.units" },
  { id: "produtos", label: "Produtos", permission: "quality.products" },
  { id: "coletas", label: "Produtos Coletados", permission: "quality.dispatches" },
  { id: "colaboradores", label: "Colaboradores", permission: "quality.employees" },
  { id: "qualidade", label: "Qualidade", permission: "quality.satisfaction" },
  { id: "registros", label: "Registros", permission: "quality.records" },
] as const

type TabId = (typeof TABS)[number]["id"]
type PrintTarget = { kind: "report" | "dispatch"; id: number }

/**
 * View do administrador da qualidade: os indicadores do Power BI lidos do MySQL,
 * mais o lançamento de RAP e de produto coletado. Uma única barra de filtros
 * recorta todas as seções.
 *
 * Devolve só o conteúdo do painel - a moldura e o cabeçalho vêm do AppShell.
 */
export function QualityPage({ csrfToken, canCreateRap, canCreateDispatch, canImport, canDelete, permissions, tabsInHeader }: {
  csrfToken: string
  canCreateRap: boolean
  canCreateDispatch: boolean
  canImport: boolean
  canDelete: boolean
  permissions: PermissionKey[]
  tabsInHeader: boolean
}) {
  const [filters, setFilters] = useState<QualityFilters>(emptyFilters)
  const [tab, setTab] = useState<TabId>("raps")
  const [options, setOptions] = useState<QualityOptions | null>(null)
  const [dashboard, setDashboard] = useState<QualityDashboard | null>(null)
  const [highlightDashboard, setHighlightDashboard] = useState<QualityDashboard | null>(null)
  const [chartSelection, setChartSelection] = useState<QualityChartSelection | null>(null)
  const [chartEpoch, setChartEpoch] = useState(0)
  const [isHighlightLoading, setIsHighlightLoading] = useState(false)
  const [reports, setReports] = useState<Paginated<ReportRow> | null>(null)
  const [dispatches, setDispatches] = useState<Paginated<DispatchRow> | null>(null)
  const [recordDispatches, setRecordDispatches] = useState<Paginated<DispatchRow> | null>(null)
  const [reportsPage, setReportsPage] = useState(1)
  const [dispatchesPage, setDispatchesPage] = useState(1)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [openForm, setOpenForm] = useState<"rap" | "dispatch" | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [printTarget, setPrintTarget] = useState<PrintTarget | null>(null)
  const [printReport, setPrintReport] = useState<ReportDetail | null>(null)
  const [printDispatch, setPrintDispatch] = useState<DispatchDetail | null>(null)
  const loadController = useRef<AbortController | null>(null)
  const visibleTabs = TABS.filter((item) => permissions.includes(item.permission))
  const hasVisibleTab = visibleTabs.some((item) => item.id === tab)
  const isActionOnly = visibleTabs.length === 0 && (canCreateRap || canCreateDispatch)

  useEffect(() => {
    if (!visibleTabs.some((item) => item.id === tab)) {
      setTab(visibleTabs[0]?.id || "raps")
    }
  }, [permissions, tab, visibleTabs])

  useEffect(() => {
    const selectHeaderTab = (event: Event) => {
      const requestedTab = (event as CustomEvent<string>).detail
      if (visibleTabs.some((item) => item.id === requestedTab)) {
        setTab(requestedTab as TabId)
        setChartSelection(null)
        setHighlightDashboard(null)
      }
    }
    window.addEventListener("metalique:quality-tab", selectHeaderTab)
    return () => window.removeEventListener("metalique:quality-tab", selectHeaderTab)
  }, [permissions, visibleTabs])

  useEffect(() => {
    const openHeaderForm = (event: Event) => {
      const form = (event as CustomEvent<"rap" | "dispatch">).detail
      if (form === "rap" && canCreateRap) setOpenForm("rap")
      if (form === "dispatch" && canCreateDispatch) setOpenForm("dispatch")
    }

    window.addEventListener("metalique:quality-open-form", openHeaderForm)
    return () => window.removeEventListener("metalique:quality-open-form", openHeaderForm)
  }, [canCreateDispatch, canCreateRap])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("metalique:quality-tab-changed", { detail: tab }))
  }, [tab])

  // Navegadores podem suspender requestAnimationFrame quando a aba fica em
  // segundo plano. Remontar os SVGs ao voltar acorda o motor do Recharts sem
  // perder filtros, seleção ou dados já carregados.
  useEffect(() => {
    const resumeCharts = () => {
      if (document.visibilityState === "visible") {
        setChartEpoch((current) => current + 1)
      }
    }

    document.addEventListener("visibilitychange", resumeCharts)
    window.addEventListener("focus", resumeCharts)
    window.addEventListener("pageshow", resumeCharts)

    return () => {
      document.removeEventListener("visibilitychange", resumeCharts)
      window.removeEventListener("focus", resumeCharts)
      window.removeEventListener("pageshow", resumeCharts)
    }
  }, [])

  useEffect(() => {
    getJson<QualityOptions>("/backend/api/quality/options.php")
      .then(setOptions)
      .catch(() => setError("Não foi possível carregar as listas do setor de qualidade."))
  }, [])

  const load = useCallback(async () => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller

    setIsFetching(true)
    setError("")
    const query = filtersToQuery(filters)
    const pageSeparator = query ? "&" : "?"

    try {
      const latestDispatchesRequest = getJson<Paginated<DispatchRow>>(
        `/backend/api/quality/dispatches.php${query}${pageSeparator}page=1`,
        { signal: controller.signal },
      )
      const recordDispatchesRequest = dispatchesPage === 1
        ? latestDispatchesRequest
        : getJson<Paginated<DispatchRow>>(
            `/backend/api/quality/dispatches.php${query}${pageSeparator}page=${dispatchesPage}`,
            { signal: controller.signal },
          )

      const [dashboardData, reportsData, dispatchesData, recordDispatchesData] = await Promise.all([
        getJson<QualityDashboard>(`/backend/api/quality/dashboard.php${query}`, { signal: controller.signal }),
        getJson<Paginated<ReportRow>>(
          `/backend/api/quality/reports.php${query}${pageSeparator}page=${reportsPage}`,
          { signal: controller.signal },
        ),
        latestDispatchesRequest,
        recordDispatchesRequest,
      ])

      if (controller.signal.aborted || loadController.current !== controller) return

      setDashboard(dashboardData)
      setReports(reportsData)
      setDispatches(dispatchesData)
      setRecordDispatches(recordDispatchesData)
    } catch (requestError) {
      if (controller.signal.aborted) return
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      if (loadController.current === controller) {
        loadController.current = null
        setIsFetching(false)
      }
    }
  }, [dispatchesPage, filters, reportsPage])

  useEffect(() => {
    void load()
    return () => {
      loadController.current?.abort()
      loadController.current = null
    }
  }, [load])

  // O destaque anterior continua na tela enquanto o novo carrega: assim o
  // preenchimento vai direto da parcela antiga para a nova, numa animação só.
  useEffect(() => {
    const controller = new AbortController()

    if (!chartSelection) {
      setHighlightDashboard(null)
      setIsHighlightLoading(false)
      return () => controller.abort()
    }

    setIsHighlightLoading(true)
    const selectedFilters: QualityFilters = { ...filters, ...chartSelection.filters }

    getJson<QualityDashboard>(
      `/backend/api/quality/dashboard.php${filtersToQuery(selectedFilters)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (controller.signal.aborted) return
        setHighlightDashboard(data)
        setIsHighlightLoading(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setChartSelection(null)
        setIsHighlightLoading(false)
        setError("Não foi possível calcular o destaque dos gráficos.")
      })

    return () => controller.abort()
  }, [chartSelection, filters])

  // Trocar o filtro volta a listagem para a primeira página.
  const changeFilters = (next: QualityFilters) => {
    setFilters(next)
    setChartSelection(null)
    setHighlightDashboard(null)
    setReportsPage(1)
    setDispatchesPage(1)
  }

  const selectChart = (next: QualityChartSelection) => {
    setChartSelection((current) => current?.key === next.key ? null : next)
  }

  const selectText = (key: "shed" | "gate" | "problemType" | "model", value: string) => {
    if (value === "-") return
    const labels = { shed: "Barracão", gate: "Gate", problemType: "Problema", model: "Modelo" }
    selectChart({ key: `${key}:${value}`, label: `${labels[key]}: ${value}`, filters: { [key]: value } })
  }

  const selectPeriod = (period: string) => {
    const match = /^(\d{4})-(\d{2})$/.exec(period)
    if (!match) return

    const year = Number(match[1])
    const month = Number(match[2])
    selectChart({
      key: `period:${period}`,
      label: `Período: ${String(month).padStart(2, "0")}/${year}`,
      filters: { year, month },
    })
  }

  const selectGatePeriod = (gate: string, period: string) => {
    const match = /^(\d{4})-(\d{2})$/.exec(period)
    if (!match || gate === "-") return

    const year = Number(match[1])
    const month = Number(match[2])
    selectChart({
      key: `gate-period:${gate}:${period}`,
      label: `${gate} em ${String(month).padStart(2, "0")}/${year}`,
      filters: { gate, year, month },
    })
  }

  const selectCode = (code: string) => {
    const option = options?.codes.find((item) => item.code === code)
    if (!option) return
    const id = Number(option.id)
    selectChart({ key: `code:${id}`, label: `Código: ${option.code}`, filters: { codeId: id } })
  }

  const selectMachineType = (name: string) => {
    const option = options?.machineTypes.find((item) => item.name === name)
    if (!option) return
    const id = Number(option.id)
    selectChart({ key: `machine:${id}`, label: `Máquina: ${name}`, filters: { machineTypeId: id } })
  }

  const selectEmployee = (employeeId: number | null) => {
    if (employeeId === null) {
      setChartSelection(null)
      setHighlightDashboard(null)
      return
    }

    const employee = options?.employees.find((item) => Number(item.id) === employeeId)
    if (!employee) return
    selectChart({ key: `employee:${employeeId}`, label: `Colaborador: ${employee.name}`, filters: { employeeId } })
  }

  useEffect(() => {
    if (!printTarget) return

    setPrintReport(null)
    setPrintDispatch(null)

    const url = printTarget.kind === "report"
      ? `/backend/api/quality/report.php?id=${printTarget.id}`
      : `/backend/api/quality/dispatch.php?id=${printTarget.id}`

    getJson<{ report?: ReportDetail; dispatch?: DispatchDetail }>(url)
      .then((payload) => {
        if (payload.report) setPrintReport(payload.report)
        if (payload.dispatch) setPrintDispatch(payload.dispatch)
      })
      .catch(() => {
        setPrintTarget(null)
        setError("Não foi possível carregar o documento para impressão.")
      })
  }, [printTarget])

  const afterCreate = (message: string) => {
    setOpenForm(null)
    setNotice(message)
    void load()
  }

  const deleteRecord = async (kind: PrintTarget["kind"], id: number) => {
    setError("")
    setNotice("")

    try {
      const endpoint = kind === "report"
        ? "/backend/api/quality/report-delete.php"
        : "/backend/api/quality/dispatch-delete.php"
      const payload = await postJson<{ message: string }>(endpoint, { id, csrfToken })

      const shouldGoBack = kind === "report"
        ? reportsPage > 1 && reports?.items.length === 1
        : dispatchesPage > 1 && recordDispatches?.items.length === 1

      if (shouldGoBack) {
        if (kind === "report") setReportsPage((current) => Math.max(1, current - 1))
        else setDispatchesPage((current) => Math.max(1, current - 1))
      } else {
        await load()
      }
      return { success: true, message: payload.message }
    } catch (requestError) {
      return {
        success: false,
        message: requestError instanceof Error ? requestError.message : "Erro inesperado.",
      }
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(30px,2.4vw,43px)] font-medium leading-none">Qualidade</h1>
          <p className="mt-2 text-sm text-[#52514e]">
            Apontamentos, expedição e satisfação do cliente - administração do setor.
          </p>
        </div>

        {(visibleTabs.length > 0 || canImport) && (canCreateRap || canCreateDispatch || canImport) && (
          <div className="flex flex-wrap gap-2">
            {canImport && (
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setIsImportOpen(true)}>
                <FileUp /> Importar planilha
              </Button>
            )}
            {canCreateDispatch && (
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpenForm("dispatch")} disabled={!options}>
                <PackagePlus /> Nova coleta
              </Button>
            )}
            {canCreateRap && (
              <Button type="button" className="rounded-full" onClick={() => setOpenForm("rap")} disabled={!options}>
                <ClipboardList /> Novo RAP
              </Button>
            )}
          </div>
        )}

      </div>

      {notice && (
        <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">
          {notice}
          <button type="button" className="ml-3 underline" onClick={() => setNotice("")}>fechar</button>
        </p>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

      {visibleTabs.length > 0 && (
        <div className="mt-6">
          <FilterBar
            filters={filters}
            options={options}
            onChange={changeFilters}
            onReset={() => changeFilters(emptyFilters)}
          />
        </div>
      )}

      {!tabsInHeader && (
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Seções da qualidade">
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-full px-4 py-2 text-sm transition-colors ${tab === item.id ? "bg-[#db0f0f] text-white" : "bg-white text-[#52514e] hover:bg-neutral-50"}`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => {
                setTab(item.id)
                setChartSelection(null)
                setHighlightDashboard(null)
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      {visibleTabs.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[#52514e]">
          <MousePointerClick className="size-3.5" aria-hidden="true" />
          Clique em uma barra, ponto ou fatia para comparar o subconjunto com os totais; clique novamente para desfazer.
        </p>
      )}

      {visibleTabs.length > 0 && <div className="relative mt-3 pb-2">
        {/* Sem piscar de esqueleto: a leitura anterior fica esmaecida durante o refetch. */}
        {isFetching && dashboard && (
          <div className="pointer-events-none absolute right-0 top-0 z-10 flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-[#52514e] shadow">
            <LoaderCircle className="size-3.5 animate-spin" /> atualizando
          </div>
        )}

        {!dashboard && isFetching && (
          <div className="grid h-64 place-items-center text-[#898781]">
            <LoaderCircle className="size-7 animate-spin" aria-label="Carregando indicadores" />
          </div>
        )}

        {/* O recorte só troca quando os números chegam; esmaecer o painel nesse
            intervalo é o retorno imediato do clique. */}
        {dashboard && hasVisibleTab && (
          <div key={chartEpoch} className={`transition-opacity ${isFetching ? "opacity-60" : isHighlightLoading ? "opacity-80" : ""}`}>
            {tab === "raps" && (
              <RapsSection
                data={dashboard}
                highlight={highlightDashboard}
                selection={chartSelection}
                options={options}
                onSelectPeriod={selectPeriod}
                onSelectProblemType={(value) => selectText("problemType", value)}
                onSelectCode={selectCode}
              />
            )}
            {tab === "unidades" && (
              <UnitsSection
                data={dashboard}
                highlight={highlightDashboard}
                selection={chartSelection}
                onSelectShed={(value) => selectText("shed", value)}
                onSelectPeriod={selectPeriod}
                onSelectGatePeriod={selectGatePeriod}
                onSelectProblemType={(value) => selectText("problemType", value)}
              />
            )}
            {tab === "produtos" && (
              <ProductsSection
                data={dashboard}
                highlight={highlightDashboard}
                selection={chartSelection}
                options={options}
                onSelectModel={(value) => selectText("model", value)}
                onSelectMachineType={selectMachineType}
              />
            )}
            {tab === "coletas" && (
              <DispatchSection
                data={dashboard}
                highlight={highlightDashboard}
                selection={chartSelection}
                dispatches={dispatches}
                options={options}
                canDelete={canDelete}
                onPrint={(id) => setPrintTarget({ kind: "dispatch", id })}
                onDelete={deleteRecord}
                onSelectPeriod={selectPeriod}
                onSelectMachineType={selectMachineType}
                onSelectModel={(value) => selectText("model", value)}
              />
            )}
            {tab === "colaboradores" && (
              <TeamSection
                data={dashboard}
                highlight={highlightDashboard}
                selection={chartSelection}
                options={options}
                employeeId={(chartSelection?.filters.employeeId as number | undefined) ?? null}
                onSelectEmployee={selectEmployee}
                onSelectCode={selectCode}
                onSelectPeriod={selectPeriod}
              />
            )}
            {tab === "qualidade" && (
              <SatisfactionSection
                data={dashboard}
                highlight={highlightDashboard}
                selection={chartSelection}
                onSelectPeriod={selectPeriod}
              />
            )}
            {tab === "registros" && (
              <ReportsSection
                reports={reports}
                dispatches={recordDispatches}
                reportsPage={reportsPage}
                dispatchesPage={dispatchesPage}
                canDelete={canDelete}
                onReportsPageChange={setReportsPage}
                onDispatchesPageChange={setDispatchesPage}
                onPrint={(id) => setPrintTarget({ kind: "report", id })}
                onPrintDispatch={(id) => setPrintTarget({ kind: "dispatch", id })}
                onDelete={deleteRecord}
              />
            )}
          </div>
        )}
      </div>}

      {canCreateRap && openForm === "rap" && options && (
        <RapForm
          csrfToken={csrfToken}
          options={options}
          inline={isActionOnly}
          onClose={() => setOpenForm(null)}
          onCreated={(code) => afterCreate(`Apontamento ${code} registrado.`)}
        />
      )}

      {canCreateDispatch && openForm === "dispatch" && options && (
        <DispatchForm
          csrfToken={csrfToken}
          options={options}
          inline={isActionOnly}
          onClose={() => setOpenForm(null)}
          onCreated={(code) => afterCreate(`Coleta ${code} registrada.`)}
        />
      )}

      {canImport && (
        <QualityImportDialog
          open={isImportOpen}
          csrfToken={csrfToken}
          onOpenChange={setIsImportOpen}
          onImported={() => {
            setNotice("Dados da Qualidade atualizados pela planilha.")
            void load()
            void getJson<QualityOptions>("/backend/api/quality/options.php").then(setOptions)
          }}
        />
      )}

      {printTarget && (
        <PrintSheet
          report={printReport}
          dispatch={printDispatch}
          isLoading={!printReport && !printDispatch}
          onClose={() => { setPrintTarget(null); setPrintReport(null); setPrintDispatch(null) }}
        />
      )}
    </>
  )
}
