import type { BoxFlowDb, StoredBill } from '../db/db'
import type { BankTransaction } from '../domain/bank'
import { addMonths, currentMonth } from '../lib/month'
import type { createPluggyClient } from '../pluggy/client'
import { fromPluggyAccount, fromPluggyBill, fromPluggyTransaction } from '../pluggy/convert'

/** O que a atualização usa da Pluggy (o cliente real ou um de mentira nos testes). */
export type SyncClient = Pick<
  ReturnType<typeof createPluggyClient>,
  'getItem' | 'listAccounts' | 'listTransactions' | 'listBills'
>

/**
 * Período aberto: o que ainda pode mudar no banco. É o mês atual, o anterior e tudo o que está
 * pendente (fatura aberta, parcelas futuras). O resto é fechado e não muda mais.
 */
function openPeriod(today: Date): (tx: BankTransaction) => boolean {
  const from = addMonths(currentMonth(today), -1)
  const openFrom = `${from.year}-${String(from.month).padStart(2, '0')}-01`
  return (tx) => tx.status === 'pending' || tx.date >= openFrom
}

/**
 * Atualiza no aparelho tudo o que vem de uma conexão (banco) da Pluggy.
 * Lançamento novo sempre entra; os já guardados seguem o período aberto ou fechado.
 * Grava tudo de uma vez: se a Pluggy falhar no meio, nada do que estava guardado muda.
 */
export async function syncConnection(db: BoxFlowDb, client: SyncClient, itemId: string, today = new Date()) {
  const item = await client.getItem(itemId)
  const accounts = (await client.listAccounts(itemId)).map(fromPluggyAccount)
  const transactions: BankTransaction[] = []
  const bills: StoredBill[] = []
  for (const account of accounts) {
    transactions.push(...(await client.listTransactions(account.id)).map(fromPluggyTransaction))
    if (account.kind === 'credit_card') {
      bills.push(...(await client.listBills(account.id)).map((b) => ({ ...fromPluggyBill(b), accountId: account.id })))
    }
  }

  const isOpen = openPeriod(today)

  await db.transaction('rw', [db.accounts, db.transactions, db.bills, db.connections], async () => {
    const incoming = new Set(transactions.map((t) => t.id))
    const stored = await db.transactions.where('accountId').anyOf(accounts.map((a) => a.id)).toArray()
    const closed = new Set(stored.filter((t) => !isOpen(t)).map((t) => t.id))
    // Aberto: igual ao banco (o que sumiu de lá some daqui). Fechado: não muda mais.
    const vanished = stored.filter((t) => isOpen(t) && !incoming.has(t.id))
    await db.transactions.bulkDelete(vanished.map((t) => t.id))
    await db.accounts.bulkPut(accounts)
    await db.transactions.bulkPut(transactions.filter((t) => !closed.has(t.id)))
    await db.bills.bulkPut(bills)
    await db.connections.put({
      itemId,
      status: item.status,
      consentExpiresAt: item.consentExpiresAt ?? undefined,
      lastUpdatedAt: item.lastUpdatedAt ?? undefined,
      nextAutoSyncAt: item.nextAutoSyncAt ?? undefined,
      syncedAt: today.toISOString(),
    })
  })
}
