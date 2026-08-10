export type PermissionKey =
  | "dashboard.view"
  | "quality.view"
  | "quality.manage"
  | "quality.raps"
  | "quality.units"
  | "quality.products"
  | "quality.dispatches"
  | "quality.employees"
  | "quality.satisfaction"
  | "quality.records"
  | "users.manage"

export type User = {
  id: number
  name: string
  email: string
  job_title: string
  role: "admin" | "user"
  is_primary_admin: boolean
  is_active: boolean
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
