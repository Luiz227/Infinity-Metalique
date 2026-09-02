/** Tipos da view de qualidade, espelhando o que backend/api/quality devolve. */

import { todayIso } from "@/pages/quality/format"

export type LabelValue = { label: string; value: number; description?: string | null }
export type PeriodValue = { period: string; label: string; value: number }
export type GateValue = PeriodValue & { gate: string }

export type QualityCards = {
  totalReports: number
  latestPeriodReports: number
  latestPeriodLabel: string
  clients: number
  models: number
  machineTypes: number
  totalDispatches: number
  totalComplaints: number
  satisfactionRate: number | null
  complaintRate: number | null
  highlightMachine: string | null
  highlightModel: string | null
}

export type QualityRecordEdit = {
  id: number
  edited_at: string
  edited_by: string | null
  edited_by_job_title: string | null
  changes: Record<string, { before: unknown; after: unknown }>
}

/**
 * O plano de ação viaja junto com a reclamação: é ele que responde se ela foi
 * tratada e quando fechou. `plan_id` nulo é reclamação ainda sem plano.
 */
export type ComplaintPlan = {
  plan_id: number | null
  plan_code: string | null
  plan_opened_on: string | null
  plan_due_on: string | null
  plan_closed_on: string | null
}

export type ComplaintRow = ComplaintPlan & {
  id: number
  code: string
  complaint_date: string
  client: string | null
  machine_type: string | null
  model: string | null
  problem: string | null
}

export type ComplaintDetail = ComplaintRow & {
  sequence: number
  machine_type_id: number | null
  local_treatment: string | null
  quality_alert: string | null
  created_by: string | null
  created_by_job_title: string | null
  created_at: string
  plan_action: string | null
  plan_root_cause: string | null
  plan_employee: string | null
  plan_entries: { entry_date: string; note: string; created_by: string | null }[]
  edit_history: QualityRecordEdit[]
}

export type ActionPlanEntry = {
  id: number
  entry_date: string
  note: string
  created_by: string | null
  created_by_job_title?: string | null
}

export type ActionPlanRow = {
  id: number
  code: string
  opened_on: string
  due_on: string | null
  closed_on: string | null
  action: string | null
  root_cause: string | null
  complaint_id: number | null
  complaint_code: string | null
  complaint_date: string | null
  no_complaint_month: string | null
  no_complaint_note: string | null
  problem: string | null
  client: string | null
  machine_type: string | null
  model: string | null
  employee: string | null
  entries: number
}

export type ActionPlanDetail = Omit<ActionPlanRow, "entries"> & {
  sequence: number
  local_treatment: string | null
  quality_alert: string | null
  created_by: string | null
  created_by_job_title: string | null
  closed_by: string | null
  created_at: string
  entries: ActionPlanEntry[]
}

/** Uma linha do log consolidado da aba, já com o plano de onde ela veio. */
export type ActionPlanFeedEntry = {
  id: number
  entry_date: string
  note: string
  plan_id: number
  plan_code: string
  client: string | null
  created_by: string | null
}

export type ActionPlanCards = {
  open: number
  late: number
  closed: number
  /** Média de dias entre abertura e fechamento; nula enquanto nada fechou. */
  averageDays: number | null
}

export type ActionPlans = Paginated<ActionPlanRow> & {
  cards: ActionPlanCards
  entries: ActionPlanFeedEntry[]
}

/**
 * Situação derivada do plano - não existe coluna para ela no banco. Uma verdade
 * só: sem fechamento e com prazo vencido é atraso; com fechamento é concluído.
 */
export function planStatus(dueOn: string | null, closedOn: string | null): {
  id: "closed" | "late" | "open"
  label: string
} {
  if (closedOn) return { id: "closed", label: "Concluído" }
  if (dueOn && dueOn.slice(0, 10) < todayIso()) return { id: "late", label: "Atrasado" }

  return { id: "open", label: "Em aberto" }
}

export type QualityDashboard = {
  cards: QualityCards
  reportsByPeriod: PeriodValue[]
  reportsByProblemType: LabelValue[]
  reportsByCode: LabelValue[]
  reportsByShed: LabelValue[]
  reportsByGate: GateValue[]
  reportsByModel: LabelValue[]
  reportsByMachineType: LabelValue[]
  reportsByEmployee: LabelValue[]
  dispatchesByPeriod: PeriodValue[]
  dispatchesByMachineType: LabelValue[]
  dispatchesByModel: LabelValue[]
  complaintsByPeriod: PeriodValue[]
  complaints: ComplaintRow[]
}

/**
 * Catálogos vêm inteiros, com a marca de ativo. O formulário de RAP só oferece
 * os ativos; o filtro e os gráficos usam a lista toda, senão os apontamentos de
 * um gate ou código desativado ficariam inalcançáveis.
 */
export type QualityOptions = {
  codes: { id: number; code: string; description: string; active: boolean }[]
  employees: { id: number; name: string }[]
  machineTypes: { id: number; name: string }[]
  machineModels: { id: number; name: string; machineTypeId: number; machineType: string }[]
  clients: { id: number; name: string }[]
  sheds: string[]
  years: number[]
  gates: { name: string; active: boolean }[]
  sectors: string[]
  problemTypes: string[]
  actionTypes: string[]
  /** Metas da engrenagem. `rapsPerMonth` é um teto: o real precisa ficar abaixo. */
  targets: { rapsPerMonth: number | null }
}

/** Estado editável do painel da engrenagem, com o uso de cada item do catálogo. */
export type QualitySettings = {
  gates: { id: number; name: string; position: number; active: boolean; usage: number }[]
  codes: { id: number; code: string; description: string; position: number; active: boolean; usage: number }[]
  targets: { rapsPerMonth: number | null }
}

export type QualityFilters = {
  year: number | null
  month: number | null
  startDate: string | null
  endDate: string | null
  shed: string | null
  gate: string | null
  problemType: string | null
  model: string | null
  codeId: number | null
  machineTypeId: number | null
  employeeId: number | null
  clientId: number | null
}

/**
 * Seleção temporária de um ponto do gráfico. Diferente da barra de filtros,
 * ela preserva os totais e pede ao backend somente o subconjunto destacado.
 */
export type QualityChartSelection = {
  key: string
  label: string
  filters: Partial<QualityFilters>
}

export const emptyFilters: QualityFilters = {
  year: null,
  month: null,
  startDate: null,
  endDate: null,
  shed: null,
  gate: null,
  problemType: null,
  model: null,
  codeId: null,
  machineTypeId: null,
  employeeId: null,
  clientId: null,
}

/** Monta a query string só com os filtros realmente preenchidos. */
export function filtersToQuery(filters: QualityFilters): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== "") params.set(key, String(value))
  }

  const query = params.toString()
  return query ? `?${query}` : ""
}

export type ReportRow = {
  id: number
  code: string
  report_date: string
  action_type: string
  shed: string | null
  sector: string | null
  gate: string | null
  problem_type: string | null
  model: string | null
  description: string | null
  immediate_action: string | null
  needs_checklist_update: number
  client: string | null
  machine_type: string | null
  quality_code: string | null
  quality_code_description: string | null
  employees: string | null
}

export type ReportDetail = Omit<ReportRow, "employees"> & {
  sequence: number
  machine_type_id: number | null
  quality_code_id: number | null
  checklist_change: string | null
  created_by: string | null
  created_by_job_title: string | null
  created_at: string
  employees: string[]
  employee_ids: number[]
  edit_history: QualityRecordEdit[]
}

export type DispatchRow = {
  id: number
  code: string
  dispatch_date: string
  model: string | null
  notes: string | null
  client: string | null
  machine_type: string | null
  photos: number
}

export type DispatchDetail = Omit<DispatchRow, "photos"> & {
  sequence: number
  machine_type_id: number | null
  needs_form_update: number
  form_change: string | null
  immediate_action: string | null
  created_by: string | null
  created_by_job_title: string | null
  created_at: string
  employees: string[]
  employee_ids: number[]
  photos: string[]
  edit_history: QualityRecordEdit[]
}

export type Paginated<T> = { total: number; page: number; perPage: number; items: T[] }
