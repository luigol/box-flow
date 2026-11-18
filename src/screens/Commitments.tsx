import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/Card'
import { CommitmentSheet } from '../components/CommitmentSheet'
import { GlassButton, GlassTopBar } from '../components/GlassTopBar'
import { PlusIcon } from '../components/icons'
import { ListRow } from '../components/ListRow'
import { Tag } from '../components/Tag'
import { useCommitments } from '../db/commitments'
import { ignoreSuggestion, useDiscovery } from '../db/discovery'
import { db } from '../db/instance'
import { useReconciliation } from '../db/reconciliation'
import { categoryName } from '../domain/category'
import type { Commitment } from '../domain/commitment'
import type { CardInstallmentPurchase } from '../domain/installments'
import type { RecurringSuggestion } from '../domain/suggestions'
import { formatMoney } from '../lib/format'

/** Aba Compromissos: lista, sem troca de mês (docs/design.md, "Compromisso"), no estilo da Carteira. */
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

  /** Recorrente ou parcelado com pessoa: agenda (ou pessoa) e etiquetas na 1ª linha, categoria na 2ª. */
  const row = (c: Commitment) => {
    const next = upcoming(c)
    const category = c.categoryId ? categories.get(c.categoryId) : undefined
    const late = next.some((o) => o.status === 'late')
    let line1: ReactNode
    if (c.kind === 'installment') {
      const installment = next[0]?.installment
      line1 = (
        <>
          {c.person}
          <Tag>{installment ? t('commitments.installmentOf', { number: installment.number, total: installment.total }) : t('commitments.done')}</Tag>
          {late && <Tag tone="warning">{t('statement.late')}</Tag>}
        </>
      )
    } else {
      const schedule =
        c.frequency === 'yearly'
          ? t('commitments.yearly', { date: `${String(c.day).padStart(2, '0')}/${String(c.start.month).padStart(2, '0')}` })
          : t('commitments.monthly', { day: c.day })
      line1 = (
        <>
          {schedule}
          {c.end && next.length === 0 && <Tag>{t('commitments.ended')}</Tag>}
          {late && <Tag tone="warning">{t('statement.late')}</Tag>}
        </>
      )
    }
    return (
      <ListRow
        key={c.id}
        title={c.name}
        line1={line1}
        line2={category ? categoryName(category, locale) : t('statement.uncategorized')}
        amount={formatMoney(c.amount, locale, { signed: c.direction === 'in' })}
        positive={c.direction === 'in'}
        onClick={() => setEditing(c)}
      />
    )
  }

  /** Sugestão: "Criar" abre o formulário preenchido; "Ignorar" esconde (desfaz em Ajustes). */
  const suggestionRow = (s: RecurringSuggestion) => (
    <ListRow
      key={s.key}
      title={s.text}
      line1={t('commitments.suggestionMonths', { count: s.months })}
      line2={
        <>
          {accountName(s.latest.accountId)}
          {s.latest.counterparty === 'person' && <Tag>{t('commitments.toPerson')}</Tag>}
        </>
      }
      amount={formatMoney(s.amount, locale, { signed: s.direction === 'in' })}
      positive={s.direction === 'in'}
    >
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(s)}
          className="h-8 rounded-full bg-ink px-4 text-[15px] font-semibold text-canvas transition-[scale] duration-300 active:scale-95"
        >
          {t('commitments.create')}
        </button>
        <button
          type="button"
          onClick={() => void ignoreSuggestion(s)}
          className="h-8 rounded-full bg-card-pressed px-4 text-[15px] font-semibold transition-[scale] duration-300 active:scale-95"
        >
          {t('commitments.ignore')}
        </button>
      </div>
    </ListRow>
  )

  /** Parcelado do cartão: só consulta (o banco já manda as parcelas futuras), com barra de andamento. */
  const cardRow = (p: CardInstallmentPurchase) => {
    const paid = t('commitments.cardPaid', { paid: p.paid, total: p.total })
    return (
      <ListRow
        key={`${p.accountId}|${p.description}|${p.purchaseDate ?? ''}|${p.total}`}
        title={p.description}
        line1={
          <>
            {accountName(p.accountId)}
            <Tag>{paid}</Tag>
          </>
        }
        line2={t('commitments.endsIn', { date: monthYear(p.lastDate, locale) })}
        amount={formatMoney(p.remaining, locale)}
        positive={false}
      >
        <div role="img" aria-label={paid} className="mt-2.5 h-1 overflow-hidden rounded-full bg-card-pressed">
          <div className="h-full rounded-full bg-ink-2" style={{ width: `${((p.paid / p.total) * 100).toFixed(1)}%` }} />
        </div>
      </ListRow>
    )
  }
  const cardTotal = cardInstallments.reduce((s, p) => s + p.remaining, 0)

  const nothing = commitments?.length === 0 && discovery && suggestions.length === 0 && cardInstallments.length === 0

  return (
    <>
      <GlassTopBar
        trailing={
          <GlassButton label={t('commitments.add')} onClick={() => setEditing('new')}>
            <PlusIcon />
          </GlassButton>
        }
      />
      <h1 className="mt-0.5 mb-1 px-1 text-[34px] leading-[1.12] font-bold tracking-[-0.025em]">{t('tabs.commitments')}</h1>
      {nothing && (
        <div className="mt-5">
          <EmptyState title={t('commitments.emptyTitle')} body={t('commitments.emptyBody')} />
        </div>
      )}
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

/** Grupo da lista, com título grande; some quando não há linhas. */
function Section({ title, footer, children }: { title: string; footer?: string[]; children: ReactNode[] }) {
  if (children.length === 0) return null
  return (
    <section>
      <h2 className="mx-4 mt-7 mb-3 text-[22px] leading-tight font-bold tracking-[-0.02em]">{title}</h2>
      <div className="inset-rows overflow-hidden rounded-block bg-card">{children}</div>
      {footer?.map((line) => (
        <p key={line} className="px-4 pt-2 text-[13px] leading-[1.38] tracking-normal text-ink-2">
          {line}
        </p>
      ))}
    </section>
  )
}

/** "dez. de 2026". */
function monthYear(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, 1))
}
