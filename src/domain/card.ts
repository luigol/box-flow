import { addMonths } from '../lib/month'

/** Data do calendário, AAAA-MM-DD, sem fuso. */
export type IsoDate = string

/** Valor em centavos, sempre inteiro. */
export type Cents = number

export interface CardBill {
  id: string
  dueDate: IsoDate
  /** Dia em que a fatura fechou. Serve para prever em qual fatura cai uma cobrança futura. */
  closingDate?: IsoDate
  total: Cents
  payments: { date: IsoDate; amount: Cents }[]
}

export interface CardCharge {
  /** Fatura em que a compra entrou. Só existe depois que a compra liquida. */
  billId?: string
  /** Mês da fatura prevista pelo banco (AAAA-MM), para compras pendentes e parcelas futuras. */
  billForecastMonth?: string
}

/**
 * Dia em que o dinheiro de uma compra no cartão sai da conta.
 * O mês do extrato e o saldo previsto partem dele (docs/design.md, "Cartão: o mês é quando o dinheiro sai").
 */
export function cashOutDate(charge: CardCharge, bills: CardBill[]): IsoDate {
  if (!charge.billId) {
    const month = charge.billForecastMonth ?? openBillMonth(bills)
    return dayInMonth(month, usualDueDay(bills))
  }
  const bill = bills.find((b) => b.id === charge.billId)
  if (!bill) throw new Error(`Fatura ${charge.billId} não encontrada`)
  return paidOffDate(bill) ?? bill.dueDate
}

/** Data no mês `AAAA-MM` com o dia `DD`; se o mês não tem esse dia (31/02), o último dia do mês. */
function dayInMonth(month: string, day: string): IsoDate {
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  return `${month}-${String(Math.min(Number(day), lastDay)).padStart(2, '0')}`
}

/** Mês (AAAA-MM) da fatura aberta: o seguinte ao vencimento da última fatura fechada. */
function openBillMonth(bills: CardBill[]): string {
  const latest = bills.reduce((a, b) => (b.dueDate > a.dueDate ? b : a))
  const next = addMonths({ year: Number(latest.dueDate.slice(0, 4)), month: Number(latest.dueDate.slice(5, 7)) }, 1)
  return `${next.year}-${String(next.month).padStart(2, '0')}`
}

/**
 * Dia do mês (DD) em que as faturas deste cartão costumam vencer: o mais frequente,
 * para que um vencimento adiado por feriado ou fim de semana não contamine a previsão.
 * Em empate, vale o mais recente.
 */
function usualDueDay(bills: CardBill[]): string {
  const counts = new Map<string, number>()
  let usual = ''
  for (const { dueDate } of [...bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const day = dueDate.slice(8, 10)
    const count = (counts.get(day) ?? 0) + 1
    counts.set(day, count)
    if (count >= (counts.get(usual) ?? 0)) usual = day
  }
  return usual
}

/**
 * Dia do pagamento que completou o total da fatura, ou `undefined` se ainda não foi quitada.
 * O banco lista os pagamentos fora de ordem e mistura pagamentos de outras faturas,
 * então soma em ordem de data até cobrir o total.
 */
function paidOffDate(bill: CardBill): IsoDate | undefined {
  const byDate = [...bill.payments].sort((a, b) => a.date.localeCompare(b.date))
  let paid = 0
  for (const payment of byDate) {
    paid += payment.amount
    if (paid >= bill.total) return payment.date
  }
  return undefined
}
