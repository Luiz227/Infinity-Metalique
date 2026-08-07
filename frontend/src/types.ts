export type User = {
  id: number
  name: string
  email: string
  profile_photo: string | null
}

export type SummaryUser = Pick<User, "id" | "name" | "profile_photo">

export type ApiResponse = {
  csrfToken?: string
  message?: string
  user?: User | null
  total?: number
  users?: SummaryUser[]
}
