import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../db/instance'
import { linkTransaction, skipOccurrence } from '../db/reconciliation'
import type { Commitment } from '../domain/commitment'
import type { ReconciledOccurrence } from '../domain/reconcile'
import { formatDay, formatMoney } from '../lib/format'
import { Sheet } from './Sheet'
import { TxPicker } from './TxPicker'

interface OccurrenceSheetProps {
  occurrence: ReconciledOccurrence
  commitment: Commitment
  onEdit: () => void
  onClose: () => void
}

/** Um previsto: confirmar sugestão, vincular ao extrato, "não aconteceu" ou editar o compromisso. */
export function OccurrenceSheet({ occurrence, commitment, onEdit, onClose }: OccurrenceSheetProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [picking, setPicking] = useState(false)
  const suggestions = useLiveQuery(() => db.transactions.bulkGet(occurrence.suggestions), [occurrence.suggestions.join()])

  if (picking) {
    return (
      <TxPicker
        title={t('link.pickTitle')}
        onClose={() => setPicking(false)}
        onPick={(tx) => void linkTransaction(tx.id, occurrence.key).then(onClose)}
      />
    )
  }

  return (
    <Sheet title={commitment.name} onClose={onClose}>
      <div className="px-2">
        <h2 className="text-[21px] font-semibold">{commitment.name}</h2>
        <p className="text-ink-2">
          {formatDay(occurrence.date, locale)} · {formatMoney(occurrence.amount, locale, { signed: occurrence.amount > 0 })}
        </p>
        {occurrence.status === 'late' && <p className="mt-1 text-warning">{t('link.lateBody')}</p>}
      </div>

      {suggestions && suggestions.some(Boolean) && (
        <section className="mt-4">
          <h3 className="px-4 pb-1.5 text-[13px] tracking-normal text-ink-2">{t('link.suggestions')}</h3>
          <div className="inset-rows overflow-hidden rounded-block bg-card">
            {suggestions.map(
              (tx) =>
                tx && (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{tx.merchant ?? tx.description}</p>
                      <p className="text-[13px] tracking-normal text-ink-2">
                        {formatDay(tx.date, locale)} · {formatMoney(tx.amount, locale)}
                      </p>
                    </div>
                    <button type="button" className="text-accent" onClick={() => void linkTransaction(tx.id, occurrence.key).then(onClose)}>
                      {t('link.confirm')}
                    </button>
                  </div>
                ),
            )}
          </div>
          <p className="px-4 pt-1.5 text-[13px] tracking-normal text-ink-2">{t('link.sharedHint')}</p>
        </section>
      )}

      <div className="mt-4 inset-rows overflow-hidden rounded-block bg-card">
        <button type="button" className="flex min-h-11 w-full items-center px-4 py-2.5 text-left text-accent active:bg-card-pressed" onClick={() => setPicking(true)}>
          {t('link.linkToStatement')}
        </button>
        <button
          type="button"
          className="flex min-h-11 w-full items-center px-4 py-2.5 text-left text-accent active:bg-card-pressed"
          onClick={() => void skipOccurrence(occurrence.key).then(onClose)}
        >
          {t('link.skip')}
        </button>
        <button type="button" className="flex min-h-11 w-full items-center px-4 py-2.5 text-left text-accent active:bg-card-pressed" onClick={onEdit}>
          {t('link.edit')}
        </button>
      </div>
    </Sheet>
  )
}
