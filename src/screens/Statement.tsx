import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, EmptyState } from '../components/Card'
import { MonthHeader } from '../components/ScreenHeader'
import { db, loadPluggySettings } from '../db/instance'
import { monthStatement, type StatementEntry } from '../domain/statement'
import { formatDateTime, formatDay, formatMoney } from '../lib/format'
import type { YearMonth } from '../lib/month'
import { syncNow, useSyncRunning } from '../sync/runSync'

interface StatementProps {
  month: YearMonth
  onMonthChange: (month: YearMonth) => void
  onOpenBanks: () => void
}

export function Statement({ month, onMonthChange, onOpenBanks }: StatementProps) {
  const { t } = useTranslation()
  const settings = useLiveQuery(async () => (await loadPluggySettings()) ?? null, [])
  const data = useLiveQuery(
    async () => ({
      accounts: await db.accounts.toArray(),
      transactions: await db.transactions.toArray(),
      bills: await db.bills.toArray(),
    }),
    [],
  )
  const entries = useMemo(() => (data ? monthStatement(month, data) : []), [data, month])

  let body
  if (settings === null) {
    body = (
      <Card className="px-6 py-10 text-center">
        <h2 className="text-[21px] font-semibold tracking-[0.011em]">{t('statement.notConfiguredTitle')}</h2>
        <p className="mt-1 text-[15px] text-ink-2">{t('statement.notConfiguredBody')}</p>
        <button type="button" onClick={onOpenBanks} className="mt-5 rounded-full bg-accent px-5 py-2.5 text-white active:opacity-80">
          {t('statement.configure')}
        </button>
      </Card>
    )
  } else if (data && entries.length === 0) {
    body = <EmptyState title={t('statement.emptyTitle')} body={t('statement.emptyBody')} />
  } else {
    body = <DayGroups entries={entries} />
  }

  return (
    <>
      <MonthHeader eyebrow={t('tabs.statement')} month={month} onChange={onMonthChange} />
      {settings && <SyncStatus />}
      {body}
    </>
  )
}

function SyncStatus() {
  const { t, i18n } = useTranslation()
  const running = useSyncRunning()
  const connections = useLiveQuery(() => db.connections.toArray(), [])
  const failed = connections?.some((c) => c.error)
  const synced = connections?.map((c) => c.syncedAt).filter((s): s is string => Boolean(s)).sort()[0]

  let text = ''
  if (running) text = t('statement.updating')
  else if (failed) text = t('statement.updateFailed')
  else if (synced) text = t('statement.updatedAt', { when: formatDateTime(synced, i18n.language) })

  return (
    <div className="-mt-3 mb-4 flex items-center justify-between gap-4 text-[13px] tracking-normal">
      <span className={failed && !running ? 'text-warning' : 'text-ink-2'}>{text}</span>
      <button type="button" onClick={() => void syncNow()} disabled={running} className="text-accent disabled:opacity-40">
        {t('statement.refresh')}
      </button>
    </div>
  )
}

/** Lançamentos agrupados por dia, do mais recente para o mais antigo. */
function DayGroups({ entries }: { entries: StatementEntry[] }) {
  const { i18n } = useTranslation()
  const days: { date: string; entries: StatementEntry[] }[] = []
  for (const entry of entries) {
    const last = days.at(-1)
    if (last?.date === entry.tx.date) last.entries.push(entry)
    else days.push({ date: entry.tx.date, entries: [entry] })
  }

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section key={day.date}>
          <h2 className="px-1 pb-1.5 text-[13px] font-semibold tracking-normal text-ink-2">{formatDay(day.date, i18n.language)}</h2>
          <div className="divide-y-[0.5px] divide-separator overflow-hidden rounded-2xl bg-card">
            {day.entries.map((entry) => (
              <EntryRow key={entry.tx.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function EntryRow({ entry: { tx, account } }: { entry: StatementEntry }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const details = [
    account.last4 ? `${account.name} •${account.last4}` : account.name,
    tx.card?.installment && `${tx.card.installment.number}/${tx.card.installment.total}`,
    tx.foreign && formatMoney(tx.foreign.amount, locale, { currency: tx.foreign.currency }),
    tx.status === 'pending' && t('statement.pending'),
  ].filter(Boolean)

  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate">{tx.merchant ?? tx.description}</p>
        <p className="truncate text-[13px] tracking-normal text-ink-2">{details.join(' · ')}</p>
      </div>
      <p className={`shrink-0 tabular-nums ${tx.amount > 0 ? 'text-positive' : ''}`}>
        {formatMoney(tx.amount, locale, { signed: tx.amount > 0 })}
      </p>
    </div>
  )
}
