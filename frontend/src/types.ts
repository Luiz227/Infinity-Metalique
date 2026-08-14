export type PermissionKey =
  | "dashboard.view"
  | "quality.view"
  | "quality.manage"
  | "quality.create_rap"
  | "quality.create_dispatch"
  | "quality.raps"
  | "quality.units"
  | "quality.products"
  | "quality.dispatches"
  | "quality.employees"
  | "quality.satisfaction"
  | "quality.records"
  | "piperun.view"
  | "sige.view"
  | "users.manage"

export type User = {
  id: number
  name: string
  nickname: string | null
  email: string
  job_title: string
  sector: string
  role: "admin" | "user"
  is_primary_admin: boolean
  is_active: boolean
  must_change_password: boolean
  profile_photo: string | null
  permissions: PermissionKey[]
}

export type SummaryUser = Pick<User, "id" | "name" | "profile_photo">

export type ApiResponse = {
  csrfToken?: string
  message?: string
  user?: User | null
  total?: number
  users?: SummaryUser[]
}
