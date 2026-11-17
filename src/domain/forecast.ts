import { addMonths, currentMonth, type YearMonth } from '../lib/month'
import type { BankTransaction } from './bank'
import type { Commitment, Occurrence } from './commitment'
import type { StoredBillLike } from './commitmentTypes'
import { reconcile, type CommitmentLink, type ReconciledOccurrence } from './reconcile'

/** Até onde os recorrentes geram previstos (docs/design.md, "Horizonte da previsão"). */
export const HORIZON_MONTHS = 12

export interface ForecastInput {
  commitments: Commitment[]
  bills: StoredBillLike[]
  today: Date
  transactions?: BankTransaction[]
  links?: CommitmentLink[]
  unlinks?: { txId: string; commitmentId: string }[]
  skips?: string[]
}

/** Horizonte dos recorrentes a partir de hoje (parcelas vão até a última de qualquer jeito). */
export function forecastHorizon(today: Date): YearMonth {
  return addMonths(currentMonth(today), HORIZON_MONTHS)
}

/**
 * Previstos que ainda contam no mês: pendentes e atrasados (o realizado já está no extrato como
 * lançamento; "não aconteceu" some). Pelo dia em que o dinheiro sai ou entra, do mais recente ao mais antigo.
 */
export function forecastFor(month: YearMonth, reconciled: ReconciledOccurrence[]): ReconciledOccurrence[] {
  const prefix = `${month.year}-${String(month.month).padStart(2, '0')}`
  return reconciled
    .filter((o) => o.date.startsWith(prefix) && (o.status === 'pending' || o.status === 'late'))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Atalho: concilia e devolve os previstos do mês. */
export function monthForecast(month: YearMonth, input: ForecastInput): ReconciledOccurrence[] {
  const { occurrences } = reconcile({
    transactions: [],
    links: [],
    unlinks: [],
    skips: [],
    ...input,
    until: forecastHorizon(input.today),
  })
  return forecastFor(month, occurrences)
}

/** Entradas e saídas previstas (saída negativa). */
export function forecastTotals(list: Pick<Occurrence, 'amount'>[]): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const { amount } of list) {
    if (amount > 0) income += amount
    else expense += amount
  }
  return { income, expense }
}
