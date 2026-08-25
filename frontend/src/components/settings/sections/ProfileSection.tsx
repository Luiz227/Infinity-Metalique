import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react"
import { Camera, Crop, LoaderCircle, UserRound } from "lucide-react"

import { ImageCropper } from "@/components/common/ImageCropper"
import { useDraftSection } from "@/components/settings/SettingsDraft"
import { SettingsFeedback, SettingsGroup, SettingsRow } from "@/components/settings/SettingsRow"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { postForm, postJson, profilePhotoUrl } from "@/lib/api"
import { downscaleImage, extensionFor, type PhotoCrop } from "@/lib/image"
import { cn } from "@/lib/utils"
import type { ApiResponse, User } from "@/types"

const MAX_SOURCE_BYTES = 20 * 1024 * 1024

const actionClass = "inline-flex h-9 items-center gap-2 rounded-md border border-hairline-strong px-3 text-sm font-medium text-ink transition-colors hover:bg-neutral-50"

/**
 * O que está esperando o Salvar: o recorte que vai virar avatar, o retângulo que
 * o descreve e - só quando o usuário escolheu um arquivo novo - o original de
 * onde ele saiu. `source` nulo significa "mantém o original que o servidor já
 * tem", que é exatamente o caso de quem só reposicionou.
 */
type PhotoDraft = { blob: Blob; url: string; crop: PhotoCrop; source: Blob | null }

/** A imagem aberta no recortador. A URL é criada aqui, então é revogada aqui. */
type CropperState = { url: string; initialCrop: PhotoCrop | null; source: Blob | null }

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Não foi possível carregar a foto atual.")

  return response.blob()
}

/**
 * Dados pessoais e foto. Veio do antigo diálogo "Meu perfil", que deixou de
 * existir: os mesmos endpoints, agora no formato de linhas da central.
 *
 * Nada sai daqui sozinho - nem a foto. O recorte fica guardado e só sobe no
 * Salvar da barra, então recortar e desistir não deixa rastro no servidor.
 *
 * E-mail, cargo e setor continuam só de leitura: quem muda os três é a tela de
 * Usuários, porque são eles que decidem o que a conta enxerga.
 */
export function ProfileSection({ user, csrfToken, onUserUpdated }: {
  user: User
  csrfToken: string
  onUserUpdated: (user: User) => void
}) {
  const [name, setName] = useState(user.name)
  const [nickname, setNickname] = useState(user.nickname || "")
  const [draft, setDraft] = useState<PhotoDraft | null>(null)
  const [cropper, setCropper] = useState<CropperState | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [error, setError] = useState("")
  // O estado sozinho não serve para a limpeza do desmonte: o efeito que roda no
  // fim guarda o valor do primeiro render, e as URLs seguram a imagem inteira na
  // memória enquanto a aba viver.
  const draftRef = useRef<PhotoDraft | null>(null)
  const cropperRef = useRef<CropperState | null>(null)
  const savedPhoto = profilePhotoUrl(user.profile_photo)

  const replaceDraft = useCallback((next: PhotoDraft | null) => {
    if (draftRef.current) URL.revokeObjectURL(draftRef.current.url)
    draftRef.current = next
    setDraft(next)
  }, [])

  const closeCropper = useCallback(() => {
    if (cropperRef.current) URL.revokeObjectURL(cropperRef.current.url)
    cropperRef.current = null
    setCropper(null)
  }, [])

  const openCropper = useCallback((blob: Blob, initialCrop: PhotoCrop | null, source: Blob | null) => {
    if (cropperRef.current) URL.revokeObjectURL(cropperRef.current.url)
    const next = { url: URL.createObjectURL(blob), initialCrop, source }
    cropperRef.current = next
    setCropper(next)
  }, [])

  useEffect(() => () => {
    if (draftRef.current) URL.revokeObjectURL(draftRef.current.url)
    if (cropperRef.current) URL.revokeObjectURL(cropperRef.current.url)
  }, [])

  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    event.target.value = ""
    setError("")
    if (!file) return

    if (file.size > MAX_SOURCE_BYTES) {
      setError("Escolha uma imagem de até 20 MB.")
      return
    }

    setIsPreparing(true)
    try {
      // O arquivo escolhido não sobe como veio: é ele que fica guardado como
      // original, e uma foto de celular sozinha estoura o limite do servidor.
      const source = await downscaleImage(file)
      openCropper(source, null, source)
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Não foi possível ler esta imagem.")
    } finally {
      setIsPreparing(false)
    }
  }

  /**
   * Reabre o recortador sobre a melhor origem disponível, do mais fresco para o
   * mais antigo: o original escolhido agora, o original guardado no servidor e,
   * em último caso, o próprio recorte de 512 - o que sobra nas fotos enviadas
   * antes de o original passar a ser guardado.
   */
  const reposition = async () => {
    setError("")

    if (draft?.source) {
      openCropper(draft.source, draft.crop, draft.source)
      return
    }

    const remote = profilePhotoUrl(user.profile_photo_source) || savedPhoto
    if (!remote) return

    setIsPreparing(true)
    try {
      // Buscar como blob em vez de apontar a <img> para a URL: assim o canvas do
      // recorte nasce limpo em qualquer origem, e um arquivo que sumiu vira uma
      // mensagem em vez de um recortador vazio.
      const blob = await fetchBlob(remote)
      // Sem original guardado, o retângulo antigo fala de coordenadas de outra
      // imagem: melhor começar do zero do que começar torto.
      openCropper(blob, draft?.crop ?? (user.profile_photo_source ? user.profile_photo_crop : null), null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a foto atual.")
    } finally {
      setIsPreparing(false)
    }
  }

  const isDirty = name.trim() !== user.name
    || nickname !== (user.nickname || "")
    || draft !== null

  const save = useCallback(async () => {
    setError("")

    if (name.trim().length < 3) {
      setError("Informe um nome de pelo menos 3 caracteres.")
      throw new Error("nome inválido")
    }

    try {
      // A foto vai primeiro: ela é a que pode ser recusada pelo tamanho ou pelo
      // formato, e não faz sentido gravar o nome para depois falhar nela.
      if (draft) {
        const data = new FormData()
        data.append("csrfToken", csrfToken)
        data.append("profilePhoto", new File([draft.blob], `perfil.${extensionFor(draft.blob)}`, { type: draft.blob.type }))
        if (draft.source) {
          data.append("profilePhotoSource", new File([draft.source], `original.${extensionFor(draft.source)}`, { type: draft.source.type }))
        }
        // O retângulo só vale acompanhado do original a que ele se refere. Numa
        // foto antiga, que não tem original, ele descreveria um recorte que a
        // própria gravação está prestes a substituir.
        if (draft.source || user.profile_photo_source) {
          data.append("crop", JSON.stringify(draft.crop))
        }

        const uploaded = await postForm<ApiResponse>("/backend/api/profile-photo.php", data)
        if (uploaded.user) onUserUpdated(uploaded.user)
        replaceDraft(null)
      }

      if (name.trim() !== user.name || nickname !== (user.nickname || "")) {
        const payload = await postJson<ApiResponse>("/backend/api/profile-update.php", {
          name: name.trim(), nickname, csrfToken,
        })
        if (payload.user) onUserUpdated(payload.user)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
      throw requestError
    }
  }, [csrfToken, draft, name, nickname, onUserUpdated, replaceDraft, user.name, user.nickname, user.profile_photo_source])

  const discard = useCallback(() => {
    setName(user.name)
    setNickname(user.nickname || "")
    replaceDraft(null)
    closeCropper()
    setError("")
  }, [closeCropper, replaceDraft, user.name, user.nickname])

  useDraftSection({ id: "perfil", isDirty, save, discard })

  const shownPhoto = draft?.url || savedPhoto
  const photoDescription = draft
    ? draft.source
      ? "Foto nova escolhida. Ela sobe quando você salvar."
      : "Enquadramento novo. Ele sobe quando você salvar."
    : savedPhoto && !user.profile_photo_source
      ? "Esta foto é anterior ao guardado do original, então reposicionar só aproxima nela. Trocá-la uma vez devolve também o afastar."
      : "JPG, PNG ou WebP, até 20 MB. Você enquadra antes de salvar, e pode reposicionar depois quando quiser."

  return (
    <div className="grid gap-5">
      <SettingsFeedback error={error} />

      <SettingsGroup title="Identidade">
        <SettingsRow
          label="Foto de perfil"
          description={photoDescription}
          control={
            <div className="flex items-center gap-3">
              <span className={`grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border bg-neutral-100 ${draft ? "border-metalique" : "border-hairline-strong"}`}>
                {shownPhoto ? <img className="size-full object-cover" src={shownPhoto} alt="" /> : <UserRound className="size-6 text-ink-muted" />}
              </span>

              {shownPhoto && (
                <button className={cn(actionClass, "disabled:opacity-50")} type="button" onClick={() => void reposition()} disabled={isPreparing}>
                  {isPreparing ? <LoaderCircle className="size-4 animate-spin" /> : <Crop className="size-4" />} Reposicionar
                </button>
              )}

              <label className={cn(actionClass, isPreparing ? "pointer-events-none opacity-50" : "cursor-pointer")}>
                <Camera className="size-4" /> {shownPhoto ? "Trocar" : "Escolher"}
                <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void selectPhoto(event)} disabled={isPreparing} />
              </label>
            </div>
          }
        />

        <SettingsRow
          label="Nome completo"
          description="É o nome que aparece nos registros que você cria."
          htmlFor="settings-name"
          control={
            <Input
              id="settings-name"
              className="h-10 w-[min(18rem,60vw)]"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
            />
          }
        />

        <SettingsRow
          label="Apelido"
          description="Como o cabeçalho vai te chamar. Em branco, ele usa o primeiro nome."
          htmlFor="settings-nickname"
          control={
            <Input
              id="settings-nickname"
              className="h-10 w-[min(18rem,60vw)]"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={50}
              placeholder="Como prefere ser chamado"
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Conta" description="Alterados pela administração, na tela de Usuários.">
        <SettingsRow label="E-mail" control={<span className="text-sm text-ink-muted">{user.email}</span>} />
        <SettingsRow label="Cargo" control={<span className="text-sm text-ink-muted">{user.job_title || "—"}</span>} />
        <SettingsRow label="Setor" control={<span className="text-sm text-ink-muted">{user.sector || "—"}</span>} />
      </SettingsGroup>

      <Dialog open={cropper !== null} onOpenChange={(isOpen) => { if (!isOpen) closeCropper() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar foto</DialogTitle>
            <DialogDescription>Arraste para posicionar e use o zoom para enquadrar o rosto.</DialogDescription>
          </DialogHeader>
          {cropper && (
            <ImageCropper
              source={cropper.url}
              initialCrop={cropper.initialCrop}
              onConfirm={async (blob, crop) => {
                replaceDraft({ blob, url: URL.createObjectURL(blob), crop, source: cropper.source })
                closeCropper()
              }}
              onCancel={closeCropper}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
