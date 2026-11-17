import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import type { BankAccount, BankTransaction } from '../domain/bank'
import { classify } from '../domain/category'
import { cardInstallments, type CardInstallmentPurchase } from '../domain/installments'
import { recurringSuggestions, type RecurringSuggestion } from '../domain/suggestions'
import { useClassification } from './classification'
import { db } from './instance'
import type { Reconciliation } from './reconciliation'

export interface Discovery {
  /** Recorrentes que o extrato sugere. */
  suggestions: RecurringSuggestion[]
  /** Parcelados do cartão em andamento, vindos do banco. */
  installments: CardInstallmentPurchase[]
  accounts: Map<string, BankAccount>
  categoryOf: (tx: BankTransaction) => string | undefined
}

/** O que a aba Compromissos descobre sozinha no extrato (docs/design.md, "Compromisso"). */
export function useDiscovery(reconciliation: Reconciliation | undefined): Discovery | undefined {
  const classification = useClassification()
  const data = useLiveQuery(
    async () => ({
      accounts: await db.accounts.toArray(),
      transactions: await db.transactions.toArray(),
      bills: await db.bills.toArray(),
      ignored: await db.ignoredSuggestions.toArray(),
    }),
    [],
  )
  return useMemo(() => {
    if (!data || !classification || !reconciliation) return undefined
    const accounts = new Map(data.accounts.map((a) => [a.id, a]))
    const ctx = { ...classification.ctx, commitmentCategory: reconciliation.commitmentCategory }
    const categoryOf = (tx: BankTransaction) => {
      const account = accounts.get(tx.accountId)
      return account && classify(tx, account, ctx)
    }
    const today = new Date()
    return {
      suggestions: recurringSuggestions({
        transactions: data.transactions,
        commitments: reconciliation.commitments,
        linkedTxIds: new Set(reconciliation.byTx.keys()),
        categoryOf,
        ignored: new Set(data.ignored.map((i) => i.key)),
        today,
      }),
      installments: cardInstallments({ transactions: data.transactions, bills: data.bills, today }),
      accounts,
      categoryOf,
    }
  }, [data, classification, reconciliation])
}

/** "Ignorar": a sugestão some de Compromissos; dá para desfazer em Ajustes. */
export async function ignoreSuggestion(suggestion: RecurringSuggestion): Promise<void> {
  await db.ignoredSuggestions.put({ key: suggestion.key, text: suggestion.text, direction: suggestion.direction })
}

export async function showSuggestionAgain(key: string): Promise<void> {
  await db.ignoredSuggestions.delete(key)
}
