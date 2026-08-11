import { type FormEvent, useCallback, useEffect, useState } from "react"
import { Check, Eye, EyeOff, LoaderCircle, Pencil, Plus, ShieldCheck, UserRound, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getJson, postJson, profilePhotoUrl } from "@/lib/api"
import type { PermissionKey } from "@/types"

type ManagedUser = {
  id: number
  name: string
  email: string
  job_title: string
  role: "admin" | "user"
  is_primary_admin: boolean
  is_active: boolean
  profile_photo: string | null
  created_at: string
  permissions: PermissionKey[]
}

type PermissionDefinition = {
  key: PermissionKey
  label: string
  description: string
}

type UsersPayload = {
  users: ManagedUser[]
  permissions: PermissionDefinition[]
}

type UserForm = {
  id: number
  name: string
  email: string
  jobTitle: string
  role: "admin" | "user"
  password: string
  isActive: boolean
  permissions: PermissionKey[]
}

const emptyForm: UserForm = {
  id: 0,
  name: "",
  email: "",
  jobTitle: "",
  role: "user",
  password: "",
  isActive: true,
  permissions: ["dashboard.view"],
}

const QUALITY_SECTION_KEYS: PermissionKey[] = [
  "quality.raps",
  "quality.units",
  "quality.products",
  "quality.dispatches",
  "quality.employees",
  "quality.satisfaction",
  "quality.records",
]

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export function UsersPage({ csrfToken }: { csrfToken: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [permissionDefinitions, setPermissionDefinitions] = useState<PermissionDefinition[]>([])
  const [form, setForm] = useState<UserForm | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setError("")
    try {
      const payload = await getJson<UsersPayload>("/backend/api/admin/users.php")
      setUsers(payload.users)
      setPermissionDefinitions(payload.permissions)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void loadUsers() }, [loadUsers])

  const editUser = (user: ManagedUser) => {
    if (user.is_primary_admin) return
    setError("")
    setShowPassword(false)
    setForm({
      id: user.id,
      name: user.name,
      email: user.email,
      jobTitle: user.job_title,
      role: user.role,
      password: "",
      isActive: user.is_active,
      permissions: user.permissions,
    })
  }

  const togglePermission = (permission: PermissionKey) => {
    setForm((current) => {
      if (!current) return current
      const selected = current.permissions.includes(permission)
      const next = new Set(current.permissions)

      if (selected) {
        next.delete(permission)
        if (permission === "quality.view") {
          next.delete("quality.manage")
          QUALITY_SECTION_KEYS.forEach((item) => next.delete(item))
        }
      } else {
        next.add(permission)
        if (permission === "quality.view") {
          QUALITY_SECTION_KEYS.forEach((item) => next.add(item))
        }
        if (QUALITY_SECTION_KEYS.includes(permission)) {
          next.add("quality.view")
        }
        if (permission === "quality.manage") {
          next.add("quality.view")
          next.add("quality.raps")
          next.add("quality.dispatches")
          next.add("quality.records")
        }
      }

      return {
        ...current,
        permissions: Array.from(next),
      }
    })
  }

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form) return
    setIsSaving(true)
    setError("")

    try {
      const payload = await postJson<{ message: string }>("/backend/api/admin/user-save.php", {
        ...form,
        csrfToken,
      })
      setNotice(payload.message)
      setForm(null)
      await loadUsers()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSaving(false)
    }
  }

  const mainPermissionDefinitions = permissionDefinitions.filter(
    (permission) => !QUALITY_SECTION_KEYS.includes(permission.key)
  )
  const qualityPermissionDefinitions = permissionDefinitions.filter(
    (permission) => QUALITY_SECTION_KEYS.includes(permission.key)
  )

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(30px,2.4vw,43px)] font-medium leading-none">Usuários</h1>
          <p className="mt-2 text-sm text-[#52514e]">Contas, cargos e permissões de acesso ao sistema.</p>
        </div>
        <Button className="rounded-full" type="button" onClick={() => { setError(""); setShowPassword(false); setForm({ ...emptyForm }) }}>
          <Plus /> Novo usuário
        </Button>
      </div>

      {notice && (
        <p className="mt-4 flex items-center gap-2 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
          <Check className="size-4" /> {notice}
          <button className="ml-auto underline" type="button" onClick={() => setNotice("")}>fechar</button>
        </p>
      )}
      {error && !form && <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-lg border border-black/10 bg-white">
        {isLoading ? (
          <div className="grid h-56 place-items-center text-[#898781]"><LoaderCircle className="size-7 animate-spin" aria-label="Carregando usuários" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="border-b border-black/10 bg-[#f7f7f6] text-xs uppercase text-[#6e6c67]">
                <tr>
                  <th className="px-5 py-4 font-medium">Usuário</th>
                  <th className="px-5 py-4 font-medium">Cargo</th>
                  <th className="px-5 py-4 font-medium">Tipo</th>
                  <th className="px-5 py-4 font-medium">Permissões</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="w-16 px-5 py-4"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {users.map((user) => {
                  const photo = profilePhotoUrl(user.profile_photo)
                  return (
                    <tr key={user.id} className="hover:bg-[#fafafa]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#f2f2f2] font-medium text-[#db0f0f]">
                            {photo ? <img className="size-full object-cover" src={photo} alt="" /> : initials(user.name) || <UserRound className="size-5" />}
                          </div>
                          <div>
                            <p className="font-medium text-black">{user.name}</p>
                            <p className="text-xs text-[#6e6c67]">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[#52514e]">{user.job_title}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">
                          {user.role === "admin" && <ShieldCheck className="size-3.5 text-[#db0f0f]" />}
                          {user.is_primary_admin ? "Administrador principal" : user.role === "admin" ? "Administrador" : "Usuário"}
                        </span>
                      </td>
                      <td className="max-w-64 px-5 py-4 text-xs text-[#52514e]">
                        {user.role === "admin" ? "Acesso total" : `${user.permissions.length} de ${permissionDefinitions.length} permissões`}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${user.is_active ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                          {user.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button variant="ghost" size="icon" type="button" disabled={user.is_primary_admin} onClick={() => editUser(user)} aria-label={`Editar ${user.name}`} title={user.is_primary_admin ? "Conta principal protegida" : "Editar usuário"}>
                          <Pencil className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-black/45 p-4 py-8" role="dialog" aria-modal="true" aria-labelledby="user-form-title">
          <section className="mx-auto w-full max-w-2xl rounded-lg bg-white p-6 text-black shadow-2xl sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="user-form-title" className="text-2xl font-semibold">{form.id ? "Editar usuário" : "Novo usuário"}</h2>
                <p className="mt-1 text-sm text-[#6e6c67]">Defina os dados da conta e o que ela poderá acessar.</p>
              </div>
              <Button variant="ghost" size="icon" type="button" onClick={() => setForm(null)} aria-label="Fechar"><X /></Button>
            </div>

            {error && <p className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

            <form className="mt-6 space-y-6" onSubmit={saveUser}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Nome completo
                  <input className="mt-1.5 h-11 w-full rounded-md border border-black/20 px-3 outline-none focus:border-[#db0f0f]" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} />
                </label>
                <label className="text-sm font-medium">Cargo
                  <input className="mt-1.5 h-11 w-full rounded-md border border-black/20 px-3 outline-none focus:border-[#db0f0f]" value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} required maxLength={100} />
                </label>
                <label className="text-sm font-medium">E-mail
                  <input className="mt-1.5 h-11 w-full rounded-md border border-black/20 px-3 outline-none focus:border-[#db0f0f]" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required maxLength={254} />
                </label>
                <label className="text-sm font-medium">Tipo de conta
                  <select className="mt-1.5 h-11 w-full rounded-md border border-black/20 bg-white px-3 outline-none focus:border-[#db0f0f]" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserForm["role"] })}>
                    <option value="user">Usuário com permissões</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                <label className="text-sm font-medium sm:col-span-2">{form.id ? "Nova senha (opcional)" : "Senha inicial"}
                  <div className="relative mt-1.5">
                    <input className="h-11 w-full rounded-md border border-black/20 px-3 pr-11 outline-none focus:border-[#db0f0f]" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!form.id} minLength={8} maxLength={72} autoComplete="new-password" />
                    <button className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#6e6c67]" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} title={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-semibold">Permissões</h3>
                  {form.role === "admin" && <span className="text-xs font-medium text-[#db0f0f]">Acesso total</span>}
                </div>
                <div className="mt-3 divide-y divide-black/10 rounded-md border border-black/10">
                  {mainPermissionDefinitions.map((permission) => {
                    const checked = form.role === "admin" || form.permissions.includes(permission.key)
                    return (
                      <label key={permission.key} className={`flex items-start gap-3 p-4 ${form.role === "admin" ? "cursor-not-allowed bg-neutral-50" : "cursor-pointer hover:bg-neutral-50"}`}>
                        <input className="mt-0.5 size-4 accent-[#db0f0f]" type="checkbox" checked={checked} disabled={form.role === "admin"} onChange={() => togglePermission(permission.key)} />
                        <span>
                          <span className="block text-sm font-medium">{permission.label}</span>
                          <span className="mt-0.5 block text-xs text-[#6e6c67]">{permission.description}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>

                {(form.role === "admin" || form.permissions.includes("quality.view")) && (
                  <div className="mt-5">
                    <h4 className="text-sm font-semibold">Menu da conta de Qualidade</h4>
                    <p className="mt-1 text-xs text-[#6e6c67]">Escolha quais áreas do setor aparecerão para este usuário.</p>
                    <div className="mt-3 grid overflow-hidden rounded-md border border-black/10 sm:grid-cols-2">
                      {qualityPermissionDefinitions.map((permission) => {
                        const checked = form.role === "admin" || form.permissions.includes(permission.key)
                        return (
                          <label key={permission.key} className={`flex items-start gap-3 border-b border-black/10 p-4 sm:odd:border-r ${form.role === "admin" ? "cursor-not-allowed bg-neutral-50" : "cursor-pointer hover:bg-neutral-50"}`}>
                            <input className="mt-0.5 size-4 accent-[#db0f0f]" type="checkbox" checked={checked} disabled={form.role === "admin"} onChange={() => togglePermission(permission.key)} />
                            <span>
                              <span className="block text-sm font-medium">{permission.label}</span>
                              <span className="mt-0.5 block text-xs text-[#6e6c67]">{permission.description}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                <input className="size-4 accent-[#db0f0f]" type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
                Conta ativa
              </label>

              <div className="flex justify-end gap-3 border-t border-black/10 pt-5">
                <Button variant="outline" type="button" onClick={() => setForm(null)}>Cancelar</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <LoaderCircle className="animate-spin" />}
                  {isSaving ? "Salvando..." : "Salvar usuário"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
