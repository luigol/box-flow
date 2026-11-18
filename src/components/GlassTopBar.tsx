import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { addMonths, formatMonth, type YearMonth } from '../lib/month'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

/**
 * Topo sem barra de título, como no app Carteira: botões de vidro flutuando sobre o conteúdo,
 * que some num degradê ao passar por baixo deles.
 */
export function GlassTopBar({ leading, trailing }: { leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="scroll-edge sticky top-[env(safe-area-inset-top)] z-20 flex min-h-16 items-center justify-between gap-3 pt-1.5 pb-3">
      {leading ?? <span />}
      {trailing}
    </div>
  )
}

/** Botão redondo de vidro. */
export function GlassButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="glass glass-press grid size-[46px] shrink-0 place-items-center rounded-full text-ink disabled:opacity-60"
    >
      {children}
    </button>
  )
}

/** Cápsula de vidro com o mês e as setas para trocar. */
export function MonthCapsule({ month, onChange }: { month: YearMonth; onChange: (month: YearMonth) => void }) {
  const { t, i18n } = useTranslation()
  const step = 'grid size-[38px] place-items-center rounded-full'
  return (
    <div className="glass glass-group flex h-[46px] items-center rounded-full px-[5px] text-ink">
      <button type="button" className={step} aria-label={t('month.previous')} onClick={() => onChange(addMonths(month, -1))}>
        <ChevronLeftIcon />
      </button>
      <span className="min-w-24 px-1 text-center font-semibold tracking-[-0.02em]">{formatMonth(month, i18n.language)}</span>
      <button type="button" className={step} aria-label={t('month.next')} onClick={() => onChange(addMonths(month, 1))}>
        <ChevronRightIcon />
      </button>
    </div>
  )
}
