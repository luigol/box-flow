import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import type { BankTransaction } from '../domain/bank'
import { occurrences, type Commitment } from '../domain/commitment'
import type { StoredBillLike } from '../domain/commitmentTypes'
import { forecastHorizon } from '../domain/forecast'
import { reconcile, type ReconciledOccurrence } from '../domain/reconcile'
import { db } from './instance'

export interface TxLink {
  commitmentId: string
  occurrenceKey: string
  /** `true` quando ligado sozinho pelo texto do banco (desfazer = "desvincular"). */
  auto: boolean
}

export interface Reconciliation {
  commitments: Commitment[]
  occurrences: ReconciledOccurrence[]
  /** Compromissos a que cada lançamento está ligado. */
  byTx: Map<string, TxLink[]>
  /** Categoria vinda do compromisso, por lançamento (vence as regras). */
  commitmentCategory: Map<string, string>
}

/** Situação de todos os previstos, recalculada quando qualquer dado muda. */
export function useReconciliation(): Reconciliation | undefined {
  const data = useLiveQuery(
    async () => ({
      commitments: await db.commitments.toArray(),
      transactions: await db.transactions.toArray(),
      bills: await db.bills.toArray(),
      links: await db.commitmentLinks.toArray(),
      unlinks: await db.commitmentUnlinks.toArray(),
      skips: await db.skips.toArray(),
    }),
    [],
  )
  return useMemo(() => {
    if (!data) return undefined
    const today = new Date()
    const { occurrences: list } = reconcile({
      ...data,
      skips: data.skips.map((s) => s.key),
      today,
      until: forecastHorizon(today),
    })
    const manual = new Set(data.links.map((l) => `${l.txId}|${l.occurrenceKey}`))
    const commitmentsById = new Map(data.commitments.map((c) => [c.id, c]))
    const byTx = new Map<string, TxLink[]>()
    const weight = new Map<string, number>()
    const commitmentCategory = new Map<string, string>()
    for (const o of list) {
      for (const txId of o.txIds) {
        byTx.set(txId, [...(byTx.get(txId) ?? []), { commitmentId: o.commitmentId, occurrenceKey: o.key, auto: !manual.has(`${txId}|${o.key}`) }])
        // Lançamento ligado a vários compromissos: vale a categoria do de maior valor esperado.
        const categoryId = commitmentsById.get(o.commitmentId)?.categoryId
        if (categoryId && Math.abs(o.amount) > (weight.get(txId) ?? -1)) {
          weight.set(txId, Math.abs(o.amount))
          commitmentCategory.set(txId, categoryId)
        }
      }
    }
    return { commitments: data.commitments, occurrences: list, byTx, commitmentCategory }
  }, [data])
}

export async function linkTransaction(txId: string, occurrenceKey: string): Promise<void> {
  await db.commitmentLinks.put({ txId, occurrenceKey })
}

/** Desfaz o vínculo: o confirmado sai; o automático vira "desvincular" (não se liga de novo). */
export async function unlinkTransaction(txId: string, link: TxLink): Promise<void> {
  if (link.auto) await db.commitmentUnlinks.put({ txId, commitmentId: link.commitmentId })
  else await db.commitmentLinks.delete([txId, link.occurrenceKey])
}

export async function skipOccurrence(key: string): Promise<void> {
  await db.skips.put({ key })
}

/** A ocorrência do compromisso mais próxima do lançamento (pela data agendada). */
export function nearestOccurrenceKey(commitment: Commitment, tx: BankTransaction, bills: StoredBillLike[]): string | undefined {
  const from = commitment.kind === 'recurring' && commitment.historyFrom ? commitment.historyFrom : commitment.start
  const until = { year: Number(tx.date.slice(0, 4)) + 1, month: Number(tx.date.slice(5, 7)) }
  const list = occurrences({ ...commitment, start: from }, { until, bills })
  let best: { key: string; distance: number } | undefined
  for (const o of list) {
    const distance = Math.abs(Date.parse(o.chargeDate) - Date.parse(tx.date))
    if (!best || distance < best.distance) best = { key: o.key, distance }
  }
  return best?.key
}
