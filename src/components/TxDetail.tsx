import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StoredBill } from '../db/db'
import { linkTransaction, nearestOccurrenceKey, unlinkTransaction, type TxLink } from '../db/reconciliation'
import type { BankAccount, BankTransaction } from '../domain/bank'
import { cashOutDate } from '../domain/card'
import { categoryName, classify, TRANSFER, type Category, type ClassifyContext } from '../domain/category'
import type { Commitment } from '../domain/commitment'
import type { StatementEntry } from '../domain/statement'
import { formatMoney, formatShortDate } from '../lib/format'
import { formatMonth } from '../lib/month'
import { CategorySheet, RuleSheet } from './CategorySheet'
import { Action, Block, DetailHero, InfoRow, PushScreen, StatusRow, TotalRow } from './Detail'
import { Sheet } from './Sheet'

interface TxDetailProps {
  entry: StatementEntry
  categories: Category[]
  ctx: ClassifyContext
  /** Compromissos a que o lançamento está ligado. */
  links: TxLink[]
  commitments: Commitment[]
  bills: StoredBill[]
  onCreateCommitment: (categoryId: string | undefined) => void
  onClose: () => void
}

/**
 * Detalhe de um lançamento, como no app Carteira (docs/design.md, "Visual"): o valor em destaque,
 * o estado e a conta, a categoria e o compromisso, os dados do cartão e as ações.
 */
export function TxDetail({ entry, categories, ctx, links, commitments, bills, onCreateCommitment, onClose }: TxDetailProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { tx, account } = entry
  const [sheet, setSheet] = useState<'category' | 'rule' | 'link' | null>(null)

  const current = classify(tx, account, ctx)
  const category = current ? categories.find((c) => c.id === current) : undefined
  const amount = formatMoney(Math.abs(tx.amount), locale, { signed: tx.amount > 0 })
  const positive = tx.amount > 0 && current !== TRANSFER
  const title = tx.merchant ?? tx.description
  // O texto do banco aparece quando o título não é ele (estabelecimento ou descrição traduzida).
  const bankText = tx.rawDescription ?? (tx.merchant ? tx.description : undefined)
  const byId = new Map(commitments.map((c) => [c.id, c]))
  const linkedNames = links.map((l) => byId.get(l.commitmentId)?.name ?? '?').join(', ')
  const cashOut = cashOutLabel(tx, account, bills, locale)

  const extraRows = [
    tx.card && <InfoRow key="buy" label={t('detail.purchaseDate')} value={formatShortDate(tx.card.purchaseDate ?? tx.date, locale)} />,
    tx.card?.installment && (
      <InfoRow
        key="inst"
        label={t('detail.installment')}
        value={t('commitments.installmentOf', { number: tx.card.installment.number, total: tx.card.installment.total })}
      />
    ),
    tx.foreign && (
      <InfoRow key="fx" label={t('detail.originalAmount')} value={formatMoney(Math.abs(tx.foreign.amount), locale, { currency: tx.foreign.currency })} />
    ),
    cashOut && <InfoRow key="out" label={t('detail.cashOut')} value={cashOut} />,
  ].filter(Boolean)

  return (
    <>
      <PushScreen title={title} onClose={onClose} escape={sheet === null}>
        <DetailHero amount={amount} positive={positive} title={title} subtitle={formatShortDate(tx.date, locale)} />

        <Block>
          <StatusRow
            status={tx.status === 'pending' ? t('detail.pending') : t('detail.posted')}
            lines={[
              <p className="text-ink-2">{t(account.kind === 'credit_card' ? 'detail.card' : 'detail.checking', { name: accountLabel(account) })}</p>,
              ...(bankText ? [<p className="mt-0.5 font-mono text-[13px] tracking-normal break-all text-ink-2">{t('detail.bankText', { text: bankText })}</p>] : []),
            ]}
          />
          <TotalRow amount={amount} positive={positive} />
        </Block>

        <Block className="mt-3.5">
          <InfoRow
            label={t('detail.category')}
            value={category ? categoryName(category, locale) : t('detail.choose')}
            valueClass={category ? 'text-ink-2' : 'font-semibold text-ink'}
            onClick={() => setSheet('category')}
          />
          <InfoRow label={t('detail.commitment')} value={linkedNames || t('detail.none')} onClick={() => setSheet('link')} />
        </Block>

        {extraRows.length > 0 && <Block className="mt-3.5">{extraRows}</Block>}

        <div className="mt-7">
          <Action
            label={t('detail.createRule')}
            note={category ? t('detail.createRuleNote', { category: categoryName(category, locale) }) : t('detail.createRuleNeedsCategory')}
            disabled={!current}
            onClick={() => setSheet('rule')}
          />
          {links.length > 0
            ? links.map((link) => {
                const name = byId.get(link.commitmentId)?.name ?? '?'
                return (
                  <Action
                    key={link.occurrenceKey}
                    tone="danger"
                    label={t('detail.unlink', { name })}
                    note={link.auto ? t('detail.unlinkNoteAuto', { name }) : t('detail.unlinkNote', { name })}
                    onClick={() => void unlinkTransaction(tx.id, link)}
                  />
                )
              })
            : commitments.length > 0 && (
                <Action label={t('detail.linkCommitment')} note={t('detail.linkCommitmentNote')} onClick={() => setSheet('link')} />
              )}
          <Action label={t('detail.createCommitment')} note={t('detail.createCommitmentNote')} onClick={() => onCreateCommitment(current)} />
        </div>
      </PushScreen>

      {sheet === 'category' && <CategorySheet entry={entry} categories={categories} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet === 'rule' && current && <RuleSheet tx={tx} categoryId={current} categories={categories} onClose={() => setSheet(null)} />}
      {sheet === 'link' && <LinkSheet tx={tx} commitments={commitments} links={links} bills={bills} onClose={() => setSheet(null)} />}
    </>
  )
}

const accountLabel = (account: BankAccount) => (account.last4 ? `${account.name} •${account.last4}` : account.name)

/** Quando o dinheiro da compra no cartão sai da conta: o dia, se já se sabe; senão, o mês da fatura prevista. */
function cashOutLabel(tx: BankTransaction, account: BankAccount, bills: StoredBill[], locale: string): string | undefined {
  if (!tx.card) return undefined
  const own = bills.filter((b) => b.accountId === account.id)
  if (own.length > 0) {
    try {
      return formatShortDate(cashOutDate(tx.card, own), locale)
    } catch {
      // Fatura que ainda não chegou: cai no mês previsto, abaixo.
    }
  }
  const month = tx.card.billForecastMonth
  return month ? formatMonth({ year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) }, locale) : undefined
}

/** Escolher o compromisso a que o lançamento pertence. */
function LinkSheet({ tx, commitments, links, bills, onClose }: { tx: BankTransaction; commitments: Commitment[]; links: TxLink[]; bills: StoredBill[]; onClose: () => void }) {
  const { t } = useTranslation()
  const linked = new Set(links.map((l) => l.commitmentId))

  async function linkTo(commitment: Commitment) {
    const key = nearestOccurrenceKey(commitment, tx, bills)
    if (key) await linkTransaction(tx.id, key)
    onClose()
  }

  return (
    <Sheet title={t('link.chooseCommitment')} onClose={onClose}>
      <h2 className="mb-4 px-2 text-center font-semibold">{t('link.chooseCommitment')}</h2>
      {commitments.length === 0 ? (
        <p className="px-2 text-[15px] text-ink-2">{t('detail.noCommitments')}</p>
      ) : (
        <div className="inset-rows overflow-hidden rounded-block bg-card">
          {commitments.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={linked.has(c.id)}
              onClick={() => void linkTo(c)}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-card-pressed disabled:text-ink-2"
            >
              <span className="truncate">{c.name}</span>
              {linked.has(c.id) && <span className="shrink-0 text-[15px]">{t('detail.linked')}</span>}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}
