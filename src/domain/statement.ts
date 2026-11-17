import type { YearMonth } from '../lib/month'
import type { BankAccount, BankTransaction } from './bank'
import { cashOutDate, type CardBill } from './card'

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

/** Mês (AAAA-MM) em que o lançamento cai. */
function monthOf(tx: BankTransaction, bills: CardBill[]): string {
  if (!tx.card) return tx.date.slice(0, 7)
  // Cartão novo, sem fatura fechada: ainda não se sabe o dia do vencimento.
  if (bills.length === 0) return tx.card.billForecastMonth ?? tx.date.slice(0, 7)
  return cashOutDate(tx.card, bills).slice(0, 7)
}
