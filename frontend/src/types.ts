import type { PhotoCrop } from "@/lib/image"
import type { AccountPreferences } from "@/lib/preferences"

export type PermissionKey =
  | "dashboard.view"
  | "documents.view"
  | "documents.manage"
  | "quality.view"
  | "quality.edit"
  | "quality.manage"
  | "quality.create_rap"
  | "quality.create_dispatch"
  | "quality.create_complaint"
  | "quality.import"
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
  | "contact.manage"

export type User = {
  id: number
  name: string
  nickname: string | null
  email: string
  job_title: string
  sector: string
  employee_id: number | null
  role: "admin" | "user"
  is_primary_admin: boolean
  is_active: boolean
  must_change_password: boolean
  profile_photo: string | null
  /** O original de onde o recorte saiu, guardado para reposicionar depois. */
  profile_photo_source: string | null
  /** O enquadramento atual, em pixels de `profile_photo_source`. */
  profile_photo_crop: PhotoCrop | null
  permissions: PermissionKey[]
  /** Vêm junto da sessão, não por requisição própria (ver lib/preferences.ts). */
  preferences: AccountPreferences
}

export type SummaryUser = Pick<User, "id" | "name" | "profile_photo">

export type HomeSummary = {
  total: number
  users: SummaryUser[]
}

export type ApiResponse = {
  csrfToken?: string
  message?: string
  user?: User | null
  total?: number
  users?: SummaryUser[]
}
