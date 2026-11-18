import type { ReactNode } from 'react'
import { ChevronRightIcon } from './icons'

/** Lista agrupada como no app Ajustes do iPhone. */
export function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      {title && <h2 className="px-4 pb-1.5 text-[13px] tracking-normal text-ink-2">{title}</h2>}
      <div className="inset-rows overflow-hidden rounded-block bg-card">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-[13px] tracking-normal text-ink-2">{footer}</p>}
    </section>
  )
}

export function Row({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
      <span>{label}</span>
      <span className="text-right text-ink-2">{children}</span>
    </div>
  )
}

/** Linha que abre outra tela, com a seta à direita. */
export function LinkRow({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left active:bg-card-pressed">
      <span className="flex-1">{label}</span>
      {value && <span className="text-ink-2">{value}</span>}
      <span className="text-ink-2 opacity-60 [&_svg]:size-4">
        <ChevronRightIcon />
      </span>
    </button>
  )
}
