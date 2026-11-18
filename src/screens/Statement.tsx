import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, EmptyState } from '../components/Card'
import { CategorySheet } from '../components/CategorySheet'
import { CommitmentSheet } from '../components/CommitmentSheet'
import { MonthHeader } from '../components/ScreenHeader'
import { useClassification } from '../db/classification'
import { OccurrenceSheet } from '../components/OccurrenceSheet'
import { db, loadPluggySettings } from '../db/instance'
import { useReconciliation } from '../db/reconciliation'
import { categoryName, classify, TRANSFER, type Category } from '../domain/category'
import type { Commitment, Occurrence } from '../domain/commitment'
import { forecastFor, forecastTotals } from '../domain/forecast'
import type { ReconciledOccurrence } from '../domain/reconcile'
import { monthStatement, monthTotals, type StatementEntry } from '../domain/statement'
import { formatDateTime, formatDay, formatMoney } from '../lib/format'
import type { YearMonth } from '../lib/month'
import { syncNow, useSyncRunning } from '../sync/runSync'

interface StatementProps {
  month: YearMonth
  onMonthChange: (month: YearMonth) => void
  onOpenBanks: () => void
}

/** Item do extrato: lançamento do banco ou previsto de um compromisso. */
type Item =
  | { kind: 'tx'; date: string; entry: StatementEntry }
  | { kind: 'forecast'; date: string; occurrence: ReconciledOccurrence; commitment: Commitment }

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
  const reconciliation = useReconciliation()
  const commitments = reconciliation?.commitments
  const classification = useClassification()
  const [editing, setEditing] = useState<StatementEntry | null>(null)
  const [editingCommitment, setEditingCommitment] = useState<Commitment | null>(null)
  const [creatingFrom, setCreatingFrom] = useState<{ entry: StatementEntry; categoryId?: string } | null>(null)
  const [openOccurrence, setOpenOccurrence] = useState<{ occurrence: ReconciledOccurrence; commitment: Commitment } | null>(null)

  const entries = useMemo(() => (data ? monthStatement(month, data) : []), [data, month])
  const forecast = useMemo(() => (reconciliation ? forecastFor(month, reconciliation.occurrences) : []), [reconciliation, month])
  // Classificação: à mão > compromisso ligado > regras (decisão Q19).
  const ctx = useMemo(
    () => classification && { ...classification.ctx, commitmentCategory: reconciliation?.commitmentCategory },
    [classification, reconciliation],
  )
  const categoryOf = useMemo(() => (entry: StatementEntry) => (ctx ? classify(entry.tx, entry.account, ctx) : undefined), [ctx])

  const items = useMemo(() => {
    const byId = new Map((commitments ?? []).map((c) => [c.id, c]))
    const list: Item[] = [
      ...entries.map((entry) => ({ kind: 'tx' as const, date: entry.tx.date, entry })),
      ...forecast.flatMap((occurrence) => {
        const commitment = byId.get(occurrence.commitmentId)
        return commitment ? [{ kind: 'forecast' as const, date: occurrence.date, occurrence, commitment }] : []
      }),
    ]
    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, forecast, commitments])

  let body
  if (settings === null && (commitments?.length ?? 0) === 0) {
    body = (
      <Card className="px-6 py-10 text-center">
        <h2 className="text-[21px] font-semibold tracking-[0.011em]">{t('statement.notConfiguredTitle')}</h2>
        <p className="mt-1 text-[15px] text-ink-2">{t('statement.notConfiguredBody')}</p>
        <button type="button" onClick={onOpenBanks} className="mt-5 rounded-full bg-accent px-5 py-2.5 text-on-accent active:opacity-80">
          {t('statement.configure')}
        </button>
      </Card>
    )
  } else if (data && items.length === 0) {
    body = <EmptyState title={t('statement.emptyTitle')} body={t('statement.emptyBody')} />
  } else {
    body = (
      <>
        <Totals entries={entries} forecast={forecast} categoryOf={categoryOf} />
        <DayGroups
          items={items}
          categories={classification?.categories ?? []}
          categoryOf={categoryOf}
          onSelect={setEditing}
          onSelectForecast={(occurrence, commitment) => setOpenOccurrence({ occurrence, commitment })}
        />
      </>
    )
  }

  return (
    <>
      <MonthHeader eyebrow={t('tabs.statement')} month={month} onChange={onMonthChange} />
      {settings && <SyncStatus />}
      {body}
      {editing && classification && ctx && (
        <CategorySheet
          entry={editing}
          categories={classification.categories}
          ctx={ctx}
          links={reconciliation?.byTx.get(editing.tx.id) ?? []}
          commitments={commitments ?? []}
          onCreateCommitment={(categoryId) => {
            setCreatingFrom({ entry: editing, ...(categoryId ? { categoryId } : {}) })
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {creatingFrom && (
        <CommitmentSheet fromTx={creatingFrom.entry.tx} fromCategoryId={creatingFrom.categoryId} onClose={() => setCreatingFrom(null)} />
      )}
      {openOccurrence && (
        <OccurrenceSheet
          occurrence={openOccurrence.occurrence}
          commitment={openOccurrence.commitment}
          onEdit={() => {
            setEditingCommitment(openOccurrence.commitment)
            setOpenOccurrence(null)
          }}
          onClose={() => setOpenOccurrence(null)}
        />
      )}
      {editingCommitment && <CommitmentSheet commitment={editingCommitment} onClose={() => setEditingCommitment(null)} />}
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

interface TotalsProps {
  entries: StatementEntry[]
  forecast: Occurrence[]
  categoryOf: (e: StatementEntry) => string | undefined
}

/** Realizado (sem transferências) e, abaixo, o que ainda está previsto no mês. */
function Totals({ entries, forecast, categoryOf }: TotalsProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const totals = monthTotals(entries, categoryOf)
  const planned = forecastTotals(forecast)
  const uncategorized = entries.filter((e) => !categoryOf(e)).length
  const withForecast = totals.net + planned.income + planned.expense

  return (
    <Card className="mb-6">
      <div className="grid grid-cols-3 gap-2">
        <Figure
          label={t('statement.income')}
          value={formatMoney(totals.income, locale)}
          tone="text-positive"
          note={planned.income ? t('statement.plusForecast', { amount: formatMoney(planned.income, locale) }) : undefined}
        />
        <Figure
          label={t('statement.expense')}
          value={formatMoney(totals.expense, locale)}
          note={planned.expense ? t('statement.plusForecast', { amount: formatMoney(planned.expense, locale) }) : undefined}
        />
        <Figure
          label={t('statement.net')}
          value={formatMoney(totals.net, locale, { signed: true })}
          tone={totals.net > 0 ? 'text-positive' : ''}
          note={forecast.length ? t('statement.withForecast', { amount: formatMoney(withForecast, locale, { signed: true }) }) : undefined}
        />
      </div>
      {uncategorized > 0 && (
        <p className="mt-3 text-[13px] tracking-normal text-ink-2">{t('statement.uncategorizedCount', { count: uncategorized })}</p>
      )}
    </Card>
  )
}

function Figure({ label, value, tone = '', note }: { label: string; value: string; tone?: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] tracking-normal text-ink-2">{label}</p>
      <p className={`truncate text-[17px] font-semibold tabular-nums ${tone}`}>{value}</p>
      {note && <p className="text-[12px] tracking-normal text-ink-2 tabular-nums">{note}</p>}
    </div>
  )
}

interface DayGroupsProps {
  items: Item[]
  categories: Category[]
  categoryOf: (e: StatementEntry) => string | undefined
  onSelect: (entry: StatementEntry) => void
  onSelectForecast: (occurrence: ReconciledOccurrence, commitment: Commitment) => void
}

/** Lançamentos e previstos agrupados por dia, do mais recente para o mais antigo. */
function DayGroups({ items, categories, categoryOf, onSelect, onSelectForecast }: DayGroupsProps) {
  const { i18n } = useTranslation()
  const days: { date: string; items: Item[] }[] = []
  for (const item of items) {
    const last = days.at(-1)
    if (last?.date === item.date) last.items.push(item)
    else days.push({ date: item.date, items: [item] })
  }
  const byId = new Map(categories.map((c) => [c.id, c]))

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section key={day.date}>
          <h2 className="px-1 pb-1.5 text-[13px] font-semibold tracking-normal text-ink-2">{formatDay(day.date, i18n.language)}</h2>
          <div className="inset-rows overflow-hidden rounded-block bg-card">
            {day.items.map((item) => {
              if (item.kind === 'forecast') {
                return (
                  <ForecastRow
                    key={`${item.commitment.id}:${item.occurrence.date}`}
                    occurrence={item.occurrence}
                    commitment={item.commitment}
                    category={item.commitment.categoryId ? byId.get(item.commitment.categoryId) : undefined}
                    onSelect={() => onSelectForecast(item.occurrence, item.commitment)}
                  />
                )
              }
              const categoryId = categoryOf(item.entry)
              return (
                <EntryRow
                  key={item.entry.tx.id}
                  entry={item.entry}
                  category={categoryId ? byId.get(categoryId) : undefined}
                  isTransfer={categoryId === TRANSFER}
                  onSelect={() => onSelect(item.entry)}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

interface EntryRowProps {
  entry: StatementEntry
  category: Category | undefined
  isTransfer: boolean
  onSelect: () => void
}

function EntryRow({ entry: { tx, account }, category, isTransfer, onSelect }: EntryRowProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const details = [
    account.last4 ? `${account.name} •${account.last4}` : account.name,
    tx.card?.installment && `${tx.card.installment.number}/${tx.card.installment.total}`,
    tx.foreign && formatMoney(tx.foreign.amount, locale, { currency: tx.foreign.currency }),
    tx.status === 'pending' && t('statement.pending'),
  ].filter(Boolean)

  return (
    <button type="button" onClick={onSelect} className="flex w-full items-start gap-3 px-4 py-2.5 text-left active:bg-card-pressed">
      <div className="min-w-0 flex-1">
        <p className="truncate">{tx.merchant ?? tx.description}</p>
        <p className="truncate text-[13px] tracking-normal text-ink-2">
          <span className={category ? 'text-ink' : 'text-warning'}>
            {category ? categoryName(category, locale) : t('statement.uncategorized')}
          </span>
          {' · '}
          {details.join(' · ')}
        </p>
      </div>
      <p className={`shrink-0 tabular-nums ${isTransfer ? 'text-ink-2' : tx.amount > 0 ? 'text-positive' : ''}`}>
        {formatMoney(tx.amount, locale, { signed: tx.amount > 0 })}
      </p>
    </button>
  )
}

interface ForecastRowProps {
  occurrence: ReconciledOccurrence
  commitment: Commitment
  category: Category | undefined
  onSelect: () => void
}

/** Previsto: texto mais claro e a marca "previsto" (ou "atrasado", em destaque; com sugestão, avisa). */
function ForecastRow({ occurrence, commitment, category, onSelect }: ForecastRowProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const late = occurrence.status === 'late'
  const details = [
    category ? categoryName(category, locale) : null,
    commitment.kind === 'installment' ? commitment.person : null,
    occurrence.installment && `${occurrence.installment.number}/${occurrence.installment.total}`,
    occurrence.suggestions.length > 0 ? t('link.suggestions') : null,
  ].filter(Boolean)

  return (
    <button type="button" onClick={onSelect} className="flex w-full items-start gap-3 px-4 py-2.5 text-left active:bg-card-pressed">
      <div className="min-w-0 flex-1">
        <p className="truncate text-ink-2">{commitment.name}</p>
        <p className="truncate text-[13px] tracking-normal text-ink-2">
          <span
            className={`rounded-full border px-1.5 py-px text-[11px] uppercase ${late ? 'border-warning text-warning' : 'border-separator'}`}
          >
            {late ? t('link.late') : t('statement.forecast')}
          </span>
          {details.length > 0 && ` · ${details.join(' · ')}`}
        </p>
      </div>
      <p className={`shrink-0 tabular-nums text-ink-2 ${occurrence.amount > 0 ? 'opacity-90' : ''}`}>
        {formatMoney(occurrence.amount, locale, { signed: occurrence.amount > 0 })}
      </p>
    </button>
  )
}
