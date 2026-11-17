import { useTranslation } from 'react-i18next'
import { Sheet } from './Sheet'

/** Lançamento rápido. Por enquanto só o lugar dele. */
export function QuickAddSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Sheet title={t('quickAdd.title')} onClose={onClose}>
      <h2 className="px-2 text-[28px] font-semibold">{t('quickAdd.title')}</h2>
      <p className="mt-2 px-2 text-ink-2">{t('quickAdd.body')}</p>
      <button type="button" onClick={onClose} className="mt-6 px-2 text-accent">
        {t('quickAdd.close')}
      </button>
    </Sheet>
  )
}
