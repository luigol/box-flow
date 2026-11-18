import type { YearMonth } from '../lib/month'
import type { BankAccount, BankTransaction } from './bank'
import { cashOutDate, type CardBill } from './card'
import { TRANSFER } from './category'

export interface StatementEntry {
  tx: BankTransaction
  account: BankAccount
}

export interface StatementData {
  accounts: BankAccount[]
  transactions: BankTransaction[]
  bills: (CardBill & { accountId: string })[]
}

/**
 * Lançamentos que caem no mês: na conta, pelo dia; no cartão, pelo mês em que o dinheiro sai
 * (docs/design.md, "Cartão: o mês é quando o dinheiro sai").
 */
export function monthStatement(month: YearMonth, data: StatementData): StatementEntry[] {
  const prefix = `${month.year}-${String(month.month).padStart(2, '0')}`
  const accounts = new Map(data.accounts.map((a) => [a.id, a]))
  const billsByAccount = new Map<string, CardBill[]>()
  for (const bill of data.bills) {
    billsByAccount.set(bill.accountId, [...(billsByAccount.get(bill.accountId) ?? []), bill])
  }

  const entries: StatementEntry[] = []
  for (const tx of data.transactions) {
    const account = accounts.get(tx.accountId)
    if (!account) continue
    if (monthOf(tx, billsByAccount.get(account.id) ?? []) === prefix) entries.push({ tx, account })
  }
  return entries.sort((a, b) => b.tx.date.localeCompare(a.tx.date))
}

export interface MonthTotals {
  income: number
  /** Negativo. */
  expense: number
  net: number
}

/** Entradas, saídas e resultado dos lançamentos do mês. */
export function monthTotals(entries: StatementEntry[], categoryOf: (entry: StatementEntry) => string | undefined): MonthTotals {
  let income = 0
  let expense = 0
  for (const entry of entries) {
    const { tx } = entry
    if (categoryOf(entry) === TRANSFER) continue // dinheiro mudando de conta não é ganho nem gasto
    if (tx.amount > 0) income += tx.amount
    else expense += tx.amount
  }
  return { income, expense, net: income + expense }
}

export interface MonthSpending {
  /** As categorias que mais gastaram, da maior para a menor (valores positivos, em centavos). */
  top: { categoryId: string; amount: number }[]
  /** O resto: as demais categorias e o que está sem categoria. */
  others: number
  /** Tudo o que saiu: igual a `-monthTotals(...).expense`. */
  total: number
}

/**
 * Gasto do mês por categoria, para a barra do mês (docs/design.md, "Visual"): as `limit` maiores
 * e o resto junto, inclusive o sem categoria. Entradas e transferências ficam de fora.
 */
export function monthSpending(
  entries: StatementEntry[],
  categoryOf: (entry: StatementEntry) => string | undefined,
  limit = 5,
): MonthSpending {
  const byCategory = new Map<string, number>()
  let uncategorized = 0
  let total = 0
  for (const entry of entries) {
    const spent = -entry.tx.amount
    if (spent <= 0) continue
    const categoryId = categoryOf(entry)
    if (categoryId === TRANSFER) continue
    total += spent
    if (categoryId) byCategory.set(categoryId, (byCategory.get(categoryId) ?? 0) + spent)
    else uncategorized += spent
  }
  const sorted = [...byCategory]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount || a.categoryId.localeCompare(b.categoryId))
  const top = sorted.slice(0, limit)
  const others = uncategorized + sorted.slice(limit).reduce((sum, c) => sum + c.amount, 0)
  return { top, others, total }
}

/** Mês (AAAA-MM) em que o lançamento cai. */
function monthOf(tx: BankTransaction, bills: CardBill[]): string {
  if (!tx.card) return tx.date.slice(0, 7)
  // Cartão novo, sem fatura fechada: ainda não se sabe o dia do vencimento.
  if (bills.length === 0) return tx.card.billForecastMonth ?? tx.date.slice(0, 7)
  return cashOutDate(tx.card, bills).slice(0, 7)
}
