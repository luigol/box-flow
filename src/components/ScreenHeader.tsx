import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { addMonths, formatMonth, type YearMonth } from '../lib/month'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

/** Título grande, como nos apps do iPhone. `eyebrow` é o nome da tela, acima do título. */
export function ScreenHeader({ eyebrow, title, trailing }: { eyebrow?: string; title: string; trailing?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4 pb-5">
      <div>
        {eyebrow && <p className="text-[14px] font-semibold tracking-[-0.016em] text-ink-2">{eyebrow}</p>}
        <h1 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.011em]">{title}</h1>
      </div>
      {trailing}
    </header>
  )
}

export function MonthHeader({
  eyebrow,
  month,
  onChange,
}: {
  eyebrow: string
  month: YearMonth
  onChange: (month: YearMonth) => void
}) {
  const { t, i18n } = useTranslation()
  const step = 'grid size-9 place-items-center rounded-full bg-card-pressed text-ink active:opacity-70'

  return (
    <ScreenHeader
      eyebrow={eyebrow}
      title={formatMonth(month, i18n.language)}
      trailing={
        <div className="flex gap-2 pb-1">
          <button type="button" className={step} aria-label={t('month.previous')} onClick={() => onChange(addMonths(month, -1))}>
            <ChevronLeftIcon />
          </button>
          <button type="button" className={step} aria-label={t('month.next')} onClick={() => onChange(addMonths(month, 1))}>
            <ChevronRightIcon />
          </button>
        </div>
      }
    />
  )
}
