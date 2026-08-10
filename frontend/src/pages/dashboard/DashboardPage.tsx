/**
 * Conteúdo do painel do dashboard. A moldura e o cabeçalho vêm do AppShell
 * montado em App.tsx, que permanece o mesmo entre as telas internas.
 */
export function DashboardPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[clamp(30px,2.4vw,43px)] font-medium leading-none">Dashboard</h1>
      </div>
      <div className="mt-8 flex-1 rounded-[18px] border border-black/5 bg-transparent" aria-hidden="true" />
    </>
  )
}
