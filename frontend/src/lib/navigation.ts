import type { PermissionKey, User } from "@/types"
import type { Route } from "@/lib/router"

/**
 * O mapa de navegação do sistema, num lugar só.
 *
 * Estas duas listas eram copiadas em quatro arquivos - cabeçalho, busca, página
 * da Qualidade e agora as configurações. Copiadas, elas saem de sincronia na
 * primeira aba nova: uma delas some do menu, ou aparece para quem não tem a
 * permissão. Aqui a lista é uma só e a permissão anda junto do rótulo.
 */

/** As telas da barra do cabeçalho, na ordem em que aparecem. */
export const MAIN_NAVIGATION = [
  { label: "Dashboard", to: "/sistema", permission: "dashboard.view" },
  { label: "Qualidade", to: "/qualidade", permission: "quality.view" },
  { label: "Usuários", to: "/usuarios", permission: "users.manage" },
  { label: "PipeRun", to: "/piperun", permission: "piperun.view" },
  { label: "SIGE", to: "/sige", permission: "sige.view" },
] as const satisfies readonly { label: string; to: Route; permission: PermissionKey }[]

/** As abas de dentro do módulo da Qualidade. */
export const QUALITY_NAVIGATION = [
  { id: "raps", label: "RAPs", permission: "quality.raps" },
  { id: "unidades", label: "Unidades", permission: "quality.units" },
  { id: "produtos", label: "Produtos", permission: "quality.products" },
  { id: "coletas", label: "Produtos Coletados", permission: "quality.dispatches" },
  { id: "colaboradores", label: "Colaboradores", permission: "quality.employees" },
  { id: "qualidade", label: "Qualidade", permission: "quality.satisfaction" },
  // O plano é a tratativa da reclamação: quem registra a reclamação é quem trata.
  { id: "planos", label: "Planos de ação", permission: "quality.create_complaint" },
  { id: "registros", label: "Registros", permission: "quality.records" },
] as const satisfies readonly { id: string; label: string; permission: PermissionKey }[]

export type QualityTabId = (typeof QUALITY_NAVIGATION)[number]["id"]

/** Admin enxerga tudo; o resto depende da chave que a conta recebeu. */
export function hasPermission(user: User, permission: PermissionKey): boolean {
  return user.role === "admin" || user.permissions.includes(permission)
}
