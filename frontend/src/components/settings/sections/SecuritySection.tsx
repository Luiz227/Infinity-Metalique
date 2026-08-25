import { useCallback, useState } from "react"
import { Eye, EyeOff } from "lucide-react"

import { useDraftSection } from "@/components/settings/SettingsDraft"
import { SettingsFeedback, SettingsGroup, SettingsRow } from "@/components/settings/SettingsRow"
import { Input } from "@/components/ui/input"
import { postJson } from "@/lib/api"
import type { ApiResponse } from "@/types"

function PasswordInput({ id, label, value, autoComplete, onChange }: {
  id: string
  label: string
  value: string
  autoComplete: string
  onChange: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative w-[min(18rem,60vw)]">
      <Input
        id={id}
        className="h-10 pr-11"
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-label={label}
        maxLength={72}
      />
      <button
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-full text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/35"
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        title={visible ? "Ocultar senha" : "Mostrar senha"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

/**
 * A troca de senha, que era a segunda aba do antigo diálogo "Meu perfil".
 *
 * Aqui a senha também é rascunho: os três campos ficam preenchidos e a troca
 * acontece no Salvar da barra, junto do resto. Qualquer campo preenchido já
 * conta como pendência - meio formulário abandonado não pode passar batido.
 *
 * A conferência de tamanho e de igualdade é feita antes de enviar, para o erro
 * aparecer aqui e não como uma recusa genérica na barra. A regra de conteúdo
 * (número, caractere especial) continua sendo do servidor, que é quem manda.
 */
export function SecuritySection({ csrfToken }: { csrfToken: string }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const isDirty = currentPassword !== "" || newPassword !== "" || confirmation !== ""

  const clear = useCallback(() => {
    setCurrentPassword("")
    setNewPassword("")
    setConfirmation("")
  }, [])

  const save = useCallback(async () => {
    setError("")
    setNotice("")

    if (currentPassword === "" || newPassword === "" || confirmation === "") {
      setError("Preencha os três campos para trocar a senha, ou limpe-os para não trocá-la.")
      throw new Error("campos incompletos")
    }
    if (newPassword.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.")
      throw new Error("senha curta")
    }
    if (newPassword !== confirmation) {
      setError("A confirmação não confere com a nova senha.")
      throw new Error("confirmação diferente")
    }

    try {
      const payload = await postJson<ApiResponse>("/backend/api/password-change.php", {
        currentPassword, newPassword, confirmation, csrfToken,
      })
      clear()
      setNotice(payload.message || "Senha alterada com sucesso.")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
      throw requestError
    }
  }, [clear, confirmation, csrfToken, currentPassword, newPassword])

  const discard = useCallback(() => {
    clear()
    setError("")
    setNotice("")
  }, [clear])

  useDraftSection({ id: "seguranca", isDirty, save, discard })

  return (
    <div className="grid gap-5">
      <SettingsFeedback error={error} notice={notice} />

      <SettingsGroup
        title="Senha"
        description="Pelo menos 8 caracteres, com um número e um caractere especial. Deixe os campos vazios para não trocar nada."
      >
        <SettingsRow
          label="Senha atual"
          description="Para sua segurança, confirme a senha atual antes de cadastrar uma nova."
          htmlFor="settings-current-password"
          control={
            <PasswordInput
              id="settings-current-password"
              label="Senha atual"
              value={currentPassword}
              autoComplete="current-password"
              onChange={setCurrentPassword}
            />
          }
        />
        <SettingsRow
          label="Nova senha"
          htmlFor="settings-new-password"
          control={
            <PasswordInput
              id="settings-new-password"
              label="Nova senha"
              value={newPassword}
              autoComplete="new-password"
              onChange={setNewPassword}
            />
          }
        />
        <SettingsRow
          label="Confirmar nova senha"
          htmlFor="settings-confirm-password"
          control={
            <PasswordInput
              id="settings-confirm-password"
              label="Confirmar nova senha"
              value={confirmation}
              autoComplete="new-password"
              onChange={setConfirmation}
            />
          }
        />
      </SettingsGroup>
    </div>
  )
}
