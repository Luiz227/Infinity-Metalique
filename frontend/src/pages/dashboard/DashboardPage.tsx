import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import {
  CalendarDays,
  ChevronDown,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Scroller } from "@/components/ui/scroller"
import { getJson } from "@/lib/api"
import { HORIZONTAL_TABLE } from "@/lib/smoothScroll"
import { useQualityLiveRefresh } from "@/lib/useQualityLiveRefresh"
import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { TrendColumns } from "@/pages/quality/charts/QualityCharts"
import { formatDate } from "@/pages/quality/format"
import type {
  DispatchRow,
  Paginated,
  QualityDashboard,
  ReportRow,
} from "@/pages/quality/types"

type DateRange = { startDate: string; endDate: string }
type HistoryKind = "all" | "report" | "dispatch"
type SupervisorPresence = "online" | "away" | "offline"
type SectorSupervisor = { id: number; name: string; sector: string; jobTitle: string; presence: SupervisorPresence }
type SupervisorsResponse = { supervisors: SectorSupervisor[] }
type RevisionPayload = { revision: string }

const SUPERVISOR_PRESENCE: Record<SupervisorPresence, { className: string; label: string }> = {
  online: { className: "text-[#16803a]", label: "Online" },
  away: { className: "text-[#b7791f]", label: "Ausente" },
  offline: { className: "text-[#73716c]", label: "Offline" },
}

/**
 * O seletor já nasce como uma coleção para a inclusão futura de novos setores.
 * Por enquanto, somente a Qualidade possui uma visão implementada.
 */
const DASHBOARD_SECTORS = [
  { id: "quality", label: "Qualidade" },
] as const

const compactDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

function toInputDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function currentMonthRange(): DateRange {
  const today = new Date()
  return {
    startDate: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: toInputDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  }
}

function currentYearRange(): DateRange {
  const today = new Date()
  return {
    startDate: `${today.getFullYear()}-01-01`,
    endDate: `${today.getFullYear()}-12-31`,
  }
}

function displayInputDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return compactDateFormatter.format(new Date(year, month - 1, day)).replace(/\./g, "")
}

function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState("")

  const changeOpen = (open: boolean) => {
    setIsOpen(open)
    if (open) {
      setDraft(value)
      setError("")
    }
  }

  const apply = () => {
    if (!draft.startDate || !draft.endDate) {
      setError("Informe o início e o fim do período.")
      return
    }
    if (draft.startDate > draft.endDate) {
      setError("A data inicial deve ser anterior à data final.")
      return
    }

    onChange(draft)
    setIsOpen(false)
  }

  const applyShortcut = (range: DateRange) => {
    setDraft(range)
    setError("")
  }

  return (
    <Popover open={isOpen} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-full border border-hairline bg-white px-4 text-sm text-ink transition-colors hover:border-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/30"
          aria-label={`Filtrar período: ${displayInputDate(value.startDate)} até ${displayInputDate(value.endDate)}`}
        >
          <CalendarDays className="size-4 text-ink-soft" />
          <span className="whitespace-nowrap">
            {displayInputDate(value.startDate)} – {displayInputDate(value.endDate)}
          </span>
          <ChevronDown className={`size-4 text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,370px)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Período do dashboard</p>
            <p className="mt-1 text-xs text-[#73716c]">O intervalo atualiza todos os dados abaixo.</p>
          </div>
          <CalendarDays className="mt-0.5 size-5 text-metalique" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs font-medium text-ink-soft">
            Data inicial
            <input
              type="date"
              className="h-10 min-w-0 rounded-lg border border-hairline px-3 text-sm text-ink outline-none focus:border-metalique/40 focus:ring-2 focus:ring-metalique/20"
              value={draft.startDate}
              max={draft.endDate || undefined}
              onChange={(event) => {
                setDraft((current) => ({ ...current, startDate: event.target.value }))
                setError("")
              }}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-ink-soft">
            Data final
            <input
              type="date"
              className="h-10 min-w-0 rounded-lg border border-hairline px-3 text-sm text-ink outline-none focus:border-metalique/40 focus:ring-2 focus:ring-metalique/20"
              value={draft.endDate}
              min={draft.startDate || undefined}
              onChange={(event) => {
                setDraft((current) => ({ ...current, endDate: event.target.value }))
                setError("")
              }}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full bg-[#f2f2f2] px-3 py-1.5 text-xs text-ink-soft hover:bg-[#e8e8e8]"
            onClick={() => applyShortcut(currentMonthRange())}
          >
            Este mês
          </button>
          <button
            type="button"
            className="rounded-full bg-[#f2f2f2] px-3 py-1.5 text-xs text-ink-soft hover:bg-[#e8e8e8]"
            onClick={() => applyShortcut(currentYearRange())}
          >
            Este ano
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-[#b70d0d]" role="alert">{error}</p>}

        <div className="mt-4 flex justify-end gap-2 border-t border-[#efeee9] pt-3">
          <button
            type="button"
            className="rounded-full px-4 py-2 text-sm text-ink-soft hover:bg-neutral-100"
            onClick={() => setIsOpen(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-full bg-metalique px-4 py-2 text-sm font-semibold text-white hover:bg-metalique-strong"
            onClick={apply}
          >
            Aplicar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function EmptyRows({ message, columns }: { message: string; columns: number }) {
  return (
    <tr>
      <td className="py-8 text-center text-sm text-ink-muted" colSpan={columns}>{message}</td>
    </tr>
  )
}

function kindButtonClass(active: boolean): string {
  return `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
    active ? "bg-metalique text-white" : "bg-[#f2f2f2] text-ink-soft hover:bg-[#e7e7e7]"
  }`
}

function normalizeSector(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
}

export function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>(currentYearRange)
  const [sector, setSector] = useState<(typeof DASHBOARD_SECTORS)[number]["id"]>("quality")
  const [supervisors, setSupervisors] = useState<SectorSupervisor[]>([])
  const [dashboard, setDashboard] = useState<QualityDashboard | null>(null)
  const [reports, setReports] = useState<Paginated<ReportRow> | null>(null)
  const [dispatches, setDispatches] = useState<Paginated<DispatchRow> | null>(null)
  const [historyKind, setHistoryKind] = useState<HistoryKind>("all")
  const [historyLimit, setHistoryLimit] = useState(10)
  const [reloadEpoch, setReloadEpoch] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const dataControllerRef = useRef<AbortController | null>(null)
  const appliedRevisionRef = useRef<string | null>(null)
  const liveRefreshPendingRef = useRef(false)

  useEffect(() => {
    dataControllerRef.current?.abort()
    const controller = new AbortController()
    dataControllerRef.current = controller
    liveRefreshPendingRef.current = false
    const query = new URLSearchParams({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    }).toString()
    const requestInit: RequestInit = { signal: controller.signal, cache: "no-store" }

    setIsLoading(true)
    setError("")

    getJson<RevisionPayload>("/backend/api/dashboard/quality-revision.php", requestInit)
      .then((baseline) => Promise.all([
        getJson<SupervisorsResponse>("/backend/api/dashboard/supervisors.php", requestInit),
        getJson<QualityDashboard>(`/backend/api/dashboard/quality.php?${query}`, requestInit),
        getJson<Paginated<ReportRow>>(`/backend/api/dashboard/quality-reports.php?${query}&perPage=50`, requestInit),
        getJson<Paginated<DispatchRow>>(`/backend/api/dashboard/quality-dispatches.php?${query}&perPage=50`, requestInit),
      ]).then((data) => ({ baseline, data })))
      .then(({ baseline, data: [supervisorData, dashboardData, reportData, dispatchData] }) => {
        if (controller.signal.aborted || dataControllerRef.current !== controller) return
        setSupervisors(supervisorData.supervisors)
        setDashboard(dashboardData)
        setReports(reportData)
        setDispatches(dispatchData)
        appliedRevisionRef.current = baseline.revision
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return
        setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar o dashboard.")
      })
      .finally(() => {
        if (dataControllerRef.current === controller) {
          dataControllerRef.current = null
          setIsLoading(false)
        }
      })

    return () => {
      controller.abort()
      if (dataControllerRef.current === controller) dataControllerRef.current = null
    }
  }, [dateRange.endDate, dateRange.startDate, reloadEpoch, sector])

  useEffect(() => {
    setHistoryLimit(10)
  }, [dateRange.endDate, dateRange.startDate, sector])

  useQualityLiveRefresh({
    endpoint: "/backend/api/dashboard/quality-revision.php",
    appliedRevisionRef,
    onRefresh: () => {
      if (dataControllerRef.current !== null || liveRefreshPendingRef.current) return
      liveRefreshPendingRef.current = true
      setReloadEpoch((current) => current + 1)
    },
  })

  useEffect(() => {
    let controller: AbortController | null = null

    const refreshSupervisorPresence = () => {
      controller?.abort()
      controller = new AbortController()

      void getJson<SupervisorsResponse>("/backend/api/dashboard/supervisors.php", {
        signal: controller.signal,
      })
        .then((payload) => setSupervisors(payload.supervisors))
        .catch(() => undefined)
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshSupervisorPresence()
    }, 30_000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSupervisorPresence()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      controller?.abort()
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  const historyItems = useMemo(() => {
    const reportItems = (reports?.items ?? []).map((record) => ({
      id: `report-${record.id}`,
      kind: "report" as const,
      code: record.code,
      date: record.report_date,
      subject: record.client ?? "Cliente não informado",
      detail: [record.machine_type, record.model, record.problem_type].filter(Boolean).join(" · ") || "Sem detalhes",
    }))
    const dispatchItems = (dispatches?.items ?? []).map((record) => ({
      id: `dispatch-${record.id}`,
      kind: "dispatch" as const,
      code: record.code,
      date: record.dispatch_date,
      subject: record.client ?? "Cliente não informado",
      detail: [record.machine_type, record.model].filter(Boolean).join(" · ") || "Sem detalhes",
    }))

    return [...reportItems, ...dispatchItems]
      .filter((item) => historyKind === "all" || item.kind === historyKind)
      .sort((left, right) => right.date.localeCompare(left.date) || right.code.localeCompare(left.code))
  }, [dispatches, historyKind, reports])

  const selectedSectorLabel = DASHBOARD_SECTORS.find((item) => item.id === sector)?.label ?? "Qualidade"
  const selectedSupervisors = supervisors
    .filter((supervisor) => normalizeSector(supervisor.sector) === normalizeSector(selectedSectorLabel))
    .filter((supervisor, index, matches) => (
      matches.findIndex((match) => match.name === supervisor.name) === index
    ))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[clamp(30px,2.4vw,43px)] font-medium leading-none">Dashboard</h1>
          <p className="mt-2 text-sm text-[#73716c]">Visão geral dos setores da Metalique Infinity.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <Select value={sector} onValueChange={(value) => setSector(value as typeof sector)}>
            <SelectTrigger className="h-10 w-auto min-w-32 rounded-full px-4" aria-label="Filtrar setor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {DASHBOARD_SECTORS.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{selectedSectorLabel}</h2>
          </div>
          <p className="mt-1 text-sm text-[#73716c]">
            Supervisor:{" "}
            {selectedSupervisors.length === 0 ? "Não cadastrado" : selectedSupervisors.map((supervisor, index) => {
              const presence = SUPERVISOR_PRESENCE[supervisor.presence]

              return (
                <Fragment key={supervisor.id}>
                  {index > 0 && ", "}
                  <span
                    className={presence.className}
                    title={presence.label}
                    aria-label={`${supervisor.name}, ${presence.label}`}
                  >
                    {supervisor.name}
                  </span>
                </Fragment>
              )
            })}
          </p>
        </div>
        {isLoading && dashboard && (
          <span className="inline-flex items-center gap-2 text-xs text-[#73716c]" aria-live="polite">
            <LoaderCircle className="size-3.5 animate-spin" /> Atualizando dados
          </span>
        )}
      </div>

      {error && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-metalique/15 bg-[#fff5f5] px-4 py-3 text-sm text-[#9f1010]" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-[#fffafa]"
            onClick={() => setReloadEpoch((epoch) => epoch + 1)}
          >
            <RefreshCw className="size-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      {!dashboard && isLoading ? (
        <div className="grid min-h-72 flex-1 place-items-center text-[#73716c]">
          <span className="grid justify-items-center gap-3 text-sm">
            <LoaderCircle className="size-7 animate-spin text-metalique" />
            Carregando dados da Qualidade...
          </span>
        </div>
      ) : dashboard ? (
        <div className={`mt-5 grid gap-4 transition-opacity ${isLoading ? "opacity-65" : ""}`}>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <ChartCard
              title="RAPs por mês"
              description="Apontamentos registrados mês a mês no período selecionado."
              table={{ head: ["Mês", "RAPs"], rows: dashboard.reportsByPeriod.map((row) => [row.label, row.value]) }}
            >
              <TrendColumns animationKey="dashboard:reports-period" data={dashboard.reportsByPeriod} measure="RAPs" />
            </ChartCard>

            <ChartCard
              title="Coletas por mês"
              description="Produtos coletados mês a mês no período selecionado."
              table={{ head: ["Mês", "Coletas"], rows: dashboard.dispatchesByPeriod.map((row) => [row.label, row.value]) }}
            >
              <TrendColumns animationKey="dashboard:dispatches-period" data={dashboard.dispatchesByPeriod} measure="coletas" />
            </ChartCard>
          </div>

          <section className="rounded-card border border-hairline bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Histórico de RAPs e coletas</h2>
                <p className="mt-1 text-xs text-[#73716c]">Linha do tempo consolidada, sem ações de edição.</p>
              </div>
              <div className="flex items-center gap-2" aria-label="Filtrar histórico por tipo">
                <button type="button" className={kindButtonClass(historyKind === "all")} onClick={() => { setHistoryKind("all"); setHistoryLimit(10) }}>Todos</button>
                <button type="button" className={kindButtonClass(historyKind === "report")} onClick={() => { setHistoryKind("report"); setHistoryLimit(10) }}>RAPs</button>
                <button type="button" className={kindButtonClass(historyKind === "dispatch")} onClick={() => { setHistoryKind("dispatch"); setHistoryLimit(10) }}>Coletas</button>
              </div>
            </div>

            <Scroller className="mt-5 overflow-x-auto" options={HORIZONTAL_TABLE}>
              <table className="w-full min-w-[650px] border-collapse text-left text-sm">
                <thead>
                  <tr className="text-xs text-[#73716c]">
                    {['Tipo', 'Nº', 'Data', 'Cliente / lote', 'Detalhes'].map((head) => (
                      <th key={head} className="border-b border-[#e8e7e2] pb-2 pr-4 font-medium">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyItems.length === 0 && <EmptyRows columns={5} message="Nenhum registro encontrado neste período." />}
                  {historyItems.slice(0, historyLimit).map((item) => (
                    <tr key={item.id} className="border-b border-[#f1f0ec] last:border-0">
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[13px] font-semibold ${
                          item.kind === "report" ? "bg-metalique/8 text-[#b80d0d]" : "bg-[#0b0b0b]/7 text-[#343434]"
                        }`}>
                          {item.kind === "report" ? "RAP" : "Coleta"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-semibold">{item.code}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-ink-soft">{formatDate(item.date)}</td>
                      <td className="max-w-52 truncate py-3 pr-4" title={item.subject}>{item.subject}</td>
                      <td className="max-w-96 truncate py-3 text-ink-soft" title={item.detail}>{item.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroller>

            {historyItems.length > historyLimit && (
              <div className="mt-4 flex justify-center border-t border-[#f1f0ec] pt-4">
                <button
                  type="button"
                  className="rounded-full border border-hairline px-4 py-2 text-xs font-medium text-ink-soft hover:bg-neutral-50"
                  onClick={() => setHistoryLimit((limit) => limit + 10)}
                >
                  Mostrar mais registros
                </button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  )
}
