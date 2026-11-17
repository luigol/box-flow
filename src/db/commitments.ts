import { useLiveQuery } from 'dexie-react-hooks'
import type { Commitment } from '../domain/commitment'
import { currentMonth } from '../lib/month'
import { db } from './instance'

export function useCommitments(): Commitment[] | undefined {
  return useLiveQuery(() => db.commitments.toArray(), [])
}

export async function saveCommitment(commitment: Commitment): Promise<void> {
  await db.commitments.put(commitment)
}

/** Encerrar: o mês atual é o último com previsto; o que já aconteceu continua. */
export async function endCommitment(commitment: Commitment, today = new Date()): Promise<void> {
  if (commitment.kind !== 'recurring') return
  const ended: Commitment = { ...commitment, end: currentMonth(today) }
  await db.commitments.put(ended)
}

export async function deleteCommitment(id: string): Promise<void> {
  await db.commitments.delete(id)
}
