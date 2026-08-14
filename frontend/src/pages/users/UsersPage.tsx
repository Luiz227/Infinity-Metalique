import { type FormEvent, useCallback, useEffect, useState } from "react"
import { AlertTriangle, Check, ChevronDown, Eye, EyeOff, LoaderCircle, Pencil, Plus, ShieldCheck, SlidersHorizontal, Trash2, UserRound, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getJson, postJson, profilePhotoUrl } from "@/lib/api"
import type { PermissionKey } from "@/types"

type ManagedUser = {
  id: number
  name: string
  email: string
  job_title: string
  sector: string
  role: "admin" | "user"
  is_primary_admin: boolean
  is_active: boolean
  must_change_password: boolean
  profile_photo: string | null
  created_at: string
  permissions: PermissionKey[]
}

type PermissionDefinition = {
  key: PermissionKey
  group: string
  assignable?: boolean
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
  sector: string
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
  sector: "",
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

const QUALITY_ACTION_KEYS: PermissionKey[] = [
  "quality.manage",
  "quality.create_rap",
  "quality.create_dispatch",
]

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export function UsersPage({ csrfToken, currentUserId }: { csrfToken: string; currentUserId: number }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [permissionDefinitions, setPermissionDefinitions] = useState<PermissionDefinition[]>([])
  const [form, setForm] = useState<UserForm | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [openPermissionGroup, setOpenPermissionGroup] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
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
    setOpenPermissionGroup(null)
    setForm({
      id: user.id,
      name: user.name,
      email: user.email,
      jobTitle: user.job_title,
      sector: user.sector,
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
          QUALITY_ACTION_KEYS.forEach((item) => next.delete(item))
          QUALITY_SECTION_KEYS.forEach((item) => next.delete(item))
        }
        if (!QUALITY_SECTION_KEYS.some((item) => next.has(item))
            && !QUALITY_ACTION_KEYS.some((item) => next.has(item))) {
          next.delete("quality.view")
        }
      } else {
        next.add(permission)
        if (QUALITY_SECTION_KEYS.includes(permission)) {
          next.add("quality.view")
        }
        if (QUALITY_ACTION_KEYS.includes(permission)) {
          next.add("quality.view")
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
    if (!form.jobTitle.trim()) {
      setError("Informe o cargo do usuário.")
      return
    }
    if (!form.sector.trim()) {
      setError("Informe o setor principal do usuário.")
      return
    }
    setIsSaving(true)
    setError("")

    try {
      const payload = await postJson<{ message: string }>("/backend/api/admin/user-save.php", {
        ...form,
        csrfToken,
      })
      setNotice(payload.message)
      setOpenPermissionGroup(null)
      setForm(null)
      await loadUsers()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSaving(false)
    }
  }

  const deleteUser = async () => {
    if (!userToDelete) return
    setIsDeleting(true)
    setError("")
    try {
      const payload = await postJson<{ message: string }>("/backend/api/admin/user-delete.php", {
        csrfToken,
        id: userToDelete.id,
      })
      setNotice(payload.message)
      setUserToDelete(null)
      await loadUsers()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível excluir a conta.")
      setUserToDelete(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const permissionGroups = permissionDefinitions
    .filter((permission) => permission.assignable !== false)
    .reduce<Record<string, PermissionDefinition[]>>((groups, permission) => {
      const group = permission.group || "Geral"
      groups[group] = [...(groups[group] || []), permission]
      return groups
    }, {})
  const assignablePermissionKeys = new Set(
    permissionDefinitions.filter((permission) => permission.assignable !== false).map((permission) => permission.key)
  )
  const jobTitles = Array.from(new Set(
    users.map((user) => user.job_title.trim()).filter(Boolean)
  )).sort((left, right) => left.localeCompare(right, "pt-BR"))
  const sectors = Array.from(new Set(
    users.map((user) => user.sector.trim()).filter(Boolean)
  )).sort((left, right) => left.localeCompare(right, "pt-BR"))

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(30px,2.4vw,43px)] font-medium leading-none">Usuários</h1>
          <p className="mt-2 text-sm text-[#52514e]">Contas, cargos e permissões de acesso ao sistema.</p>
        </div>
        <Button className="rounded-full" type="button" onClick={() => { setError(""); setShowPassword(false); setOpenPermissionGroup(null); setForm({ ...emptyForm }) }}>
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
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead className="border-b border-black/10 bg-[#f7f7f6] text-xs uppercase text-[#6e6c67]">
                <tr>
                  <th className="px-5 py-4 font-medium">Usuário</th>
                  <th className="px-5 py-4 font-medium">Cargo</th>
                  <th className="px-5 py-4 font-medium">Setor</th>
                  <th className="px-5 py-4 font-medium">Tipo</th>
                  <th className="px-5 py-4 font-medium">Permissões</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="w-28 px-5 py-4"><span className="sr-only">Ações</span></th>
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
                      <td className="px-5 py-4 text-[#52514e]">{user.sector}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">
                          {user.role === "admin" && <ShieldCheck className="size-3.5 text-[#db0f0f]" />}
                          {user.is_primary_admin ? "Administrador principal" : user.role === "admin" ? "Administrador" : "Usuário"}
                        </span>
                      </td>
                      <td className="max-w-64 px-5 py-4 text-xs text-[#52514e]">
                        {user.role === "admin" ? "Acesso total" : `${user.permissions.filter((permission) => assignablePermissionKeys.has(permission)).length} de ${assignablePermissionKeys.size} permissões`}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${!user.is_active ? "bg-neutral-100 text-neutral-500" : user.must_change_password ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                          {!user.is_active ? "Inativo" : user.must_change_password ? "Primeiro acesso" : "Ativo"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <Button variant="ghost" size="icon" type="button" disabled={user.is_primary_admin} onClick={() => editUser(user)} aria-label={`Editar ${user.name}`} title={user.is_primary_admin ? "Conta principal protegida" : "Editar usuário"}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          type="button"
                          disabled={user.is_primary_admin || user.id === currentUserId}
                          onClick={() => setUserToDelete(user)}
                          aria-label={`Excluir ${user.name}`}
                          title={user.is_primary_admin ? "Conta principal protegida" : user.id === currentUserId ? "Você não pode excluir sua própria conta" : "Excluir conta"}
                        >
                          <Trash2 className="size-4" />
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
                <div className="text-sm font-medium">
                  <label htmlFor="user-job-title">Cargo</label>
                  <Combobox
                    id="user-job-title"
                    className="mt-1.5 h-11 rounded-md border-black/20"
                    value={form.jobTitle}
                    onChange={(jobTitle) => setForm({ ...form, jobTitle })}
                    options={jobTitles}
                    placeholder="Selecione o cargo"
                    searchPlaceholder="Buscar ou digitar um novo"
                    emptyLabel="Nenhum cargo encontrado."
                    allowCreate
                  />
                </div>
                <div className="text-sm font-medium">
                  <label htmlFor="user-sector">Setor principal</label>
                  <Combobox
                    id="user-sector"
                    className="mt-1.5 h-11 rounded-md border-black/20"
                    value={form.sector}
                    onChange={(sector) => setForm({ ...form, sector })}
                    options={sectors}
                    placeholder="Selecione o setor"
                    searchPlaceholder="Buscar ou digitar um novo"
                    emptyLabel="Nenhum setor encontrado."
                    allowCreate
                  />
                </div>
                <label className="text-sm font-medium">E-mail
                  <input className="mt-1.5 h-11 w-full rounded-md border border-black/20 px-3 outline-none focus:border-[#db0f0f]" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required maxLength={254} />
                </label>
                <label className="text-sm font-medium">Tipo de conta
                  <select className="mt-1.5 h-11 w-full rounded-md border border-black/20 bg-white px-3 outline-none focus:border-[#db0f0f]" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserForm["role"] })}>
                    <option value="user">Usuário com permissões</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                {!form.id && (
                  <label className="text-sm font-medium sm:col-span-2">Senha temporária inicial
                    <div className="relative mt-1.5">
                      <input className="h-11 w-full rounded-md border border-black/20 px-3 pr-11 outline-none focus:border-[#db0f0f]" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={8} maxLength={72} autoComplete="new-password" />
                      <button className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#6e6c67]" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} title={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    <span className="mt-1.5 block text-xs font-normal text-[#6e6c67]">Mínimo de 8 caracteres, com número e caractere especial. O usuário deverá alterá-la no primeiro acesso.</span>
                  </label>
                )}
              </div>

              <div className="rounded-lg border border-black/10 bg-[#fafafa] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">Permissões de acesso</h3>
                    <p className="mt-1 text-xs text-[#6e6c67]">Escolha o que este usuário poderá visualizar e administrar.</p>
                  </div>
                  {form.role === "admin" && <span className="shrink-0 text-xs font-medium text-[#db0f0f]">Acesso total</span>}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {Object.entries(permissionGroups).map(([group, definitions]) => {
                    const selectedGroupCount = form.role === "admin"
                      ? definitions.length
                      : definitions.filter((permission) => form.permissions.includes(permission.key)).length
                    const isOpen = openPermissionGroup === group

                    return (
                      <Popover
                        key={group}
                        open={isOpen}
                        onOpenChange={(open) => setOpenPermissionGroup(open ? group : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex h-11 w-full items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-sm text-[#52514e] transition-colors hover:border-black/20 hover:bg-neutral-50"
                          >
                            <SlidersHorizontal className="size-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate text-left font-medium">{group}</span>
                            <span className="rounded-full bg-[#db0f0f] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                              {selectedGroupCount}/{definitions.length}
                            </span>
                            <ChevronDown className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                        </PopoverTrigger>

                        <PopoverContent align="start" className="w-[min(92vw,600px)]">
                          <div className="border-b border-black/10 px-4 py-3">
                            <h4 className="font-semibold">{group}</h4>
                            <p className="mt-0.5 text-xs text-[#6e6c67]">
                              {selectedGroupCount} de {definitions.length} permissões selecionadas
                            </p>
                          </div>
                          <div className="grid max-h-[min(60vh,500px)] gap-2 overflow-y-auto p-4 sm:grid-cols-2">
                            {definitions.map((permission) => {
                              const checked = form.role === "admin" || form.permissions.includes(permission.key)
                              return (
                                <label
                                  key={permission.key}
                                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                                    checked ? "border-[#db0f0f]/30 bg-red-50/60" : "border-black/10 bg-white"
                                  } ${form.role === "admin" ? "cursor-not-allowed" : "cursor-pointer hover:border-black/20"}`}
                                >
                                  <input className="mt-0.5 size-4 shrink-0 accent-[#db0f0f]" type="checkbox" checked={checked} disabled={form.role === "admin"} onChange={() => togglePermission(permission.key)} />
                                  <span>
                                    <span className="block text-sm font-medium">{permission.label}</span>
                                    <span className="mt-0.5 block text-xs leading-relaxed text-[#6e6c67]">{permission.description}</span>
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                          <div className="flex justify-end border-t border-black/10 px-4 py-3">
                            <button
                              type="button"
                              className="rounded-full bg-[#db0f0f] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#c20d0d]"
                              onClick={() => setOpenPermissionGroup(null)}
                            >
                              Fechar
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )
                  })}
                </div>
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

      <Dialog open={Boolean(userToDelete)} onOpenChange={(open) => { if (!open && !isDeleting) setUserToDelete(null) }}>
        <DialogContent className="max-w-md" showCloseButton={!isDeleting}>
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-full bg-red-50 text-red-600"><AlertTriangle className="size-5" /></div>
            <DialogTitle>Excluir conta</DialogTitle>
            <DialogDescription>
              A conta de <strong className="text-black">{userToDelete?.name}</strong> será excluída permanentemente. Os RAPs e coletas existentes serão preservados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" disabled={isDeleting} onClick={() => setUserToDelete(null)}>Cancelar</Button>
            <Button className="bg-red-600 hover:bg-red-700" type="button" disabled={isDeleting} onClick={() => void deleteUser()}>
              {isDeleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              {isDeleting ? "Excluindo..." : "Excluir conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
