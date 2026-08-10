/**
 * Cartão de número. Quando a resposta é um valor só, ele é o gráfico — por isso
 * a taxa de satisfação aparece aqui e não como uma pizza de duas fatias.
 * Os números usam algarismos proporcionais; tabular fica para colunas.
 */
export function StatTile({ label, value, hint, hero = false, tone = "default" }: {
  label: string
  value: string | number
  hint?: string
  hero?: boolean
  tone?: "default" | "good" | "critical"
}) {
  const toneColor = tone === "good" ? "#0ca30c" : tone === "critical" ? "#d03b3b" : "#0b0b0b"

  return (
    <div className="flex flex-col justify-between rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.06)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">{label}</p>
      <p
        className={`mt-2 font-semibold leading-none ${hero ? "text-[clamp(38px,3.4vw,52px)]" : "text-[clamp(24px,2vw,32px)]"}`}
        style={{ color: toneColor }}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs leading-snug text-[#52514e]">{hint}</p>}
    </div>
  )
}
