import { useSyncExternalStore } from "react"

import { postJson } from "@/lib/api"
import type { Route } from "@/lib/router"

/**
 * As preferências que a central de configurações edita.
 *
 * Duas naturezas convivem aqui, e a diferença é visível na tela (as de aparelho
 * levam o selo "Somente neste dispositivo"):
 *
 * - **de conta** vão para o banco e seguem a pessoa de máquina em máquina. Elas
 *   chegam junto da sessão, dentro do usuário, e não por uma requisição própria:
 *   é isso que faz o tema salvo valer já no primeiro paint.
 * - **de aparelho** (lembrar o usuário no login, zoom da janela do desktop)
 *   valem para a máquina, não para a pessoa, e nunca sobem.
 *
 * O espelho no localStorage existe pelo mesmo motivo: `initialize()` roda antes
 * de a interface montar, quando a sessão ainda nem foi pedida. Sem ele a tela
 * pintaria clara e escureceria depois, a cada recarga.
 */

export type ColorTheme = "light" | "dark" | "system"
export type NotificationKind = "quality" | "access-request" | "password-reset"
export type StartRoute = "auto" | Extract<Route, "/sistema" | "/qualidade" | "/usuarios" | "/piperun" | "/sige">

/** Gravadas no banco. Espelham `App\Support\UserPreferences::defaults()`. */
export type AccountPreferences = {
  theme: ColorTheme
  startRoute: StartRoute
  qualityTab: string
  reduceMotion: boolean
  smoothScroll: boolean
  mutedNotifications: NotificationKind[]
  /** Segundos entre duas consultas ao sino; zero é "só quando eu abrir". */
  notificationsInterval: number
}

/** Presas à máquina. Nunca saem daqui. */
export type DevicePreferences = {
  rememberUser: boolean
  zoomFactor: number
}

export type Preferences = AccountPreferences & DevicePreferences

const ACCOUNT_STORAGE_KEY = "metalique:preferences"
const DEVICE_STORAGE_KEY = "metalique:device-preferences"
/** Chave da época em que só existia o tema; lida uma vez e aposentada. */
const LEGACY_THEME_KEY = "metalique:color-theme"

export const ACCOUNT_DEFAULTS: AccountPreferences = {
  theme: "light",
  startRoute: "auto",
  qualityTab: "raps",
  reduceMotion: false,
  smoothScroll: true,
  mutedNotifications: [],
  notificationsInterval: 30,
}

export const DEVICE_DEFAULTS: DevicePreferences = {
  rememberUser: true,
  zoomFactor: 1,
}

export const THEME_OPTIONS: ColorTheme[] = ["light", "dark", "system"]
export const NOTIFICATION_INTERVALS = [30, 120, 0]
export const NOTIFICATION_KINDS: NotificationKind[] = ["quality", "access-request", "password-reset"]

let state: Preferences = { ...ACCOUNT_DEFAULTS, ...DEVICE_DEFAULTS }
const listeners = new Set<() => void>()

/** O token vem do App, que já acompanha as renovações de sessão. */
let csrfToken = ""
let saveTimer = 0
let saveError = ""

function readStored<T>(key: string): Partial<T> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) || "null") as Partial<T> | null
    return stored && typeof stored === "object" ? stored : {}
  } catch {
    return {}
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sem storage as preferências ainda valem durante a sessão.
  }
}

function accountPart(preferences: Preferences): AccountPreferences {
  const { theme, startRoute, qualityTab, reduceMotion, smoothScroll, mutedNotifications, notificationsInterval } = preferences
  return { theme, startRoute, qualityTab, reduceMotion, smoothScroll, mutedNotifications, notificationsInterval }
}

function devicePart(preferences: Preferences): DevicePreferences {
  const { rememberUser, zoomFactor } = preferences
  return { rememberUser, zoomFactor }
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)")

export function resolveTheme(theme: ColorTheme): "light" | "dark" {
  if (theme !== "system") return theme
  return darkQuery().matches ? "dark" : "light"
}

/**
 * O que precisa estar no `<html>` antes do primeiro paint. Movimento reduzido
 * entra como classe porque parte dele é CSS puro (ver `html.reduce-motion` em
 * base.css); o resto é o `MotionConfig` no App.
 */
function applyAppearance() {
  const root = document.documentElement
  const theme = resolveTheme(state.theme)

  root.classList.toggle("dark", theme === "dark")
  root.dataset.theme = theme
  root.style.colorScheme = theme
  root.classList.toggle("reduce-motion", state.reduceMotion)
}

/**
 * O ouvinte do sistema só existe enquanto o tema for "sistema": fora disso ele
 * repintaria a tela por uma mudança que a pessoa escolheu ignorar.
 */
let stopWatchingSystemTheme: (() => void) | null = null

function watchSystemTheme() {
  const shouldWatch = state.theme === "system"
  if (shouldWatch === (stopWatchingSystemTheme !== null)) return

  if (!shouldWatch) {
    stopWatchingSystemTheme?.()
    stopWatchingSystemTheme = null
    return
  }

  const query = darkQuery()
  const repaint = () => {
    applyAppearance()
    emit()
  }
  query.addEventListener("change", repaint)
  stopWatchingSystemTheme = () => query.removeEventListener("change", repaint)
}

function emit() {
  listeners.forEach((listener) => listener())
}

function commit(next: Preferences) {
  state = next
  applyAppearance()
  watchSystemTheme()
  emit()
}

/**
 * O tema herdado da chave antiga, que ainda não existe no banco.
 *
 * Ele precisa sobreviver à hidratação: a conta que escolheu escuro antes desta
 * versão não tem linha em `user_preferences`, então o servidor manda o padrão
 * claro - e sem esta marca a escolha seria desfeita no primeiro login.
 */
let migratedLegacyTheme: ColorTheme | null = null

/**
 * Aplica a preferência salva antes de a interface ser montada.
 *
 * Chamado de `main.tsx`, fora do React: qualquer coisa dentro de um efeito já
 * seria tarde, e a tela piscaria clara antes de escurecer.
 */
export function initializePreferences() {
  const storedAccount = readStored<AccountPreferences>(ACCOUNT_STORAGE_KEY)
  const storedDevice = readStored<DevicePreferences>(DEVICE_STORAGE_KEY)

  // Quem já tinha escolhido o modo escuro na época do toggle solto do menu não
  // perde a escolha ao atualizar o sistema.
  if (!("theme" in storedAccount)) {
    try {
      const legacy = window.localStorage.getItem(LEGACY_THEME_KEY)
      if (legacy === "dark" || legacy === "light") {
        storedAccount.theme = legacy
        migratedLegacyTheme = legacy
      }
      if (legacy !== null) window.localStorage.removeItem(LEGACY_THEME_KEY)
    } catch {
      // Sem storage não há nada legado para herdar.
    }
  }

  const next = { ...ACCOUNT_DEFAULTS, ...storedAccount, ...DEVICE_DEFAULTS, ...storedDevice }
  // Grava o que foi resolvido: sem isto, a chave antiga já apagada e o espelho
  // ainda vazio fariam a escolha valer só até a próxima recarga.
  writeStored(ACCOUNT_STORAGE_KEY, accountPart(next))
  commit(next)
}

let hydratedUserId: number | null = null

/**
 * O banco vence o espelho: chamado quando a sessão chega com o usuário. O que a
 * conta gravou noutra máquina passa a valer nesta.
 *
 * Uma vez por conta, e não a cada vez que o usuário é atualizado: salvar a foto
 * ou o nome devolve o usuário inteiro, e o bloco que vem junto pode ser mais
 * velho do que uma preferência mudada há meio segundo, ainda esperando o envio.
 * Rehidratar ali desfaria a escolha na cara de quem acabou de fazê-la.
 */
export function hydratePreferences(userId: number | null | undefined, preferences: Partial<AccountPreferences> | null | undefined) {
  if (!userId) {
    hydratedUserId = null
    return
  }
  if (!preferences || hydratedUserId === userId) return

  hydratedUserId = userId
  const next = { ...state, ...ACCOUNT_DEFAULTS, ...preferences }
  writeStored(ACCOUNT_STORAGE_KEY, accountPart(next))
  commit(next)

  // A escolha herdada do toggle antigo vence o padrão que o servidor mandou, e
  // sobe agora: é a única vez em que o espelho tem razão contra o banco.
  if (migratedLegacyTheme !== null) {
    const theme = migratedLegacyTheme
    migratedLegacyTheme = null
    if (theme !== next.theme) setPreference({ theme })
  }
}

export function setPreferencesCsrfToken(token: string) {
  csrfToken = token
}

/**
 * O estado de quando a central foi aberta, guardado para o Descartar.
 *
 * Enquanto ele existe estamos em rascunho: mudar uma preferência aplica na tela
 * - o tema tem de escurecer para ser escolhido - mas nada desce para o disco
 * nem sobe para o banco. Quem grava é o Salvar da barra.
 */
let draftBaseline: Preferences | null = null

export function beginPreferencesDraft() {
  if (draftBaseline === null) draftBaseline = state
}

/** Sai do modo rascunho. Chamado ao fechar a central, já sem pendência. */
export function endPreferencesDraft() {
  draftBaseline = null
  saveError = ""
}

/** Sujo é o rascunho diferir do último ponto salvo. */
export function isPreferencesDraftDirty(): boolean {
  return draftBaseline !== null && JSON.stringify(draftBaseline) !== JSON.stringify(state)
}

/**
 * Devolve a tela ao último ponto salvo.
 *
 * O rascunho continua aberto: a central segue na tela, e o que for mexido
 * depois disto também precisa passar pela barra.
 */
export function discardPreferencesDraft() {
  if (draftBaseline === null) return

  const baseline = draftBaseline
  saveError = ""
  commit(baseline)
  draftBaseline = state
}

/**
 * Grava o rascunho: servidor primeiro, espelho depois.
 *
 * Nessa ordem de propósito. O espelho é o que a tela lê antes de qualquer
 * requisição, no próximo carregamento - escrevê-lo antes da confirmação faria
 * uma escolha recusada pelo servidor, e depois descartada aqui, voltar sozinha
 * na recarga seguinte.
 *
 * Sem o adiamento que existia quando cada clique gravava: aqui o envio é um só,
 * pedido de propósito, e quem chamou precisa saber se deu certo. Falhando, a
 * marca d'água não anda e a barra continua oferecendo o Salvar.
 */
export async function commitPreferencesDraft(): Promise<void> {
  if (!isPreferencesDraftDirty()) return

  const saved = state

  try {
    await postJson<{ preferences: AccountPreferences }>("/backend/api/preferences-save.php", {
      csrfToken,
      preferences: accountPart(saved),
    })
  } catch (error) {
    saveError = error instanceof Error ? error.message : "Não foi possível salvar as preferências."
    emit()
    throw error
  }

  writeStored(ACCOUNT_STORAGE_KEY, accountPart(saved))
  writeStored(DEVICE_STORAGE_KEY, devicePart(saved))

  // O ponto salvo passa a ser este: daqui em diante, sujo é o que mudar a
  // partir de agora.
  draftBaseline = saved
  saveError = ""
  emit()
}

/**
 * Muda uma ou mais preferências.
 *
 * Em rascunho (central aberta), só aplica na tela. Fora dele - o atalho de modo
 * escuro no menu do perfil é o único caso - aplica, grava no espelho e envia,
 * porque ali não existe barra nenhuma para confirmar depois.
 */
export function setPreference(patch: Partial<Preferences>) {
  const next = { ...state, ...patch }
  // Comparado antes do commit: depois dele `state` já é `next`, e a conta daria
  // sempre "nada mudou".
  const accountChanged = JSON.stringify(accountPart(next)) !== JSON.stringify(accountPart(state))
  saveError = ""
  commit(next)

  if (draftBaseline !== null) return

  writeStored(ACCOUNT_STORAGE_KEY, accountPart(next))
  writeStored(DEVICE_STORAGE_KEY, devicePart(next))
  if (!accountChanged) return

  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    void postJson<{ preferences: AccountPreferences }>("/backend/api/preferences-save.php", {
      csrfToken,
      preferences: accountPart(state),
    })
      .then(() => {
        saveError = ""
        emit()
      })
      .catch((error: unknown) => {
        saveError = error instanceof Error ? error.message : "Não foi possível salvar as preferências."
        emit()
      })
  }, 600)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = () => state
const saveErrorSnapshot = () => saveError

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * O aviso de que a última gravação não chegou ao servidor.
 *
 * Hook próprio, e não um campo de `usePreferences`: quando a requisição falha,
 * as preferências em si não mudaram: o `useSyncExternalStore` compararia o mesmo
 * objeto, desistiria de renderizar, e o aviso nunca apareceria na tela.
 */
export function usePreferencesSaveError(): string {
  return useSyncExternalStore(subscribe, saveErrorSnapshot, saveErrorSnapshot)
}

const draftDirtySnapshot = () => isPreferencesDraftDirty()

/** Se o rascunho de preferências tem algo a salvar. Alimenta a barra. */
export function usePreferencesDraftDirty(): boolean {
  return useSyncExternalStore(subscribe, draftDirtySnapshot, draftDirtySnapshot)
}

/** Para quem lê fora do React - o Lenis, por exemplo. */
export function currentPreferences(): Preferences {
  return state
}

export function onPreferencesChange(listener: () => void) {
  return subscribe(listener)
}
