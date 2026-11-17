import { addMonths, currentMonth } from '../lib/month'
import { withoutInstallment, type BankTransaction } from './bank'
import type { Cents } from './card'
import { normalize, searchText, TRANSFER } from './category'
import type { Commitment } from './commitment'

/** Meses olhados para trás, contando o atual (decisão Q25 do grill). */
const WINDOW_MONTHS = 6
/** Meses diferentes em que o texto precisa aparecer, com o total do mês perto do valor típico. */
const MIN_MONTHS = 3
/** Diferença aceita entre o total de um mês e o valor típico. */
const TOLERANCE = 0.25
/** Média de lançamentos por mês acima da qual não é recorrente (o salário em 2 Pix ainda entra). */
const MAX_PER_MONTH = 2

/** Recorrente que o extrato sugere (docs/design.md, "Compromisso" → Sugestões). */
export interface RecurringSuggestion {
  /** Identifica a sugestão para "Ignorar". */
  key: string
  /** Texto do banco, sem "NN/NN": vira o texto do compromisso. */
  text: string
  direction: 'in' | 'out'
  /** Valor típico de um mês, positivo. */
  amount: Cents
  /** Em quantos dos últimos 6 meses apareceu. */
  months: number
  /** O lançamento mais recente: base do formulário (conta, dia, pessoa ou empresa). */
  latest: BankTransaction
}

export interface SuggestionsInput {
  transactions: BankTransaction[]
  commitments: Commitment[]
  /** Lançamentos já ligados a um compromisso. */
  linkedTxIds: Set<string>
  /** Categoria do lançamento, para deixar de fora as transferências. */
  categoryOf: (tx: BankTransaction) => string | undefined
  /** Chaves das sugestões ignoradas. */
  ignored: Set<string>
  today: Date
}

export function recurringSuggestions(input: SuggestionsInput): RecurringSuggestion[] {
  const now = currentMonth(input.today)
  const window = new Set(Array.from({ length: WINDOW_MONTHS }, (_, i) => monthKey(addMonths(now, -i))))
  const recentFrom = monthKey(addMonths(now, -1))
  const commitmentTexts = input.commitments.flatMap((c) => (c.bankText ? [normalize(c.bankText)] : []))
  const groups = new Map<string, BankTransaction[]>()
  for (const tx of input.transactions) {
    if (!window.has(tx.date.slice(0, 7))) continue
    // Parcela do cartão já é um parcelado; transferência não é gasto; o resto já é compromisso.
    if (tx.card?.installment || input.categoryOf(tx) === TRANSFER || input.linkedTxIds.has(tx.id)) continue
    const text = searchText(tx)
    if (commitmentTexts.some((t) => text.includes(t))) continue
    const key = `${normalize(withoutInstallment(tx.description))}|${direction(tx)}`
    groups.set(key, [...(groups.get(key) ?? []), tx])
  }

  const result: RecurringSuggestion[] = []
  for (const [key, txs] of groups) {
    if (input.ignored.has(key)) continue
    const byMonth = new Map<string, Cents>()
    for (const tx of txs) byMonth.set(tx.date.slice(0, 7), (byMonth.get(tx.date.slice(0, 7)) ?? 0) + Math.abs(tx.amount))
    if (byMonth.size < MIN_MONTHS) continue
    // Mais de 2 por mês, em média, é gasto do dia a dia (corridas, mercado), não um recorrente.
    if (txs.length > MAX_PER_MONTH * byMonth.size) continue
    // Compara o total de cada mês com o valor típico (a mediana): um mês com desconto não derruba a sugestão.
    const totals = [...byMonth.values()].sort((a, b) => a - b)
    const typical = totals[Math.floor(totals.length / 2)]!
    if (totals.filter((v) => Math.abs(v - typical) <= typical * TOLERANCE).length < MIN_MONTHS) continue
    const latest = txs.reduce((a, b) => (b.date > a.date ? b : a))
    // Cancelado: não apareceu neste mês nem no anterior.
    if (latest.date.slice(0, 7) < recentFrom) continue
    result.push({
      key,
      text: withoutInstallment(latest.description),
      direction: direction(latest),
      amount: typical,
      months: byMonth.size,
      latest,
    })
  }
  return result.sort((a, b) => b.months - a.months || a.text.localeCompare(b.text))
}

function direction(tx: BankTransaction): 'in' | 'out' {
  return tx.amount > 0 ? 'in' : 'out'
}

function monthKey(ym: { year: number; month: number }): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`
}
