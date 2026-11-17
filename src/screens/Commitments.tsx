import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/Card'
import { CommitmentSheet } from '../components/CommitmentSheet'
import { PlusIcon } from '../components/icons'
import { ScreenHeader } from '../components/ScreenHeader'
import { useCommitments } from '../db/commitments'
import { ignoreSuggestion, useDiscovery } from '../db/discovery'
import { db } from '../db/instance'
import { useReconciliation } from '../db/reconciliation'
import { categoryName } from '../domain/category'
import type { Commitment } from '../domain/commitment'
import type { CardInstallmentPurchase } from '../domain/installments'
import type { RecurringSuggestion } from '../domain/suggestions'
import { formatMoney } from '../lib/format'

/** Aba Compromissos: lista, sem troca de mês (docs/design.md, "Compromisso"). */
export function Commitments() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const commitments = useCommitments()
  const reconciliation = useReconciliation()
  const discovery = useDiscovery(reconciliation)
  const categories = new Map((useLiveQuery(() => db.categories.toArray(), []) ?? []).map((c) => [c.id, c]))
  const [editing, setEditing] = useState<Commitment | 'new' | RecurringSuggestion | null>(null)

  // O que ainda vai (ou deveria ter) acontecer: pendentes e atrasados, por data.
  const upcoming = (c: Commitment) =>
    (reconciliation?.occurrences ?? [])
      .filter((o) => o.commitmentId === c.id && (o.status === 'pending' || o.status === 'late'))
      .sort((a, b) => a.date.localeCompare(b.date))
  const recurringOut = (commitments ?? []).filter((c) => c.kind === 'recurring' && c.direction === 'out')
  const recurringIn = (commitments ?? []).filter((c) => c.kind === 'recurring' && c.direction === 'in')
  const installments = (commitments ?? []).filter((c) => c.kind === 'installment')
  const suggestions = discovery?.suggestions ?? []
  const cardInstallments = discovery?.installments ?? []
  const accountName = (id: string) => {
    const account = discovery?.accounts.get(id)
    return account ? (account.last4 ? `${account.name} •${account.last4}` : account.name) : ''
  }

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
        <Amount cents={c.direction === 'in' ? c.amount : -c.amount} locale={locale} />
      </button>
    )
  }

  /** Sugestão: "Criar" abre o formulário preenchido; "Ignorar" esconde (desfaz em Ajustes). */
  const suggestionRow = (s: RecurringSuggestion) => {
    const details = [
      t('commitments.suggestionMonths', { count: s.months }),
      accountName(s.latest.accountId),
      s.latest.counterparty === 'person' ? t('commitments.toPerson') : null,
    ].filter(Boolean)
    return (
      <div key={s.key} className="px-4 py-2.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate">{s.text}</p>
            <p className="text-[13px] tracking-normal text-ink-2">{details.join(' · ')}</p>
          </div>
          <Amount cents={s.direction === 'in' ? s.amount : -s.amount} locale={locale} />
        </div>
        <div className="mt-1.5 flex gap-5 text-[15px]">
          <button type="button" className="text-accent" onClick={() => setEditing(s)}>
            {t('commitments.create')}
          </button>
          <button type="button" className="text-ink-2" onClick={() => void ignoreSuggestion(s)}>
            {t('commitments.ignore')}
          </button>
        </div>
      </div>
    )
  }

  /** Parcelado do cartão: só consulta (o banco já manda as parcelas futuras). */
  const cardRow = (p: CardInstallmentPurchase) => {
    const details = [
      t('commitments.cardPaid', { paid: p.paid, total: p.total }),
      accountName(p.accountId),
      t('commitments.until', { date: monthYear(p.lastDate, locale) }),
    ].filter(Boolean)
    return (
      <div key={`${p.accountId}|${p.description}|${p.purchaseDate ?? ''}|${p.total}`} className="flex items-start gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate">{p.description}</p>
          <p className="text-[13px] tracking-normal text-ink-2">{details.join(' · ')}</p>
        </div>
        <Amount cents={-p.remaining} locale={locale} />
      </div>
    )
  }
  const cardTotal = cardInstallments.reduce((s, p) => s + p.remaining, 0)

  const nothing = commitments?.length === 0 && discovery && suggestions.length === 0 && cardInstallments.length === 0

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
      {nothing && <EmptyState title={t('commitments.emptyTitle')} body={t('commitments.emptyBody')} />}
      <Section title={t('commitments.suggestions')} footer={[t('commitments.suggestionsHint')]}>
        {suggestions.map(suggestionRow)}
      </Section>
      <Section title={t('commitments.recurring')}>{recurringOut.map(row)}</Section>
      <Section title={t('commitments.income')}>{recurringIn.map(row)}</Section>
      <Section
        title={t('commitments.installments')}
        footer={[...owed].filter(([, v]) => v > 0).map(([person, value]) => t('commitments.owe', { person, amount: formatMoney(value, locale) }))}
      >
        {installments.map(row)}
      </Section>
      <Section title={t('commitments.cardInstallments')} footer={[t('commitments.cardRemaining', { amount: formatMoney(cardTotal, locale) })]}>
        {cardInstallments.map(cardRow)}
      </Section>
      {editing &&
        (typeof editing === 'object' && 'latest' in editing ? (
          <CommitmentSheet
            fromTx={editing.latest}
            fromAmount={editing.amount}
            fromCategoryId={discovery?.categoryOf(editing.latest)}
            onClose={() => setEditing(null)}
          />
        ) : (
          <CommitmentSheet commitment={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
        ))}
    </>
  )
}

/** Grupo da lista; some quando não há linhas. */
function Section({ title, footer, children }: { title: string; footer?: string[]; children: ReactNode[] }) {
  if (children.length === 0) return null
  return (
    <section className="mb-7">
      <h2 className="px-4 pb-1.5 text-[13px] tracking-normal text-ink-2 uppercase">{title}</h2>
      <div className="divide-y-[0.5px] divide-separator overflow-hidden rounded-2xl bg-card">{children}</div>
      {footer?.map((line) => (
        <p key={line} className="px-4 pt-1.5 text-[13px] tracking-normal text-ink-2">
          {line}
        </p>
      ))}
    </section>
  )
}

function Amount({ cents, locale }: { cents: number; locale: string }) {
  return <p className={`shrink-0 tabular-nums ${cents > 0 ? 'text-positive' : ''}`}>{formatMoney(cents, locale, { signed: cents > 0 })}</p>
}

function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}

/** "dez. de 2026". */
function monthYear(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, 1))
}
