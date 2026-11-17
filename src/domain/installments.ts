import { currentMonth, dateInMonth } from '../lib/month'
import { withoutInstallment, type BankTransaction } from './bank'
import { cashOutDate, type Cents, type IsoDate } from './card'
import type { StoredBillLike } from './commitmentTypes'
import { normalize } from './category'

/** Compra parcelada no cartão, montada a partir das parcelas que o banco manda (só para consulta). */
export interface CardInstallmentPurchase {
  accountId: string
  /** Descrição sem o "NN/NN". */
  description: string
  purchaseDate?: IsoDate
  /** Número de parcelas. */
  total: number
  /** Parcelas cujo dinheiro já saiu (fatura paga ou vencida). */
  paid: number
  /** Quanto falta pagar, positivo. */
  remaining: Cents
  /** Dia em que sai o dinheiro da última parcela. */
  lastDate: IsoDate
}

export interface CardInstallmentsInput {
  transactions: BankTransaction[]
  bills: StoredBillLike[]
  today: Date
}

/**
 * Parcelados do cartão (docs/design.md, "Compromisso"): uma compra é o texto sem "NN/NN", o número de parcelas
 * e a data da compra. Uma parcela está paga quando o dinheiro dela já saiu (regra do mês do cartão).
 */
export function cardInstallments(input: CardInstallmentsInput): CardInstallmentPurchase[] {
  const today = dateInMonth(currentMonth(input.today), input.today.getDate())
  const groups = new Map<string, BankTransaction[]>()
  for (const tx of input.transactions) {
    const installment = tx.card?.installment
    if (!installment) continue
    const key = [tx.accountId, normalize(withoutInstallment(tx.description)), installment.total, tx.card?.purchaseDate ?? ''].join('|')
    groups.set(key, [...(groups.get(key) ?? []), tx])
  }

  const result: CardInstallmentPurchase[] = []
  for (const parts of groups.values()) {
    const first = parts[0]!
    const bills = input.bills.filter((b) => b.accountId === first.accountId)
    const dated = parts.map((tx) => ({ tx, date: moneyOutDate(tx, bills) }))
    // O banco manda as parcelas futuras; as primeiras de uma compra antiga podem já ter saído do histórico.
    const future = dated.filter((p) => p.date > today)
    if (future.length === 0) continue
    const total = first.card!.installment!.total
    result.push({
      accountId: first.accountId,
      description: withoutInstallment(first.description),
      purchaseDate: first.card?.purchaseDate,
      total,
      paid: total - future.length,
      remaining: future.reduce((sum, p) => sum - p.tx.amount, 0),
      lastDate: dated.map((p) => p.date).sort().at(-1)!,
    })
  }
  return result.sort((a, b) => a.lastDate.localeCompare(b.lastDate))
}

/** Dia em que sai o dinheiro da parcela. Cartão sem nenhuma fatura ainda: a data que o banco deu à parcela. */
function moneyOutDate(tx: BankTransaction, bills: StoredBillLike[]): IsoDate {
  return bills.length > 0 ? cashOutDate(tx.card!, bills) : tx.date
}
