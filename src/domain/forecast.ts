import { addMonths, currentMonth, dateInMonth, type YearMonth } from '../lib/month'
import { occurrences, type Commitment, type Occurrence } from './commitment'
import type { StoredBillLike } from './commitmentTypes'

/** Até onde os recorrentes geram previstos (docs/design.md, "Horizonte da previsão"). */
const HORIZON_MONTHS = 12

export interface ForecastInput {
  commitments: Commitment[]
  bills: StoredBillLike[]
  today: Date
}

/** Previstos que caem no mês (pelo dia em que o dinheiro sai ou entra), do mais recente ao mais antigo. */
export function monthForecast(month: YearMonth, input: ForecastInput): Occurrence[] {
  const prefix = `${month.year}-${String(month.month).padStart(2, '0')}`
  // Parte 1: sem o vínculo com o banco, um previsto que já passou não tem como saber se aconteceu.
  const todayIso = dateInMonth(currentMonth(input.today), input.today.getDate())
  // Horizonte: 12 meses à frente para recorrentes; parcelas vão até a última (occurrences já faz isso).
  const horizon = addMonths(currentMonth(input.today), HORIZON_MONTHS)
  const until = month.year * 12 + month.month > horizon.year * 12 + horizon.month ? horizon : month
  const list = input.commitments
    .flatMap((c) => occurrences(c, { until, bills: input.bills }))
    .filter((o) => o.date.startsWith(prefix) && o.date >= todayIso)
  return list.sort((a, b) => b.date.localeCompare(a.date))
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
