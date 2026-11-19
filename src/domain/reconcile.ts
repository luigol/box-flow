import { currentMonth, dateInMonth, type YearMonth } from '../lib/month'
import type { BankTransaction } from './bank'
import type { Cents } from './card'
import { normalize, searchText } from './category'
import { occurrences, type Commitment, type Occurrence } from './commitment'
import type { StoredBillLike } from './commitmentTypes'

/** Janela, em dias, entre a data agendada e o lançamento do banco (decisão Q15 do grill). */
const WINDOW_DAYS = 10

/** Vínculo confirmado pelo usuário entre um lançamento e uma ocorrência. */
export interface CommitmentLink {
  txId: string
  occurrenceKey: string
}

export interface ReconcileInput {
  commitments: Commitment[]
  transactions: BankTransaction[]
  bills: StoredBillLike[]
  links: CommitmentLink[]
  /** "Desvincular": o lançamento não pode ser ligado automaticamente a este compromisso. */
  unlinks: { txId: string; commitmentId: string }[]
  /** Ocorrências marcadas como "não aconteceu neste mês". */
  skips: string[]
  today: Date
  /** Horizonte dos recorrentes. */
  until: YearMonth
}

export interface ReconciledOccurrence extends Occurrence {
  status: 'realized' | 'pending' | 'late' | 'skipped'
  /** Lançamentos que realizam esta ocorrência. */
  txIds: string[]
  /** Valor realizado (com sinal), quando realizada. */
  realized?: Cents
  /** Lançamentos sugeridos para o usuário confirmar (Pix para pessoa). */
  suggestions: string[]
}

/** Situação de cada previsto (docs/design.md, "Previsto → realizado"). */
export function reconcile(input: ReconcileInput): { occurrences: ReconciledOccurrence[] } {
  const result: ReconciledOccurrence[] = []
  const today = dateInMonth(currentMonth(input.today), input.today.getDate())
  const txById = new Map(input.transactions.map((tx) => [tx.id, tx]))
  const skips = new Set(input.skips)
  const linkedByOccurrence = new Map<string, string[]>()
  const linksPerTx = new Map<string, number>()
  for (const link of input.links) {
    linkedByOccurrence.set(link.occurrenceKey, [...(linkedByOccurrence.get(link.occurrenceKey) ?? []), link.txId])
    linksPerTx.set(link.txId, (linksPerTx.get(link.txId) ?? 0) + 1)
  }

  const unlinkedOf = (commitment: Commitment) => new Set(input.unlinks.filter((u) => u.commitmentId === commitment.id).map((u) => u.txId))
  // Histórico: gera também os meses desde `historyFrom`; antes do início, só entram os que tiveram pagamento.
  const scheduleOf = (commitment: Commitment) => {
    const history = commitment.kind === 'recurring' && commitment.historyFrom ? commitment.historyFrom : undefined
    return occurrences(history ? { ...commitment, start: history } : commitment, { until: input.until, bills: input.bills })
  }

  // "O valor precisa bater": o lançamento que casou pelo valor sai dos compromissos sem essa opção (o mais específico vence).
  const claimed = new Set<string>()
  for (const commitment of input.commitments.filter((c) => c.exactAmount)) {
    const unlinked = unlinkedOf(commitment)
    for (const scheduled of scheduleOf(commitment)) {
      for (const tx of input.transactions) if (!unlinked.has(tx.id) && textMatches(commitment, scheduled, tx)) claimed.add(tx.id)
    }
  }

  for (const commitment of input.commitments) {
    // Parcelado com pessoa (saída) é sempre confirmado: o mesmo Pix pode pagar várias coisas. Receita parcelada segue a opção.
    const confirmEach = (commitment.kind === 'installment' && commitment.direction === 'out') || commitment.confirmEach === true
    const unlinked = unlinkedOf(commitment)
    const realizedHistory: Cents[] = []
    const startKey = `${commitment.id}:${commitment.start.year}-${String(commitment.start.month).padStart(2, '0')}`
    for (const scheduled of scheduleOf(commitment)) {
      const beforeStart = scheduled.key < startKey
      // Valor pela média dos últimos 3 meses realizados (opção do usuário); antes disso, o valor informado.
      const occurrence =
        commitment.amountMode === 'average' && realizedHistory.length >= 3
          ? { ...scheduled, amount: Math.round(realizedHistory.slice(-3).reduce((s, v) => s + v, 0) / 3) }
          : scheduled
      const candidates = input.transactions.filter(
        (tx) => !unlinked.has(tx.id) && (commitment.exactAmount || !claimed.has(tx.id)) && textMatches(commitment, occurrence, tx),
      )
      const confirmed = (linkedByOccurrence.get(occurrence.key) ?? []).flatMap((id) => txById.get(id) ?? [])
      const matched = unique([...confirmed, ...(confirmEach ? [] : candidates)])
      // Um lançamento ligado a vários previstos (o Pix que paga duas coisas) conta, em cada um, o valor esperado.
      const realized = matched.reduce((sum, tx) => sum + ((linksPerTx.get(tx.id) ?? 0) > 1 ? occurrence.amount : tx.amount), 0)
      if (matched.length) realizedHistory.push(realized)
      if (beforeStart && matched.length === 0) continue
      // Data passou e nada chegou: atrasado (decisão Q6), até chegar ou ser marcado "não aconteceu".
      const unrealized = skips.has(occurrence.key) ? 'skipped' : occurrence.chargeDate < today ? 'late' : 'pending'
      result.push({
        ...occurrence,
        status: matched.length ? 'realized' : unrealized,
        txIds: matched.map((tx) => tx.id),
        suggestions: confirmEach && matched.length === 0 ? candidates.map((tx) => tx.id) : [],
        ...(matched.length ? { realized } : {}),
      })
    }
  }
  return { occurrences: result }
}

function unique(list: BankTransaction[]): BankTransaction[] {
  return [...new Map(list.map((tx) => [tx.id, tx])).values()]
}

/** O lançamento corresponde à ocorrência? Texto do compromisso, mesma conta (se informada), mesmo sentido, na janela. */
function textMatches(commitment: Commitment, occurrence: Occurrence, tx: BankTransaction): boolean {
  if (!commitment.bankText || !searchText(tx).includes(normalize(commitment.bankText))) return false
  if (commitment.accountId && tx.accountId !== commitment.accountId) return false
  if ((commitment.direction === 'out') !== tx.amount < 0) return false
  if (commitment.exactAmount && Math.abs(tx.amount) !== commitment.amount) return false
  return Math.abs(daysBetween(tx.date, occurrence.chargeDate)) <= WINDOW_DAYS
}

function daysBetween(a: string, b: string): number {
  return (Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86_400_000
}
