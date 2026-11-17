import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/Card'
import { MonthHeader } from '../components/ScreenHeader'
import type { YearMonth } from '../lib/month'

export function Commitments({ month, onMonthChange }: { month: YearMonth; onMonthChange: (m: YearMonth) => void }) {
  const { t } = useTranslation()
  return (
    <>
      <MonthHeader eyebrow={t('tabs.commitments')} month={month} onChange={onMonthChange} />
      <EmptyState title={t('commitments.emptyTitle')} body={t('commitments.emptyBody')} />
    </>
  )
}
