import { addMonths, currentMonth, dateInMonth, type YearMonth } from '../lib/month'
import type { BankAccount, BankTransaction, Investment } from './bank'
import { cashOutDate, type Cents, type IsoDate } from './card'
import { TRANSFER } from './category'
import type { StoredBillLike } from './commitmentTypes'
import type { ReconciledOccurrence } from './reconcile'

export interface BalanceInput {
  accounts: BankAccount[]
  investments: Investment[]
  /** O botão "Investimentos" da aba Saldo. */
  includeInvestments: boolean
  transactions: BankTransaction[]
  bills: StoredBillLike[]
  /** Situação dos previstos (`reconcile`). */
  occurrences: ReconciledOccurrence[]
  /** Categoria do lançamento: o pagamento de fatura (transferência) não é compromisso do cartão. */
  categoryOf: (tx: BankTransaction) => string | undefined
  today: Date
  /** Janela: quantos meses, contando o atual. */
  months: number
}

export interface BalanceMonth {
  month: YearMonth
  /** Faturas que vencem no mês: só o que já está nelas. */
  bills: BillDue[]
  /** Compromissos de saída do mês (previstos e atrasados), com sinal. */
  outflows: ReconciledOccurrence[]
  /** Receitas previstas no mês. */
  inflows: ReconciledOccurrence[]
  /** Faturas + compromissos de saída, positivo. */
  committed: Cents
  /** Receitas previstas, positivo. */
  receivable: Cents
  /** Saldo que vem do mês anterior (no mês atual, o saldo atual). */
  start: { withIncome: Cents; withoutIncome: Cents }
  /** Saldo previsto no último dia do mês. "Sem receitas" desconsidera todas as receitas previstas. */
  end: { withIncome: Cents; withoutIncome: Cents }
}

export interface Balance {
  /** Saldo atual: contas correntes + investimentos (se ligados). */
  current: Cents
  months: BalanceMonth[]
  /** Atrasados com Pix sugerido: fora do saldo até o usuário confirmar ("Para revisar"). */
  review: ReconciledOccurrence[]
  /** Cada cartão: quanto falta pagar (todas as faturas, além da janela) e o vencimento da próxima. */
  cards: { accountId: string; total: Cents; next?: IsoDate }[]
}

/** Saldo previsto mês a mês, partindo do dinheiro de hoje (docs/design.md, "Aba Saldo"). */
export function balance(input: BalanceInput): Balance {
  const current =
    input.accounts.filter((a) => a.kind === 'checking').reduce((s, a) => s + a.balance, 0) +
    (input.includeInvestments ? input.investments.reduce((s, i) => s + i.balance, 0) : 0)
  const first = currentMonth(input.today)
  const today = dateInMonth(first, input.today.getDate())
  const cardBills = upcomingBills(input, today)
  // Atrasado com Pix sugerido provavelmente já foi pago: fica fora até ser confirmado.
  const review = input.occurrences.filter((o) => o.status === 'late' && o.suggestions.length > 0)
  const open = input.occurrences.filter((o) => o.status === 'pending' || (o.status === 'late' && o.suggestions.length === 0))
  // Atrasado de um mês que já passou ainda pode acontecer: cai no mês atual.
  const monthOf = (o: ReconciledOccurrence) => (o.date < monthKey(first) ? monthKey(first) : o.date.slice(0, 7))
  let withIncome = current
  let withoutIncome = current
  const months: BalanceMonth[] = []
  for (let i = 0; i < input.months; i++) {
    const month = addMonths(first, i)
    const prefix = monthKey(month)
    const bills = cardBills.filter((b) => b.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date))
    const inMonth = open.filter((o) => monthOf(o) === prefix)
    const outflows = inMonth.filter((o) => o.amount < 0)
    const inflows = inMonth.filter((o) => o.amount > 0)
    const committed = bills.reduce((s, b) => s + b.amount, 0) + outflows.reduce((s, o) => s - o.amount, 0)
    const receivable = inflows.reduce((s, o) => s + o.amount, 0)
    const start = { withIncome, withoutIncome }
    withIncome += receivable - committed
    withoutIncome -= committed
    months.push({ month, bills, outflows, inflows, committed, receivable, start, end: { withIncome, withoutIncome } })
  }
  const cards = input.accounts
    .filter((a) => a.kind === 'credit_card')
    .map((card) => {
      const due = cardBills.filter((b) => b.accountId === card.id)
      const next = due.map((b) => b.date).sort()[0]
      return { accountId: card.id, total: due.reduce((s, b) => s + b.amount, 0), ...(next ? { next } : {}) }
    })
  return { current, months, review, cards }
}

/** Fatura de um cartão num mês: o que ainda vai sair, positivo. */
export interface BillDue {
  accountId: string
  /** Dia em que o dinheiro sai (vencimento, ou o pagamento antecipado). */
  date: IsoDate
  amount: Cents
}

/**
 * O que ainda vai sair de cada cartão, por mês: os lançamentos cujo dinheiro ainda não saiu, sem os
 * pagamentos de fatura (que entram como crédito na fatura aberta). Bate com o `balance` do banco.
 */
function upcomingBills(input: BalanceInput, today: IsoDate): BillDue[] {
  const byMonth = new Map<string, BillDue>()
  for (const card of input.accounts.filter((a) => a.kind === 'credit_card')) {
    const bills = input.bills.filter((b) => b.accountId === card.id)
    for (const tx of input.transactions) {
      if (tx.accountId !== card.id || input.categoryOf(tx) === TRANSFER) continue
      const date = moneyOut(tx, bills)
      if (!date || date <= today) continue
      const key = `${card.id}|${date.slice(0, 7)}`
      const bill = byMonth.get(key) ?? { accountId: card.id, date, amount: 0 }
      bill.amount -= tx.amount
      if (date > bill.date) bill.date = date
      byMonth.set(key, bill)
    }
  }
  return [...byMonth.values()]
}

/** Dia em que o dinheiro do lançamento sai do bolso (regra do mês do cartão). */
function moneyOut(tx: BankTransaction, bills: StoredBillLike[]): IsoDate | undefined {
  // Cartão sem nenhuma fatura ainda: o mês previsto pelo banco, no último dia (o vencimento não é conhecido).
  if (bills.length === 0) {
    const month = tx.card?.billForecastMonth
    return month ? dateInMonth({ year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) }, 31) : tx.date
  }
  // Fatura que não veio mais do banco: antiga, já paga.
  if (tx.card?.billId && !bills.some((b) => b.id === tx.card!.billId)) return undefined
  return cashOutDate(tx.card ?? {}, bills)
}

function monthKey(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, '0')}`
}
