import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/Card'
import { CommitmentSheet } from '../components/CommitmentSheet'
import { ScreenHeader } from '../components/ScreenHeader'
import { useCommitments } from '../db/commitments'
import { db } from '../db/instance'
import { categoryName } from '../domain/category'
import { occurrences, type Commitment, type Occurrence } from '../domain/commitment'
import type { StoredBillLike } from '../domain/commitmentTypes'
import { formatMoney } from '../lib/format'
import { addMonths, currentMonth, dateInMonth } from '../lib/month'

/** Aba Compromissos: lista, sem troca de mês (docs/design.md, "Compromisso"). */
export function Commitments() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const commitments = useCommitments()
  const bills = useLiveQuery(() => db.bills.toArray(), []) ?? []
  const categories = new Map((useLiveQuery(() => db.categories.toArray(), []) ?? []).map((c) => [c.id, c]))
  const [editing, setEditing] = useState<Commitment | 'new' | null>(null)

  const upcoming = (c: Commitment) => nextOccurrences(c, bills)
  const recurringOut = (commitments ?? []).filter((c) => c.kind === 'recurring' && c.direction === 'out')
  const recurringIn = (commitments ?? []).filter((c) => c.kind === 'recurring' && c.direction === 'in')
  const installments = (commitments ?? []).filter((c) => c.kind === 'installment')

  // "Devo a Fulano: R$ X" = parcelas que ainda vão cair.
  const owed = new Map<string, number>()
  for (const c of installments) {
    if (c.kind !== 'installment') continue
    owed.set(c.person, (owed.get(c.person) ?? 0) + upcoming(c).reduce((s, o) => s - o.amount, 0))
  }

  const row = (c: Commitment) => {
    const next = upcoming(c)
    const category = c.categoryId ? categories.get(c.categoryId) : undefined
    let schedule: string
    if (c.kind === 'installment') {
      schedule = next[0]?.installment ? t('commitments.installmentOf', next[0].installment) : t('commitments.done')
    } else if (c.frequency === 'yearly') {
      schedule = t('commitments.yearly', { date: `${String(c.day).padStart(2, '0')}/${String(c.start.month).padStart(2, '0')}` })
    } else {
      schedule = t('commitments.monthly', { day: c.day })
    }
    const details = [
      c.kind === 'installment' ? c.person : null,
      schedule,
      category ? categoryName(category, locale) : null,
      c.kind === 'recurring' && c.end && next.length === 0 ? t('commitments.ended') : null,
      next[0] ? t('commitments.next', { date: shortDate(next[0].date) }) : null,
    ].filter(Boolean)
    return (
      <button key={c.id} type="button" onClick={() => setEditing(c)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left active:bg-card-pressed">
        <div className="min-w-0 flex-1">
          <p className="truncate">{c.name}</p>
          <p className="truncate text-[13px] tracking-normal text-ink-2">{details.join(' · ')}</p>
        </div>
        <p className={`shrink-0 tabular-nums ${c.direction === 'in' ? 'text-positive' : ''}`}>
          {formatMoney(c.direction === 'in' ? c.amount : -c.amount, locale, { signed: c.direction === 'in' })}
        </p>
      </button>
    )
  }

  const section = (title: string, list: Commitment[], footer?: string[]) =>
    list.length > 0 && (
      <section className="mb-7">
        <h2 className="px-4 pb-1.5 text-[13px] tracking-normal text-ink-2 uppercase">{title}</h2>
        <div className="divide-y-[0.5px] divide-separator overflow-hidden rounded-2xl bg-card">{list.map(row)}</div>
        {footer?.map((line) => (
          <p key={line} className="px-4 pt-1.5 text-[13px] tracking-normal text-ink-2">
            {line}
          </p>
        ))}
      </section>
    )

  return (
    <>
      <ScreenHeader
        title={t('tabs.commitments')}
        trailing={
          <button type="button" onClick={() => setEditing('new')} className="mb-1 rounded-full bg-accent px-4 py-2 text-[15px] text-white active:opacity-80">
            {t('commitments.add')}
          </button>
        }
      />
      {commitments && commitments.length === 0 && <EmptyState title={t('commitments.emptyTitle')} body={t('commitments.emptyBody')} />}
      {section(t('commitments.recurring'), recurringOut)}
      {section(t('commitments.income'), recurringIn)}
      {section(
        t('commitments.installments'),
        installments,
        [...owed].filter(([, v]) => v > 0).map(([person, value]) => t('commitments.owe', { person, amount: formatMoney(value, locale) })),
      )}
      {editing && <CommitmentSheet commitment={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** Ocorrências de hoje em diante, dentro do horizonte (parcelas: até a última). */
function nextOccurrences(c: Commitment, bills: StoredBillLike[]): Occurrence[] {
  const today = new Date()
  const todayIso = dateInMonth(currentMonth(today), today.getDate())
  return occurrences(c, { until: addMonths(currentMonth(today), 12), bills }).filter((o) => o.date >= todayIso)
}

function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}
