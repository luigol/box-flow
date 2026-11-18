import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, EmptyState } from '../components/Card'
import { CommitmentSheet } from '../components/CommitmentSheet'
import { GlassButton, GlassTopBar, MonthCapsule } from '../components/GlassTopBar'
import { RefreshIcon } from '../components/icons'
import { Disclosure, ListRow as Row } from '../components/ListRow'
import { MonthBar } from '../components/MonthBar'
import { OccurrenceDetail } from '../components/OccurrenceDetail'
import { Tag } from '../components/Tag'
import { TxDetail } from '../components/TxDetail'
import { useClassification } from '../db/classification'
import { db, loadPluggySettings } from '../db/instance'
import { useReconciliation } from '../db/reconciliation'
import type { BankAccount } from '../domain/bank'
import { categoryName, classify, TRANSFER, type Category } from '../domain/category'
import type { Commitment } from '../domain/commitment'
import { forecastFor, forecastTotals } from '../domain/forecast'
import type { ReconciledOccurrence } from '../domain/reconcile'
import { monthSpending, monthStatement, monthTotals, type StatementEntry } from '../domain/statement'
import { formatDateTime, formatDay, formatMoney, formatTime } from '../lib/format'
import { localIsoDate, monthName, type YearMonth } from '../lib/month'
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

/** Extrato no estilo do app Carteira (docs/design.md, "Visual"). */
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
  const sync = useSyncInfo()
  const [reviewOnly, setReviewOnly] = useState(false)
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

  const uncategorized = useMemo(() => (ctx ? entries.filter((e) => !categoryOf(e)) : []), [ctx, entries, categoryOf])
  // "Para revisar" mostra só os sem categoria; volta ao normal sozinho quando não sobra nenhum.
  const reviewing = reviewOnly && uncategorized.length > 0

  const items = useMemo(() => {
    const byId = new Map((commitments ?? []).map((c) => [c.id, c]))
    const list: Item[] = [
      ...(reviewing ? uncategorized : entries).map((entry) => ({ kind: 'tx' as const, date: entry.tx.date, entry })),
      ...(reviewing
        ? []
        : forecast.flatMap((occurrence) => {
            const commitment = byId.get(occurrence.commitmentId)
            return commitment ? [{ kind: 'forecast' as const, date: occurrence.date, occurrence, commitment }] : []
          })),
    ]
    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, uncategorized, reviewing, forecast, commitments])

  const topBar = (
    <GlassTopBar
      leading={<MonthCapsule month={month} onChange={onMonthChange} />}
      trailing={
        settings ? (
          <GlassButton label={t('statement.refresh')} onClick={() => void syncNow()} disabled={sync.running}>
            <RefreshIcon spinning={sync.running} />
          </GlassButton>
        ) : undefined
      }
    />
  )

  let body: ReactNode = null
  if (settings === null && (commitments?.length ?? 0) === 0) {
    body = (
      <Card className="mt-2 px-6 py-10 text-center">
        <h2 className="text-[21px] font-semibold tracking-[0.011em]">{t('statement.notConfiguredTitle')}</h2>
        <p className="mt-1 text-[15px] text-ink-2">{t('statement.notConfiguredBody')}</p>
        <button type="button" onClick={onOpenBanks} className="mt-5 rounded-full bg-accent px-5 py-2.5 text-on-accent active:opacity-80">
          {t('statement.configure')}
        </button>
      </Card>
    )
  } else if (data && items.length === 0) {
    body = <EmptyState title={t('statement.emptyTitle')} body={t('statement.emptyBody')} />
  } else if (data) {
    const totals = monthTotals(entries, categoryOf)
    const planned = forecastTotals(forecast)
    body = (
      <>
        <Hero spent={-totals.expense} month={month} warning={sync.failed && !sync.running ? t('statement.updateFailed') : undefined} />
        <MonthBar
          income={totals.income}
          plannedIncome={planned.income}
          spending={monthSpending(entries, categoryOf)}
          plannedExpense={-planned.expense}
          categories={classification?.categories ?? []}
        />
        {uncategorized.length > 0 && (
          <ReviewRow count={uncategorized.length} active={reviewing} onToggle={() => setReviewOnly(!reviewing)} />
        )}
        <h2 className="mx-4 mt-7 mb-3 text-[22px] leading-tight font-bold tracking-[-0.02em]">{t('statement.entries')}</h2>
        <DayGroups
          items={items}
          accounts={data.accounts}
          categories={classification?.categories ?? []}
          categoryOf={categoryOf}
          onSelect={setEditing}
          onSelectForecast={(occurrence, commitment) => setOpenOccurrence({ occurrence, commitment })}
        />
        <SyncFootnote running={sync.running} synced={sync.synced} />
      </>
    )
  }

  return (
    <>
      {topBar}
      {body}
      {editing && classification && ctx && (
        <TxDetail
          entry={editing}
          categories={classification.categories}
          ctx={ctx}
          links={reconciliation?.byTx.get(editing.tx.id) ?? []}
          commitments={commitments ?? []}
          bills={data?.bills ?? []}
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
        <OccurrenceDetail
          occurrence={openOccurrence.occurrence}
          commitment={openOccurrence.commitment}
          category={
            openOccurrence.commitment.categoryId
              ? classification?.categories.find((c) => c.id === openOccurrence.commitment.categoryId)
              : undefined
          }
          account={openOccurrence.commitment.accountId ? data?.accounts.find((a) => a.id === openOccurrence.commitment.accountId) : undefined}
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

/** Estado da atualização com os bancos. */
function useSyncInfo() {
  const running = useSyncRunning()
  const connections = useLiveQuery(() => db.connections.toArray(), [])
  const failed = Boolean(connections?.some((c) => c.error))
  const synced = connections?.map((c) => c.syncedAt).filter((s): s is string => Boolean(s)).sort()[0]
  return { running, failed, synced }
}

/** O destaque da tela: o gasto do mês, grande e na fonte arredondada. */
function Hero({ spent, month, warning }: { spent: number; month: YearMonth; warning?: string | undefined }) {
  const { t, i18n } = useTranslation()
  return (
    <section className="pt-3.5 pb-6 text-center">
      <p className="font-rounded text-[length:clamp(2.25rem,12vw,3rem)] leading-[1.05] font-bold tracking-[-0.02em] whitespace-nowrap tabular-nums">
        {formatMoney(spent, i18n.language)}
      </p>
      <p className="mt-1.5 text-ink-2">{t('statement.spentIn', { month: monthName(month, i18n.language) })}</p>
      {warning && <p className="mt-2 text-[15px] text-warning">{warning}</p>}
    </section>
  )
}

/** Um item só para os lançamentos sem categoria, em vez de laranja em cada linha. */
function ReviewRow({ count, active, onToggle }: { count: number; active: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className="flex w-full items-start gap-2.5 rounded-block bg-card px-4 py-3 text-left active:bg-card-pressed"
    >
      <div className="min-w-0 flex-1 leading-[1.3]">
        <p className="font-semibold tracking-[-0.02em]">{t('statement.toReview')}</p>
        <p className="mt-0.5 text-[15px] tracking-[-0.012em] text-ink-2">{active ? t('statement.toReviewShowing') : t('statement.toReviewBody')}</p>
      </div>
      <span className="font-semibold text-warning tabular-nums">{count}</span>
      <Disclosure />
    </button>
  )
}

interface DayGroupsProps {
  items: Item[]
  accounts: BankAccount[]
  categories: Category[]
  categoryOf: (e: StatementEntry) => string | undefined
  onSelect: (entry: StatementEntry) => void
  onSelectForecast: (occurrence: ReconciledOccurrence, commitment: Commitment) => void
}

/** Lançamentos e previstos agrupados por dia, do mais recente para o mais antigo. */
function DayGroups({ items, accounts, categories, categoryOf, onSelect, onSelectForecast }: DayGroupsProps) {
  const { t, i18n } = useTranslation()
  const days: { date: string; items: Item[] }[] = []
  for (const item of items) {
    const last = days.at(-1)
    if (last?.date === item.date) last.items.push(item)
    else days.push({ date: item.date, items: [item] })
  }
  const byId = new Map(categories.map((c) => [c.id, c]))
  const accountsById = new Map(accounts.map((a) => [a.id, a]))
  const today = localIsoDate()
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = localIsoDate(yesterdayDate)
  const label = (date: string) =>
    date === today ? t('statement.today') : date === yesterday ? t('statement.yesterday') : formatDay(date, i18n.language)

  return (
    <div className="space-y-[22px]">
      {days.map((day) => (
        <section key={day.date}>
          <h3 className="px-4 pb-[7px] text-[15px] font-semibold tracking-[-0.01em] text-ink-2">{label(day.date)}</h3>
          <div className="inset-rows overflow-hidden rounded-block bg-card">
            {day.items.map((item) => {
              if (item.kind === 'forecast') {
                const { commitment } = item
                return (
                  <ForecastRow
                    key={`${commitment.id}:${item.occurrence.date}`}
                    occurrence={item.occurrence}
                    commitment={commitment}
                    category={commitment.categoryId ? byId.get(commitment.categoryId) : undefined}
                    account={commitment.accountId ? accountsById.get(commitment.accountId) : undefined}
                    onSelect={() => onSelectForecast(item.occurrence, commitment)}
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

const accountLabel = (account: BankAccount) => (account.last4 ? `${account.name} •${account.last4}` : account.name)

/** Valor da linha: sem sinal de menos; a entrada leva "+". */
const rowAmount = (amount: number, locale: string) => formatMoney(Math.abs(amount), locale, { signed: amount > 0 })

interface EntryRowProps {
  entry: StatementEntry
  category: Category | undefined
  isTransfer: boolean
  onSelect: () => void
}

function EntryRow({ entry: { tx, account }, category, isTransfer, onSelect }: EntryRowProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const installment = tx.card?.installment
  return (
    <Row
      title={tx.merchant ?? tx.description}
      line1={
        <>
          {category ? categoryName(category, locale) : t('statement.uncategorized')}
          {installment && <Tag>{t('commitments.installmentOf', { number: installment.number, total: installment.total })}</Tag>}
          {tx.foreign && <Tag>{formatMoney(tx.foreign.amount, locale, { currency: tx.foreign.currency })}</Tag>}
          {tx.status === 'pending' && <Tag>{t('statement.pending')}</Tag>}
        </>
      }
      line2={accountLabel(account)}
      amount={rowAmount(tx.amount, locale)}
      positive={tx.amount > 0 && !isTransfer}
      onClick={onSelect}
    />
  )
}

interface ForecastRowProps {
  occurrence: ReconciledOccurrence
  commitment: Commitment
  category: Category | undefined
  account: BankAccount | undefined
  onSelect: () => void
}

/** Previsto: título cinza e etiqueta "Previsto" (ou "Atrasado", em laranja). */
function ForecastRow({ occurrence, commitment, category, account, onSelect }: ForecastRowProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const late = occurrence.status === 'late'
  return (
    <Row
      title={commitment.name}
      muted
      line1={
        <>
          {category ? categoryName(category, locale) : t('statement.uncategorized')}
          {late ? <Tag tone="warning">{t('statement.late')}</Tag> : <Tag>{t('statement.forecast')}</Tag>}
          {occurrence.installment && (
            <Tag>{t('commitments.installmentOf', { number: occurrence.installment.number, total: occurrence.installment.total })}</Tag>
          )}
          {occurrence.suggestions.length > 0 && <Tag>{t('statement.suggestion')}</Tag>}
        </>
      }
      line2={commitment.kind === 'installment' ? commitment.person : account ? accountLabel(account) : undefined}
      amount={rowAmount(occurrence.amount, locale)}
      positive={occurrence.amount > 0}
      onClick={onSelect}
    />
  )
}

/** Quando os bancos foram lidos pela última vez, no pé da lista. */
function SyncFootnote({ running, synced }: { running: boolean; synced: string | undefined }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  let text = ''
  if (running) text = t('statement.updating')
  else if (synced) {
    text =
      localIsoDate(new Date(synced)) === localIsoDate()
        ? t('statement.updatedToday', { time: formatTime(synced, locale) })
        : t('statement.updatedAt', { when: formatDateTime(synced, locale) })
  }
  return text ? <p className="pt-7 text-center text-[13px] tracking-normal text-ink-2">{text}</p> : null
}
