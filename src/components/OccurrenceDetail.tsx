import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../db/instance'
import { linkTransaction, skipOccurrence } from '../db/reconciliation'
import type { BankAccount } from '../domain/bank'
import { categoryName, type Category } from '../domain/category'
import type { Commitment } from '../domain/commitment'
import type { ReconciledOccurrence } from '../domain/reconcile'
import { formatMoney, formatShortDate } from '../lib/format'
import { Action, Block, DetailHero, DetailSection, InfoRow, PushScreen, StatusRow, TotalRow } from './Detail'
import { TxPicker } from './TxPicker'

interface OccurrenceDetailProps {
  occurrence: ReconciledOccurrence
  commitment: Commitment
  category: Category | undefined
  account: BankAccount | undefined
  onEdit: () => void
  onClose: () => void
}

/** Detalhe de um previsto: confirmar sugestão, vincular ao extrato, "não aconteceu" ou editar o compromisso. */
export function OccurrenceDetail({ occurrence, commitment, category, account, onEdit, onClose }: OccurrenceDetailProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [picking, setPicking] = useState(false)
  const suggestions = useLiveQuery(() => db.transactions.bulkGet(occurrence.suggestions), [occurrence.suggestions.join()])

  const late = occurrence.status === 'late'
  const amount = formatMoney(Math.abs(occurrence.amount), locale, { signed: occurrence.amount > 0 })
  const positive = occurrence.amount > 0
  let schedule: string
  if (commitment.kind === 'installment') {
    schedule = occurrence.installment
      ? t('detail.installmentSchedule', { number: occurrence.installment.number, total: occurrence.installment.total })
      : t('commitments.done')
  } else if (commitment.frequency === 'yearly') {
    schedule = t('commitments.yearly', { date: `${String(commitment.day).padStart(2, '0')}/${String(commitment.start.month).padStart(2, '0')}` })
  } else {
    schedule = t('commitments.monthly', { day: commitment.day })
  }

  return (
    <>
      <PushScreen title={commitment.name} onClose={onClose} escape={!picking}>
        <DetailHero amount={amount} positive={positive} title={commitment.name} subtitle={t('detail.expectedOn', { date: formatShortDate(occurrence.date, locale) })} />

        <Block>
          <StatusRow
            status={late ? t('statement.late') : t('statement.forecast')}
            statusClass={late ? 'text-warning' : ''}
            lines={[<p className="text-ink-2">{schedule}</p>]}
          />
          <TotalRow amount={amount} positive={positive} />
        </Block>

        <Block className="mt-3.5">
          <InfoRow label={t('detail.category')} value={category ? categoryName(category, locale) : t('statement.uncategorized')} />
          {commitment.kind === 'installment' && <InfoRow label={t('detail.person')} value={commitment.person} />}
          {account && <InfoRow label={t('detail.account')} value={account.last4 ? `${account.name} •${account.last4}` : account.name} />}
        </Block>

        {suggestions && suggestions.some(Boolean) && (
          <DetailSection title={t('link.suggestions')}>
            <Block>
              {suggestions.map(
                (tx) =>
                  tx && (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-[13px]">
                      <div className="min-w-0 flex-1 leading-[1.3]">
                        <p className="truncate font-semibold tracking-[-0.02em]">{tx.merchant ?? tx.description}</p>
                        <p className="text-[15px] text-ink-2">{formatShortDate(tx.date, locale)}</p>
                      </div>
                      <span className="text-[15px] text-ink-2 tabular-nums">{formatMoney(Math.abs(tx.amount), locale)}</span>
                      <button
                        type="button"
                        onClick={() => void linkTransaction(tx.id, occurrence.key).then(onClose)}
                        className="h-8 shrink-0 rounded-full bg-accent px-4 text-[15px] font-semibold text-on-accent active:opacity-80"
                      >
                        {t('link.confirm')}
                      </button>
                    </div>
                  ),
              )}
            </Block>
            <p className="px-4 pt-2 text-[13px] leading-[1.38] tracking-normal text-ink-2">{t('link.sharedHint')}</p>
          </DetailSection>
        )}

        <div className="mt-7">
          <Action
            label={t('link.linkToStatement')}
            note={late ? `${t('detail.lateNote')} ${t('detail.linkToStatementNote')}` : t('detail.linkToStatementNote')}
            onClick={() => setPicking(true)}
          />
          <Action label={t('link.skip')} note={t('detail.skipNote')} onClick={() => void skipOccurrence(occurrence.key).then(onClose)} />
          <Action label={t('link.edit')} note={t('detail.editNote')} onClick={onEdit} />
        </div>
      </PushScreen>

      {picking && (
        <TxPicker title={t('link.pickTitle')} onClose={() => setPicking(false)} onPick={(tx) => void linkTransaction(tx.id, occurrence.key).then(onClose)} />
      )}
    </>
  )
}
