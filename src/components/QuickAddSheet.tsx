import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** Folha que sobe de baixo para o lançamento rápido. Por enquanto só o lugar dela. */
export function QuickAddSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-10 flex items-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        onClick={(event) => event.stopPropagation()}
        className="mx-auto w-full max-w-xl rounded-t-[28px] bg-card px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-separator" />
        <h2 id="quick-add-title" className="text-[28px] font-semibold">
          {t('quickAdd.title')}
        </h2>
        <p className="mt-2 text-ink-2">{t('quickAdd.body')}</p>
        <button type="button" onClick={onClose} className="mt-6 text-accent">
          {t('quickAdd.close')}
        </button>
      </div>
    </div>
  )
}
