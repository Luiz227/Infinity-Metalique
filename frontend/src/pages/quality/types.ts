/** Tipos da view de qualidade, espelhando o que backend/api/quality devolve. */

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

export type ComplaintRow = {
  id: number
  complaint_date: string
  client: string | null
  machine_type: string | null
  model: string | null
  problem: string | null
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

export type QualityOptions = {
  codes: { id: number; code: string; description: string }[]
  employees: { id: number; name: string }[]
  machineTypes: { id: number; name: string }[]
  machineModels: { id: number; name: string; machineTypeId: number; machineType: string }[]
  clients: { id: number; name: string }[]
  sheds: string[]
  years: number[]
  gates: string[]
  sectors: string[]
  problemTypes: string[]
  actionTypes: string[]
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
  checklist_change: string | null
  created_by: string | null
  created_by_job_title: string | null
  created_at: string
  employees: string[]
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
  needs_form_update: number
  form_change: string | null
  immediate_action: string | null
  created_by: string | null
  created_by_job_title: string | null
  created_at: string
  employees: string[]
  photos: string[]
}

export type Paginated<T> = { total: number; page: number; perPage: number; items: T[] }
