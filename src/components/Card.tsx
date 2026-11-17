import type { ReactNode } from 'react'

/** Superfície branca sobre o fundo cinza: separa pelo tom, sem borda e sem sombra. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-card p-5 ${className}`}>{children}</section>
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="px-6 py-10 text-center">
      <h2 className="text-[21px] font-semibold tracking-[0.011em]">{title}</h2>
      <p className="mt-1 text-[15px] text-ink-2">{body}</p>
    </Card>
  )
}
