import type { ReactNode } from 'react'
import { DisclosureIcon } from './icons'

/** Seta pequena das linhas que abrem algo. */
export function Disclosure() {
  return (
    <span className="shrink-0 pt-[5px] text-ink-3">
      <DisclosureIcon />
    </span>
  )
}

interface ListRowProps {
  title: string
  /** Previsto: título em cinza. */
  muted?: boolean
  line1: ReactNode
  line2?: ReactNode
  amount: string
  /** Entrada: valor em verde. */
  positive: boolean
  /** Sem `onClick`, a linha só mostra (sem seta). */
  onClick?: () => void
  /** Algo embaixo do texto: botões de uma sugestão, barra de andamento. */
  children?: ReactNode
}

/**
 * Linha no estilo do app Carteira (docs/design.md, "Visual"): nome em semibold, duas linhas cinza
 * sem "·", valor cinza sem negrito e seta.
 */
export function ListRow({ title, muted = false, line1, line2, amount, positive, onClick, children }: ListRowProps) {
  const content = (
    <>
      <div className="min-w-0 flex-1 leading-[1.3]">
        <p className={`truncate font-semibold tracking-[-0.02em] ${muted ? 'text-ink-2' : ''}`}>{title}</p>
        <p className="mt-0.5 truncate text-[15px] tracking-[-0.012em] text-ink-2">{line1}</p>
        {line2 && <p className="truncate text-[15px] tracking-[-0.012em] text-ink-2">{line2}</p>}
        {children}
      </div>
      <p className={`shrink-0 pt-0.5 text-[15px] tracking-[-0.012em] tabular-nums ${positive ? 'text-positive' : 'text-ink-2'}`}>{amount}</p>
    </>
  )
  if (!onClick) return <div className="flex w-full items-start gap-2.5 px-4 py-[13px]">{content}</div>
  return (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-2.5 px-4 py-[13px] text-left active:bg-card-pressed">
      {content}
      <Disclosure />
    </button>
  )
}
