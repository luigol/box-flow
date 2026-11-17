import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '../components/Card'
import { MonthHeader } from '../components/ScreenHeader'
import type { YearMonth } from '../lib/month'

type Mode = 'prepaid' | 'postpaid'

export function Balance({ month, onMonthChange }: { month: YearMonth; onMonthChange: (m: YearMonth) => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('prepaid')

  const segment = (value: Mode) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`flex-1 rounded-full py-1.5 text-[14px] font-semibold tracking-[-0.016em] ${
        mode === value ? 'bg-card text-ink shadow-sm' : 'text-ink-2'
      }`}
    >
      {t(`balance.${value}`)}
    </button>
  )

  return (
    <>
      <MonthHeader eyebrow={t('tabs.balance')} month={month} onChange={onMonthChange} />
      <div className="mb-4 flex rounded-full bg-card-pressed p-0.5">
        {segment('prepaid')}
        {segment('postpaid')}
      </div>
      <Card>
        <p className="text-[40px] leading-[1.1] font-semibold tracking-[-0.003em] text-ink-2 tabular-nums">—</p>
        <p className="mt-1 text-[15px] text-ink-2">{t('balance.noData')}</p>
        <p className="mt-4 text-[15px]">{t(`balance.${mode}Hint`)}</p>
      </Card>
    </>
  )
}
