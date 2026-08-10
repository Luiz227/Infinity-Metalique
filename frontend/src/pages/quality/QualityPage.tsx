import { useCallback, useEffect, useState } from "react"
import { ClipboardList, LoaderCircle, PackagePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getJson } from "@/lib/api"
import { FilterBar } from "@/pages/quality/FilterBar"
import { DispatchForm } from "@/pages/quality/forms/DispatchForm"
import { RapForm } from "@/pages/quality/forms/RapForm"
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
  type QualityDashboard,
  type QualityFilters,
  type QualityOptions,
  type ReportDetail,
  type ReportRow,
  emptyFilters,
  filtersToQuery,
} from "@/pages/quality/types"

const TABS = [
  { id: "raps", label: "RAPs" },
  { id: "unidades", label: "Unidades" },
  { id: "produtos", label: "Produtos" },
  { id: "coletas", label: "Produtos Coletados" },
  { id: "colaboradores", label: "Colaboradores" },
  { id: "qualidade", label: "Qualidade" },
  { id: "registros", label: "Registros" },
] as const

type TabId = (typeof TABS)[number]["id"]
type PrintTarget = { kind: "report" | "dispatch"; id: number }

/**
 * View do administrador da qualidade: os indicadores do Power BI lidos do MySQL,
 * mais o lançamento de RAP e de produto coletado. Uma única barra de filtros
 * recorta todas as seções.
 *
 * Devolve só o conteúdo do painel — a moldura e o cabeçalho vêm do AppShell.
 */
export function QualityPage({ csrfToken }: { csrfToken: string }) {
  const [filters, setFilters] = useState<QualityFilters>(emptyFilters)
  const [tab, setTab] = useState<TabId>("raps")
  const [options, setOptions] = useState<QualityOptions | null>(null)
  const [dashboard, setDashboard] = useState<QualityDashboard | null>(null)
  const [reports, setReports] = useState<Paginated<ReportRow> | null>(null)
  const [dispatches, setDispatches] = useState<Paginated<DispatchRow> | null>(null)
  const [reportsPage, setReportsPage] = useState(1)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [openForm, setOpenForm] = useState<"rap" | "dispatch" | null>(null)
  const [printTarget, setPrintTarget] = useState<PrintTarget | null>(null)
  const [printReport, setPrintReport] = useState<ReportDetail | null>(null)
  const [printDispatch, setPrintDispatch] = useState<DispatchDetail | null>(null)

  useEffect(() => {
    getJson<QualityOptions>("/backend/api/quality/options.php")
      .then(setOptions)
      .catch(() => setError("Não foi possível carregar as listas do setor de qualidade."))
  }, [])

  const load = useCallback(async () => {
    setIsFetching(true)
    setError("")
    const query = filtersToQuery(filters)
    const pageSeparator = query ? "&" : "?"

    try {
      const [dashboardData, reportsData, dispatchesData] = await Promise.all([
        getJson<QualityDashboard>(`/backend/api/quality/dashboard.php${query}`),
        getJson<Paginated<ReportRow>>(`/backend/api/quality/reports.php${query}${pageSeparator}page=${reportsPage}`),
        getJson<Paginated<DispatchRow>>(`/backend/api/quality/dispatches.php${query}`),
      ])
      setDashboard(dashboardData)
      setReports(reportsData)
      setDispatches(dispatchesData)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsFetching(false)
    }
  }, [filters, reportsPage])

  useEffect(() => { void load() }, [load])

  // Trocar o filtro volta a listagem para a primeira página.
  const changeFilters = (next: QualityFilters) => {
    setFilters(next)
    setReportsPage(1)
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

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(30px,2.4vw,43px)] font-medium leading-none">Qualidade</h1>
          <p className="mt-2 text-sm text-[#52514e]">
            Apontamentos, expedição e satisfação do cliente — administração do setor.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpenForm("dispatch")} disabled={!options}>
            <PackagePlus /> Nova coleta
          </Button>
          <Button type="button" className="rounded-full" onClick={() => setOpenForm("rap")} disabled={!options}>
            <ClipboardList /> Novo RAP
          </Button>
        </div>
      </div>

      {notice && (
        <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">
          {notice}
          <button type="button" className="ml-3 underline" onClick={() => setNotice("")}>fechar</button>
        </p>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mt-6">
        <FilterBar
          filters={filters}
          options={options}
          onChange={changeFilters}
          onReset={() => changeFilters(emptyFilters)}
        />
      </div>

      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Seções da qualidade">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-full px-4 py-2 text-sm transition-colors ${tab === item.id ? "bg-[#db0f0f] text-white" : "bg-white text-[#52514e] hover:bg-neutral-50"}`}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="relative mt-5 pb-2">
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

        {dashboard && (
          <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {tab === "raps" && <RapsSection data={dashboard} />}
            {tab === "unidades" && <UnitsSection data={dashboard} />}
            {tab === "produtos" && <ProductsSection data={dashboard} />}
            {tab === "coletas" && (
              <DispatchSection
                data={dashboard}
                dispatches={dispatches}
                onPrint={(id) => setPrintTarget({ kind: "dispatch", id })}
              />
            )}
            {tab === "colaboradores" && (
              <TeamSection
                data={dashboard}
                options={options}
                employeeId={filters.employeeId}
                onSelectEmployee={(employeeId) => changeFilters({ ...filters, employeeId })}
              />
            )}
            {tab === "qualidade" && <SatisfactionSection data={dashboard} />}
            {tab === "registros" && (
              <ReportsSection
                reports={reports}
                page={reportsPage}
                onPageChange={setReportsPage}
                onPrint={(id) => setPrintTarget({ kind: "report", id })}
              />
            )}
          </div>
        )}
      </div>

      {openForm === "rap" && options && (
        <RapForm
          csrfToken={csrfToken}
          options={options}
          onClose={() => setOpenForm(null)}
          onCreated={(code) => afterCreate(`Apontamento ${code} registrado.`)}
        />
      )}

      {openForm === "dispatch" && options && (
        <DispatchForm
          csrfToken={csrfToken}
          options={options}
          onClose={() => setOpenForm(null)}
          onCreated={(code) => afterCreate(`Coleta ${code} registrada.`)}
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
