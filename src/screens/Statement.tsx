import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/Card'
import { MonthHeader } from '../components/ScreenHeader'
import type { YearMonth } from '../lib/month'

export function Statement({ month, onMonthChange }: { month: YearMonth; onMonthChange: (m: YearMonth) => void }) {
  const { t } = useTranslation()
  return (
    <>
      <MonthHeader eyebrow={t('tabs.statement')} month={month} onChange={onMonthChange} />
      <EmptyState title={t('statement.emptyTitle')} body={t('statement.emptyBody')} />
    </>
  )
}
