import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { showSuggestionAgain } from '../db/discovery'
import { db } from '../db/instance'
import { Sheet } from './Sheet'

/** Sugestões de recorrente ignoradas, com "Mostrar de novo" (decisão Q25 do grill). */
export function IgnoredSuggestionsSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const ignored = useLiveQuery(() => db.ignoredSuggestions.toArray(), [])

  return (
    <Sheet title={t('ignored.title')} onClose={onClose}>
      <h2 className="px-2 text-[21px] font-semibold">{t('ignored.title')}</h2>
      <p className="mt-1 px-2 text-[15px] text-ink-2">{t('ignored.body')}</p>
      <div className="mt-4 inset-rows overflow-hidden rounded-block bg-card">
        {(ignored ?? []).map((item) => (
          <div key={item.key} className="flex min-h-11 items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate">{item.text}</p>
              <p className="text-[13px] tracking-normal text-ink-2">{item.direction === 'in' ? t('commitmentForm.in') : t('commitmentForm.out')}</p>
            </div>
            <button type="button" className="shrink-0 text-accent" onClick={() => void showSuggestionAgain(item.key)}>
              {t('ignored.showAgain')}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
