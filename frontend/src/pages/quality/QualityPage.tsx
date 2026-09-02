import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ClipboardCheck, ClipboardList, Download, FileUp, LoaderCircle, MessageSquarePlus, PackagePlus, Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getJson, postJson } from "@/lib/api"
import { QUALITY_NAVIGATION } from "@/lib/navigation"
import { currentPreferences } from "@/lib/preferences"
import { useQualityLiveRefresh } from "@/lib/useQualityLiveRefresh"
import { ActionPlanDialog } from "@/pages/quality/ActionPlanDialog"
import { SeriesColorProvider } from "@/pages/quality/charts/SeriesColor"
import { SECTION_SERIES, SERIES } from "@/pages/quality/charts/tokens"
import { activeFilters, FilterBar } from "@/pages/quality/FilterBar"
import { ActionPlanForm } from "@/pages/quality/forms/ActionPlanForm"
import { ComplaintForm } from "@/pages/quality/forms/ComplaintForm"
import { DispatchForm } from "@/pages/quality/forms/DispatchForm"
import { RapForm } from "@/pages/quality/forms/RapForm"
import { QualityImportDialog } from "@/pages/quality/QualityImportDialog"
import { QualityPrintProvider } from "@/pages/quality/print/PrintContext"
import { PrintSheet } from "@/pages/quality/print/PrintSheet"
import { ActionPlansSection } from "@/pages/quality/sections/ActionPlansSection"
import { DispatchSection } from "@/pages/quality/sections/DispatchSection"
import { ProductsSection } from "@/pages/quality/sections/ProductsSection"
import { RapsSection } from "@/pages/quality/sections/RapsSection"
import { ReportsSection } from "@/pages/quality/sections/ReportsSection"
import { SatisfactionSection } from "@/pages/quality/sections/SatisfactionSection"
import { TeamSection } from "@/pages/quality/sections/TeamSection"
import { UnitsSection } from "@/pages/quality/sections/UnitsSection"
import {
  type ActionPlanDetail,
  type ActionPlans,
  type ComplaintDetail,
  type ComplaintRow,
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

/*
 * A aba de planos usa a permissão de quem lança a reclamação: o plano é a
 * tratativa dela, e quem registra é quem trata. Sem chave nova de permissão.
 *
 * A lista mora em lib/navigation.ts porque o cabeçalho, a busca e as
 * configurações precisam exatamente dela - e uma cópia por tela sai de
 * sincronia na primeira aba nova.
 */
const TABS = QUALITY_NAVIGATION

/**
 * "Últimas coletas", na aba Produtos Coletados, é uma lista fixa das mais
 * recentes - ela não acompanha o seletor de linhas da aba Registros. É por
 * casarem neste valor que as duas podem compartilhar uma requisição só.
 */
const LATEST_DISPATCHES = 25

type TabId = (typeof TABS)[number]["id"]
type PrintTarget = { kind: "report" | "dispatch" | "complaint" | "plan"; id: number }
type ExportDataset = "reports" | "dispatches" | "complaints" | "plans" | "catalogs"
type EditTarget =
  | { kind: "report"; record: ReportDetail }
  | { kind: "dispatch"; record: DispatchDetail }
  | { kind: "complaint"; record: ComplaintDetail }
type RevisionPayload = { revision: string }

/**
 * View do administrador da qualidade: os indicadores do Power BI lidos do MySQL,
 * mais o lançamento de RAP e de produto coletado. Uma única barra de filtros
 * recorta todas as seções.
 *
 * Devolve só o conteúdo do painel - a moldura e o cabeçalho vêm do AppShell.
 */
export function QualityPage({ csrfToken, canCreateRap, canCreateDispatch, canCreateComplaint, canImport, canDelete, canEdit, permissions, tabsInHeader }: {
  csrfToken: string
  canCreateRap: boolean
  canCreateDispatch: boolean
  canCreateComplaint: boolean
  canImport: boolean
  canDelete: boolean
  canEdit: boolean
  permissions: PermissionKey[]
  tabsInHeader: boolean
}) {
  const [filters, setFilters] = useState<QualityFilters>(emptyFilters)
  // A aba inicial é a preferida da conta; o efeito abaixo corrige se ela não
  // estiver entre as visíveis.
  const [tab, setTab] = useState<TabId>(() => currentPreferences().qualityTab as TabId)
  const [options, setOptions] = useState<QualityOptions | null>(null)
  const [dashboard, setDashboard] = useState<QualityDashboard | null>(null)
  const [highlightDashboard, setHighlightDashboard] = useState<QualityDashboard | null>(null)
  const [chartSelection, setChartSelection] = useState<QualityChartSelection | null>(null)
  const [chartEpoch, setChartEpoch] = useState(0)
  const [dataEpoch, setDataEpoch] = useState(0)
  const [isHighlightLoading, setIsHighlightLoading] = useState(false)
  const [reports, setReports] = useState<Paginated<ReportRow> | null>(null)
  const [dispatches, setDispatches] = useState<Paginated<DispatchRow> | null>(null)
  const [recordDispatches, setRecordDispatches] = useState<Paginated<DispatchRow> | null>(null)
  const [recordComplaints, setRecordComplaints] = useState<Paginated<ComplaintRow> | null>(null)
  const [actionPlans, setActionPlans] = useState<ActionPlans | null>(null)
  const [reportsPage, setReportsPage] = useState(1)
  const [dispatchesPage, setDispatchesPage] = useState(1)
  const [complaintsPage, setComplaintsPage] = useState(1)
  const [plansPage, setPlansPage] = useState(1)
  const [perPage, setPerPage] = useState(LATEST_DISPATCHES)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [openForm, setOpenForm] = useState<"rap" | "dispatch" | "complaint" | "plan" | null>(null)
  // A reclamação que o atalho da tabela já traz escolhida para o plano novo.
  const [planTarget, setPlanTarget] = useState<ComplaintRow | null>(null)
  const [openPlanId, setOpenPlanId] = useState<number | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportDatasets, setExportDatasets] = useState<ExportDataset[]>(["reports", "dispatches", "complaints", "plans", "catalogs"])
  const [printTarget, setPrintTarget] = useState<PrintTarget | null>(null)
  const [printReport, setPrintReport] = useState<ReportDetail | null>(null)
  const [printDispatch, setPrintDispatch] = useState<DispatchDetail | null>(null)
  const [printComplaint, setPrintComplaint] = useState<ComplaintDetail | null>(null)
  const [printPlan, setPrintPlan] = useState<ActionPlanDetail | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const loadController = useRef<AbortController | null>(null)
  const appliedRevisionRef = useRef<string | null>(null)
  const visibleTabs = TABS.filter((item) => permissions.includes(item.permission))
  const hasVisibleTab = visibleTabs.some((item) => item.id === tab)
  const isActionOnly = visibleTabs.length === 0 && (canCreateRap || canCreateDispatch)
  const showComplaintButton = canCreateComplaint && tab === "qualidade" && hasVisibleTab
  const showPlanButton = canCreateComplaint && tab === "planos" && hasVisibleTab
  const exportOptions = useMemo(() => {
    const canExportReports = permissions.some((permission) => ["quality.raps", "quality.units", "quality.products", "quality.employees", "quality.records"].includes(permission))
    const canExportDispatches = permissions.some((permission) => ["quality.dispatches", "quality.products", "quality.employees", "quality.records"].includes(permission))
    const canExportComplaints = permissions.some((permission) => ["quality.satisfaction", "quality.records"].includes(permission))
    return [
      { id: "reports", label: "RAPs", description: "Apontamentos, códigos, problemas e colaboradores.", enabled: canExportReports },
      { id: "dispatches", label: "Produtos coletados", description: "Coletas, expedições, fotos e responsáveis.", enabled: canExportDispatches },
      { id: "complaints", label: "Satisfação", description: "Reclamações de clientes e tratativas registradas.", enabled: canExportComplaints },
      { id: "plans", label: "Planos de ação", description: "Aberturas, prazos, responsáveis e andamentos.", enabled: canCreateComplaint },
      { id: "catalogs", label: "Cadastros", description: "Clientes, colaboradores, produtos, gates e códigos.", enabled: canImport || canDelete },
    ] satisfies { id: ExportDataset; label: string; description: string; enabled: boolean }[]
  }, [canCreateComplaint, canDelete, canImport, permissions])
  const enabledExportOptions = exportOptions.filter((item) => item.enabled)

  // De onde o gráfico veio e sob qual recorte ele está: é o que a folha
  // impressa escreve no cabeçalho, e nada disso o cartão sabe sozinho.
  const printContext = useMemo(() => ({
    section: TABS.find((item) => item.id === tab)?.label ?? null,
    context: [
      ...activeFilters(filters, options).map((filter) => filter.label),
      ...(chartSelection ? [`Recorte: ${chartSelection.label}`] : []),
    ],
  }), [chartSelection, filters, options, tab])

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
    const requestInit: RequestInit = { signal: controller.signal, cache: "no-store" }
    const listUrl = (endpoint: string, page: number, rows: number) =>
      `/backend/api/quality/${endpoint}.php${query}${pageSeparator}page=${page}&perPage=${rows}`

    try {
      const baseline = await getJson<RevisionPayload>(
        "/backend/api/quality/revision.php",
        requestInit,
      )
      const latestDispatchesRequest = getJson<Paginated<DispatchRow>>(
        listUrl("dispatches", 1, LATEST_DISPATCHES),
        requestInit,
      )
      // A aba Registros só reaproveita a busca das "Últimas coletas" quando
      // pede exatamente a mesma fatia.
      const recordDispatchesRequest = dispatchesPage === 1 && perPage === LATEST_DISPATCHES
        ? latestDispatchesRequest
        : getJson<Paginated<DispatchRow>>(
            listUrl("dispatches", dispatchesPage, perPage),
            requestInit,
          )

      const [
        dashboardData,
        reportsData,
        dispatchesData,
        recordDispatchesData,
        recordComplaintsData,
        actionPlansData,
      ] = await Promise.all([
        getJson<QualityDashboard>(`/backend/api/quality/dashboard.php${query}`, requestInit),
        getJson<Paginated<ReportRow>>(listUrl("reports", reportsPage, perPage), requestInit),
        latestDispatchesRequest,
        recordDispatchesRequest,
        getJson<Paginated<ComplaintRow>>(listUrl("complaints", complaintsPage, perPage), requestInit),
        getJson<ActionPlans>(listUrl("action-plans", plansPage, perPage), requestInit),
      ])

      if (controller.signal.aborted || loadController.current !== controller) return

      setDashboard(dashboardData)
      setReports(reportsData)
      setDispatches(dispatchesData)
      setRecordDispatches(recordDispatchesData)
      setRecordComplaints(recordComplaintsData)
      setActionPlans(actionPlansData)
      appliedRevisionRef.current = baseline.revision
      setDataEpoch((current) => current + 1)
    } catch (requestError) {
      if (controller.signal.aborted) return
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      if (loadController.current === controller) {
        loadController.current = null
        setIsFetching(false)
      }
    }
  }, [complaintsPage, dispatchesPage, filters, perPage, plansPage, reportsPage])

  useEffect(() => {
    void load()
    return () => {
      loadController.current?.abort()
      loadController.current = null
    }
  }, [load])

  const refreshLiveData = useCallback(() => {
    if (loadController.current !== null) return

    void load()
    void getJson<QualityOptions>("/backend/api/quality/options.php", { cache: "no-store" })
      .then(setOptions)
      .catch(() => undefined)
  }, [load])

  useQualityLiveRefresh({
    endpoint: "/backend/api/quality/revision.php",
    enabled: visibleTabs.length > 0,
    appliedRevisionRef,
    onRefresh: refreshLiveData,
  })

  // O painel de catálogos mora na central de configurações, do lado de fora
  // desta tela. Mexer nele muda o que os filtros e os formulários oferecem, e o
  // poller de revisão só chegaria aqui alguns segundos depois.
  useEffect(() => {
    const applySavedSettings = (event: Event) => {
      setNotice((event as CustomEvent<string>).detail || "Configurações da Qualidade salvas.")
      refreshLiveData()
    }
    window.addEventListener("metalique:quality-settings-saved", applySavedSettings)
    return () => window.removeEventListener("metalique:quality-settings-saved", applySavedSettings)
  }, [refreshLiveData])

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
      { signal: controller.signal, cache: "no-store" },
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
  }, [chartSelection, dataEpoch, filters])

  // Trocar o filtro volta a listagem para a primeira página.
  const changeFilters = (next: QualityFilters) => {
    setFilters(next)
    setChartSelection(null)
    setHighlightDashboard(null)
    setReportsPage(1)
    setDispatchesPage(1)
    setComplaintsPage(1)
    setPlansPage(1)
  }

  // Trocar o tamanho da página redesenha as fatias: a página 6 de 25 em 25 nem
  // existe de 100 em 100. Todas voltam para a primeira.
  const changePerPage = (rows: number) => {
    setPerPage(rows)
    setReportsPage(1)
    setDispatchesPage(1)
    setComplaintsPage(1)
    setPlansPage(1)
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
    const controller = new AbortController()

    setPrintReport(null)
    setPrintDispatch(null)
    setPrintComplaint(null)
    setPrintPlan(null)

    const endpoints = {
      report: "report", dispatch: "dispatch", complaint: "complaint", plan: "action-plan",
    } as const
    const url = `/backend/api/quality/${endpoints[printTarget.kind]}.php?id=${printTarget.id}`

    getJson<{
      report?: ReportDetail
      dispatch?: DispatchDetail
      complaint?: ComplaintDetail
      plan?: ActionPlanDetail
    }>(url, { signal: controller.signal, cache: "no-store" })
      .then((payload) => {
        if (controller.signal.aborted) return
        if (payload.report) setPrintReport(payload.report)
        if (payload.dispatch) setPrintDispatch(payload.dispatch)
        if (payload.complaint) setPrintComplaint(payload.complaint)
        if (payload.plan) setPrintPlan(payload.plan)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setPrintTarget(null)
        setError("Não foi possível carregar o documento para impressão.")
      })

    return () => controller.abort()
  }, [printTarget])

  const afterCreate = (message: string) => {
    setOpenForm(null)
    setPlanTarget(null)
    setNotice(message)
    void load()
  }

  const closePrint = () => {
    setPrintTarget(null)
    setPrintReport(null)
    setPrintDispatch(null)
    setPrintComplaint(null)
    setPrintPlan(null)
  }

  const beginEdit = () => {
    if (!canEdit) return

    const target: EditTarget | null = printTarget?.kind === "report" && printReport?.id === printTarget.id
      ? { kind: "report", record: printReport }
      : printTarget?.kind === "dispatch" && printDispatch?.id === printTarget.id
        ? { kind: "dispatch", record: printDispatch }
        : printTarget?.kind === "complaint" && printComplaint?.id === printTarget.id
          ? { kind: "complaint", record: printComplaint }
          : null

    if (!target) return
    closePrint()
    setEditTarget(target)
  }

  const cancelEdit = (target: EditTarget) => {
    setEditTarget(null)
    setPrintTarget({ kind: target.kind, id: target.record.id })
  }

  const afterEdit = (target: EditTarget, code: string, message?: string) => {
    const { kind } = target
    const { id } = target.record
    setEditTarget(null)
    setNotice(message || `${code} atualizado com sucesso.`)
    void load().then(() => setPrintTarget({ kind, id }))
  }

  /**
   * O atalho da coluna "Plano de ação": com plano, abre o plano; sem plano, abre
   * o formulário com a reclamação já escolhida.
   */
  const openPlanFor = (complaint: ComplaintRow) => {
    setError("")
    setNotice("")
    if (complaint.plan_id) {
      setOpenPlanId(complaint.plan_id)
      return
    }
    setPlanTarget(complaint)
    setOpenForm("plan")
  }

  const toggleExportDataset = (dataset: ExportDataset) => {
    setExportDatasets((current) => current.includes(dataset)
      ? current.filter((item) => item !== dataset)
      : [...current, dataset])
  }

  const exportQualityData = async () => {
    const selected = exportDatasets.filter((dataset) => enabledExportOptions.some((option) => option.id === dataset))
    if (selected.length === 0) {
      setError("Selecione pelo menos um tipo de dado para exportar.")
      return
    }

    setIsExporting(true)
    setError("")
    try {
      const query = new URLSearchParams(filtersToQuery(filters).replace(/^\?/, ""))
      query.set("datasets", selected.join(","))
      const response = await fetch(`/backend/api/quality/export.php?${query.toString()}`, {
        credentials: "include",
        cache: "no-store",
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { message?: string }
        throw new Error(payload.message || "Não foi possível exportar os dados.")
      }

      const blob = await response.blob()
      const disposition = response.headers.get("content-disposition") || ""
      const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || "qualidade.xlsx"
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice("Planilha exportada com sucesso.")
      setIsExportOpen(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsExporting(false)
    }
  }

  const deleteRecord = async (kind: PrintTarget["kind"], id: number) => {
    setError("")
    setNotice("")

    try {
      const endpoints = {
        report: "report-delete",
        dispatch: "dispatch-delete",
        complaint: "complaint-delete",
        plan: "action-plan-delete",
      } as const
      const payload = await postJson<{ message: string }>(
        `/backend/api/quality/${endpoints[kind]}.php`,
        { id, csrfToken },
      )
      if (kind === "plan") setOpenPlanId(null)

      // Excluir o registro que sobrava na última página deixaria a listagem
      // vazia; nesse caso a aba Registros volta uma página em vez de recarregar.
      const pages = {
        report: [reportsPage, reports, setReportsPage],
        dispatch: [dispatchesPage, recordDispatches, setDispatchesPage],
        complaint: [complaintsPage, recordComplaints, setComplaintsPage],
        plan: [plansPage, actionPlans, setPlansPage],
      } as const
      const [currentPage, records, setPage] = pages[kind]

      if (currentPage > 1 && records?.items.length === 1) {
        setPage((current) => Math.max(1, current - 1))
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
          {/* A engrenagem se ajusta ao título e só aparece no hover dele: é
              ajuste de configuração, não uma ação do dia a dia, e não deve
              disputar atenção com os botões de lançamento. Ela reserva o próprio
              espaço mesmo apagada, então o título não salta quando ela surge. */}
          <div className="group/heading flex items-center gap-1">
            <h1 className="text-[clamp(30px,2.4vw,43px)] font-medium leading-none">Qualidade</h1>
            {canDelete && (
              <button
                type="button"
                aria-label="Configurações da qualidade"
                aria-haspopup="dialog"
                title="Configurações da qualidade"
                className="grid size-8 place-items-center rounded-full text-ink-muted opacity-0 transition-[opacity,color] duration-300 ease-out hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/25 group-hover/heading:opacity-100"
                onClick={() => window.dispatchEvent(new CustomEvent("metalique:open-settings", { detail: "qualidade" }))}
              >
                <Settings className="size-[18px]" />
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            Apontamentos, expedição e satisfação do cliente - administração do setor.
          </p>
        </div>

        {(visibleTabs.length > 0 || canImport) && (canCreateRap || canCreateDispatch || canImport || showComplaintButton || showPlanButton || enabledExportOptions.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {enabledExportOptions.length > 0 && (
              <Button type="button" variant="outline" className="rounded-full" onClick={() => {
                setExportDatasets(enabledExportOptions.map((item) => item.id))
                setIsExportOpen(true)
              }}>
                <Download /> Exportar dados
              </Button>
            )}
            {canImport && (
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setIsImportOpen(true)}>
                <FileUp /> Importar planilha
              </Button>
            )}
            {/* A reclamação só existe na aba Qualidade, então o botão acompanha
                a aba em vez de ficar pendurado no topo das outras seis. */}
            {showComplaintButton && (
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpenForm("complaint")} disabled={!options}>
                <MessageSquarePlus /> Registrar satisfação
              </Button>
            )}
            {/* Mesma regra do botão acima: a abertura do plano acompanha a aba
                onde ele é tratado, em vez de ficar pendurada nas outras sete. */}
            {showPlanButton && (
              <Button
                type="button"
                className="rounded-full"
                onClick={() => { setPlanTarget(null); setOpenForm("plan") }}
                disabled={!options}
              >
                <ClipboardCheck /> Abrir plano de ação
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
              className={`rounded-full px-4 py-2 text-sm transition-colors ${tab === item.id ? "bg-metalique text-white" : "border border-hairline bg-surface text-ink-soft hover:bg-neutral-50"}`}
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

      {visibleTabs.length > 0 && <div className="mt-3 pb-2">
        {!dashboard && isFetching && (
          <div className="grid h-64 place-items-center text-ink-muted">
            <LoaderCircle className="size-7 animate-spin" aria-label="Carregando indicadores" />
          </div>
        )}

        {/* O recorte só troca quando os números chegam; esmaecer o painel nesse
            intervalo é o retorno imediato do clique. */}
        {dashboard && hasVisibleTab && (
          <div key={chartEpoch} className={`transition-opacity ${isFetching ? "opacity-60" : isHighlightLoading ? "opacity-80" : ""}`}>
            {/* Cada aba pinta as séries de magnitude com a própria cor. */}
            <SeriesColorProvider color={SECTION_SERIES[tab] ?? SERIES}>
              <QualityPrintProvider value={printContext}>
                {tab === "raps" && (
                  <RapsSection
                    data={dashboard}
                    highlight={highlightDashboard}
                    selection={chartSelection}
                    options={options}
                    target={options?.targets.rapsPerMonth ?? null}
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
                    target={options?.targets.rapsPerMonth ?? null}
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
                    canDelete={canDelete}
                    onPrint={(id) => setPrintTarget({ kind: "complaint", id })}
                    onOpenPlan={canCreateComplaint ? openPlanFor : null}
                    onDelete={deleteRecord}
                    onSelectPeriod={selectPeriod}
                  />
                )}
                {tab === "planos" && (
                  <ActionPlansSection
                    plans={actionPlans}
                    page={plansPage}
                    perPage={perPage}
                    canDelete={canDelete}
                    onPageChange={setPlansPage}
                    onPerPageChange={changePerPage}
                    onOpen={setOpenPlanId}
                    onDelete={deleteRecord}
                  />
                )}
                {tab === "registros" && (
                  <ReportsSection
                    reports={reports}
                    dispatches={recordDispatches}
                    complaints={recordComplaints}
                    reportsPage={reportsPage}
                    dispatchesPage={dispatchesPage}
                    complaintsPage={complaintsPage}
                    perPage={perPage}
                    canDelete={canDelete}
                    permissions={permissions}
                    onReportsPageChange={setReportsPage}
                    onDispatchesPageChange={setDispatchesPage}
                    onComplaintsPageChange={setComplaintsPage}
                    onPerPageChange={changePerPage}
                    onPrint={(id) => setPrintTarget({ kind: "report", id })}
                    onPrintDispatch={(id) => setPrintTarget({ kind: "dispatch", id })}
                    onPrintComplaint={(id) => setPrintTarget({ kind: "complaint", id })}
                    onOpenPlan={canCreateComplaint ? openPlanFor : null}
                    onDelete={deleteRecord}
                  />
                )}
              </QualityPrintProvider>
            </SeriesColorProvider>
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

      {canCreateComplaint && openForm === "complaint" && options && (
        <ComplaintForm
          csrfToken={csrfToken}
          options={options}
          onClose={() => setOpenForm(null)}
          onCreated={(code) => afterCreate(`Registro de satisfação ${code} gravado.`)}
        />
      )}

      {canEdit && editTarget?.kind === "report" && options && (
        <RapForm
          csrfToken={csrfToken}
          options={options}
          initial={editTarget.record}
          onClose={() => cancelEdit(editTarget)}
          onCreated={(code, message) => afterEdit(editTarget, code, message)}
        />
      )}

      {canEdit && editTarget?.kind === "dispatch" && options && (
        <DispatchForm
          csrfToken={csrfToken}
          options={options}
          initial={editTarget.record}
          onClose={() => cancelEdit(editTarget)}
          onCreated={(code, message) => afterEdit(editTarget, code, message)}
        />
      )}

      {canEdit && editTarget?.kind === "complaint" && options && (
        <ComplaintForm
          csrfToken={csrfToken}
          options={options}
          initial={editTarget.record}
          onClose={() => cancelEdit(editTarget)}
          onCreated={(code, message) => afterEdit(editTarget, code, message)}
        />
      )}

      {canCreateComplaint && openForm === "plan" && options && (
        <ActionPlanForm
          csrfToken={csrfToken}
          options={options}
          complaint={planTarget}
          onClose={() => { setOpenForm(null); setPlanTarget(null) }}
          onCreated={(code) => afterCreate(`Plano de ação ${code} aberto.`)}
        />
      )}

      {openPlanId !== null && (
        <ActionPlanDialog
          planId={openPlanId}
          csrfToken={csrfToken}
          canWrite={canCreateComplaint}
          onClose={() => setOpenPlanId(null)}
          onChanged={(message) => { setNotice(message); void load() }}
          onPrint={(id) => setPrintTarget({ kind: "plan", id })}
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

      <Dialog open={isExportOpen} onOpenChange={(open) => { if (!isExporting) setIsExportOpen(open) }}>
        <DialogContent className="max-w-xl" showCloseButton={!isExporting}>
          <DialogHeader>
            <DialogTitle>Exportar dados</DialogTitle>
            <DialogDescription>
              Escolha quais informações da Qualidade entram na planilha. Os filtros atuais da tela serão respeitados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {enabledExportOptions.map((option) => {
              const checked = exportDatasets.includes(option.id)
              return (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    checked ? "border-metalique/35 bg-red-50/70" : "border-hairline bg-white hover:border-hairline-strong"
                  }`}
                >
                  <input className="mt-0.5 size-4 accent-[#db0f0f]" type="checkbox" checked={checked} onChange={() => toggleExportDataset(option.id)} />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{option.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" disabled={isExporting} onClick={() => setIsExportOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={isExporting || exportDatasets.length === 0} onClick={() => void exportQualityData()}>
              {isExporting ? <LoaderCircle className="animate-spin" /> : <Download />}
              {isExporting ? "Exportando..." : "Baixar planilha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printTarget && (
        <PrintSheet
          report={printReport}
          dispatch={printDispatch}
          complaint={printComplaint}
          plan={printPlan}
          isLoading={!printReport && !printDispatch && !printComplaint && !printPlan}
          canEdit={canEdit}
          onEdit={beginEdit}
          onClose={closePrint}
        />
      )}
    </>
  )
}
