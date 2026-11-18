import type { ReactNode } from 'react'

/** Etiqueta retangular ao lado de um texto: previsto, parcela (cinza) ou atrasado (laranja). */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' }) {
  return (
    <span
      className={`ml-1.5 inline-block rounded-[5px] px-1.5 py-px align-[1px] text-[12px] leading-[1.35] font-semibold tracking-normal ${
        tone === 'warning' ? 'bg-warning-tint text-warning' : 'bg-tag text-tag-ink'
      }`}
    >
      {children}
    </span>
  )
}
