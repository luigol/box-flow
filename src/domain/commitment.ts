import { addMonths, currentMonth, dateInMonth, type YearMonth } from '../lib/month'
import type { Cents, IsoDate } from './card'
import type { StoredBillLike } from './commitmentTypes'

/** Compromisso: gera lançamentos previstos (docs/design.md, "Compromisso"). */
export type Commitment = RecurringCommitment | InstallmentCommitment

interface CommitmentBase {
  id: string
  name: string
  categoryId?: string
  /** `out`: saída (despesa); `in`: entrada (ex.: salário). */
  direction: 'out' | 'in'
  /** Valor esperado, sempre positivo, em centavos. */
  amount: Cents
  /** `fixed`: o valor informado; `average`: média dos últimos 3 meses realizados. */
  amountMode: 'fixed' | 'average'
  /** Conta de onde sai ou onde entra. Obrigatória no cartão (define a fatura). */
  accountId?: string
  /** Trecho do texto do banco que identifica o compromisso. */
  bankText?: string
  /** Dia do mês em que cai (ou em que é cobrado, no cartão). */
  day: number
  /** Mês da primeira ocorrência. */
  start: YearMonth
}

export interface RecurringCommitment extends CommitmentBase {
  kind: 'recurring'
  frequency: 'monthly' | 'yearly'
  /** Último mês com ocorrência, quando encerrado. */
  end?: YearMonth
}

export interface InstallmentCommitment extends CommitmentBase {
  kind: 'installment'
  /** Com quem é o parcelamento. */
  person: string
  total: number
  /** Parcelas já pagas antes de cadastrar. */
  paid: number
}

export interface Occurrence {
  commitmentId: string
  /** Dia em que o dinheiro sai ou entra. */
  date: IsoDate
  /** Com sinal: negativo = saída. */
  amount: Cents
  /** Só em parcelado: qual parcela é (9 de 10). */
  installment?: { number: number; total: number }
}

export interface OccurrenceOptions {
  /** Último mês a gerar (horizonte da previsão). */
  until: YearMonth
  bills: StoredBillLike[]
}

/** Ocorrências previstas de um compromisso, do mês de início até o horizonte. */
export function occurrences(commitment: Commitment, options: OccurrenceOptions): Occurrence[] {
  const list: Occurrence[] = []
  const signed = commitment.direction === 'out' ? -commitment.amount : commitment.amount
  if (commitment.kind === 'installment') {
    // Parcelado: as parcelas que faltam, até a última, mesmo além do horizonte da previsão.
    for (let number = commitment.paid + 1, month = commitment.start; number <= commitment.total; number++, month = addMonths(month, 1)) {
      list.push({
        commitmentId: commitment.id,
        date: dateInMonth(month, commitment.day),
        amount: signed,
        installment: { number, total: commitment.total },
      })
    }
    return list
  }
  const step = commitment.kind === 'recurring' && commitment.frequency === 'yearly' ? 12 : 1
  let last = options.until
  if (commitment.kind === 'recurring' && commitment.end && compare(commitment.end, last) < 0) last = commitment.end
  const card = cardCycle(options.bills.filter((b) => b.accountId === commitment.accountId))
  for (let month = commitment.start; compare(month, last) <= 0; month = addMonths(month, step)) {
    const charge = dateInMonth(month, commitment.day)
    list.push({ commitmentId: commitment.id, date: card ? card(charge) : charge, amount: signed })
  }
  return list
}

/**
 * Ciclo do cartão aprendido das faturas: dia de fechamento, dia de vencimento e quantos meses
 * depois do fechamento ela vence (os mais frequentes, para um feriado não contaminar).
 * Devolve: dia da cobrança → dia em que o dinheiro sai. Sem faturas com fechamento: `undefined`.
 */
function cardCycle(bills: StoredBillLike[]): ((charge: IsoDate) => IsoDate) | undefined {
  const closed = bills.filter((b) => b.closingDate)
  if (closed.length === 0) return undefined
  const closingDay = mostFrequent(closed.map((b) => Number(b.closingDate!.slice(8, 10))))
  const dueDay = mostFrequent(closed.map((b) => Number(b.dueDate.slice(8, 10))))
  const dueOffset = mostFrequent(closed.map((b) => monthIndex(b.dueDate) - monthIndex(b.closingDate!)))
  return (charge) => {
    const chargeMonth = { year: Number(charge.slice(0, 4)), month: Number(charge.slice(5, 7)) }
    // Até 2 dias antes do fechamento entra na fatura que fecha neste mês; depois, na seguinte.
    const closingMonth = Number(charge.slice(8, 10)) < closingDay - 1 ? chargeMonth : addMonths(chargeMonth, 1)
    return dateInMonth(addMonths(closingMonth, dueOffset), dueDay)
  }
}

function monthIndex(date: IsoDate): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
}

/** O valor que mais aparece; em empate, o mais recente (último da lista). */
function mostFrequent(values: number[]): number {
  const counts = new Map<number, number>()
  let best = values[0] ?? 0
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1
    counts.set(value, count)
    if (count >= (counts.get(best) ?? 0)) best = value
  }
  return best
}

/**
 * Mês do primeiro previsto de um recorrente criado em `today` (decisão Q24 do grill):
 * com o lançamento deste mês vinculado, este mês; dia já passou sem lançamento, o seguinte;
 * dia ainda não chegou, este mês. Assim não nasce um "atrasado" falso.
 */
export function firstMonth(day: number, today: Date, options: { linkedThisMonth: boolean }): YearMonth {
  const thisMonth = currentMonth(today)
  if (options.linkedThisMonth) return thisMonth
  return today.getDate() > day ? addMonths(thisMonth, 1) : thisMonth
}

function compare(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month)
}
