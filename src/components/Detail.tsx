import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { GlassButton, GlassTopBar } from './GlassTopBar'
import { ChevronLeftIcon, DisclosureIcon } from './icons'

/**
 * Tela de detalhe, como no app Carteira: entra pela direita por cima da lista (que guarda a rolagem),
 * com um botão de voltar de vidro e nenhum título. Fica abaixo das folhas.
 */
export function PushScreen({ title, onClose, escape = true, children }: { title: string; onClose: () => void; escape?: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  const [leaving, setLeaving] = useState(false)
  const close = useCallback(() => {
    // Sem animação (movimento reduzido), o fim da animação nunca chega: fecha na hora.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) onClose()
    else setLeaving(true)
  }, [onClose])

  useEffect(() => {
    if (!escape) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [escape, close])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-canvas ${leaving ? 'push-out' : 'push-in'}`}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) onClose()
      }}
    >
      <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        <GlassTopBar
          leading={
            <GlassButton label={t('detail.back')} onClick={close}>
              <ChevronLeftIcon />
            </GlassButton>
          }
        />
        {children}
      </div>
    </div>
  )
}

/** O destaque do detalhe: o valor gigante e arredondado, com o nome e a data embaixo. */
export function DetailHero({ amount, positive, title, subtitle }: { amount: string; positive: boolean; title: string; subtitle: string }) {
  return (
    <section className="pt-1.5 pb-[30px] text-center">
      <p
        className={`font-rounded text-[length:clamp(2.25rem,13vw,3.125rem)] leading-[1.05] font-bold tracking-[-0.02em] whitespace-nowrap tabular-nums ${
          positive ? 'text-positive' : ''
        }`}
      >
        {amount}
      </p>
      <p className="mt-2 break-words text-ink-2">{title}</p>
      <p className="mt-0.5 text-ink-2">{subtitle}</p>
    </section>
  )
}

/** Bloco de linhas, com separador recuado. */
export function Block({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`inset-rows overflow-hidden rounded-block bg-card ${className}`}>{children}</div>
}

/** "Estado: …" com a conta embaixo e, opcional, mais uma linha (o texto do banco, a agenda). */
export function StatusRow({ status, statusClass = '', lines }: { status: string; statusClass?: string; lines: ReactNode[] }) {
  const { t } = useTranslation()
  return (
    <div className="px-4 py-[13px] leading-[1.3]">
      <p className="font-semibold tracking-[-0.02em]">
        {t('detail.statusLabel')} <span className={statusClass}>{status}</span>
      </p>
      {lines.map((line, i) => (
        <div key={i} className="mt-0.5">
          {line}
        </div>
      ))}
    </div>
  )
}

/** Linha "Total" com o valor à direita. */
export function TotalRow({ amount, positive }: { amount: string; positive: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-[13px]">
      <span className="font-semibold tracking-[-0.02em]">{t('detail.total')}</span>
      <span className={`tabular-nums ${positive ? 'text-positive' : ''}`}>{amount}</span>
    </div>
  )
}

/** Rótulo à esquerda e valor cinza à direita; com `onClick`, abre algo e mostra a seta. */
export function InfoRow({ label, value, valueClass = 'text-ink-2', onClick }: { label: string; value: string; valueClass?: string; onClick?: () => void }) {
  const content = (
    <>
      <span className="min-w-0 flex-1">{label}</span>
      <span className={`min-w-0 truncate text-right ${valueClass}`}>{value}</span>
    </>
  )
  if (!onClick) return <div className="flex min-h-[52px] items-center gap-3 px-4 py-3">{content}</div>
  return (
    <button type="button" onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left active:bg-card-pressed">
      {content}
      <span className="shrink-0 text-ink-3">
        <DisclosureIcon />
      </span>
    </button>
  )
}

/** Ação em cápsula de largura toda, com a explicação embaixo. */
export function Action({ label, note, onClick, tone = 'default', disabled = false }: { label: string; note: string; onClick: () => void; tone?: 'default' | 'danger'; disabled?: boolean }) {
  return (
    <div className="mb-[22px]">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex min-h-[54px] w-full items-center rounded-full bg-card px-5 text-left transition-[scale] duration-300 active:scale-[0.98] active:bg-card-pressed disabled:opacity-40 ${
          tone === 'danger' ? 'text-danger' : 'text-ink'
        }`}
      >
        {label}
      </button>
      <p className="px-5 pt-2 text-[13px] leading-[1.38] tracking-normal text-ink-2">{note}</p>
    </div>
  )
}

/** Título de seção dentro do detalhe. */
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mx-4 mt-7 mb-3 text-[22px] leading-tight font-bold tracking-[-0.02em]">{title}</h2>
      {children}
    </section>
  )
}
