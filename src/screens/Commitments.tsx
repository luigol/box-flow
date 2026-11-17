import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/Card'
import { CommitmentSheet } from '../components/CommitmentSheet'
import { PlusIcon } from '../components/icons'
import { ScreenHeader } from '../components/ScreenHeader'
import { useCommitments } from '../db/commitments'
import { db } from '../db/instance'
import { useReconciliation } from '../db/reconciliation'
import { categoryName } from '../domain/category'
import type { Commitment } from '../domain/commitment'
import { formatMoney } from '../lib/format'

/** Aba Compromissos: lista, sem troca de mês (docs/design.md, "Compromisso"). */
export function Commitments() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const commitments = useCommitments()
  const reconciliation = useReconciliation()
  const categories = new Map((useLiveQuery(() => db.categories.toArray(), []) ?? []).map((c) => [c.id, c]))
  const [editing, setEditing] = useState<Commitment | 'new' | null>(null)

  // O que ainda vai (ou deveria ter) acontecer: pendentes e atrasados, por data.
  const upcoming = (c: Commitment) =>
    (reconciliation?.occurrences ?? [])
      .filter((o) => o.commitmentId === c.id && (o.status === 'pending' || o.status === 'late'))
      .sort((a, b) => a.date.localeCompare(b.date))
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
    const late = next.filter((o) => o.status === 'late').length
    const pending = next.find((o) => o.status === 'pending')
    const details = [
      c.kind === 'installment' ? c.person : null,
      schedule,
      category ? categoryName(category, locale) : null,
      c.kind === 'recurring' && c.end && next.length === 0 ? t('commitments.ended') : null,
      pending ? t('commitments.next', { date: shortDate(pending.date) }) : null,
    ].filter(Boolean)
    return (
      <button key={c.id} type="button" onClick={() => setEditing(c)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left active:bg-card-pressed">
        <div className="min-w-0 flex-1">
          <p className="truncate">{c.name}</p>
          <p className="truncate text-[13px] tracking-normal text-ink-2">
            {late > 0 && <span className="text-warning">{t('link.late')} · </span>}
            {details.join(' · ')}
          </p>
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
          <button
            type="button"
            onClick={() => setEditing('new')}
            aria-label={t('commitments.add')}
            className="mb-1 grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white active:opacity-80 [&_svg]:size-5"
          >
            <PlusIcon />
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

function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}
