import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { balance, type Balance } from '../domain/balance'
import type { BankAccount, BankTransaction, Investment } from '../domain/bank'
import { classify } from '../domain/category'
import type { Commitment } from '../domain/commitment'
import { useClassification } from './classification'
import { db, loadPluggySettings } from './instance'
import { useReconciliation } from './reconciliation'

/** Janelas da aba Saldo, em meses (contando o atual). */
export const BALANCE_WINDOWS = [1, 3, 6, 12] as const

export interface BalancePrefs {
  months: number
  /** O botão "Investimentos". */
  investments: boolean
}

const PREFS_KEY = 'balance'
const DEFAULT_PREFS: BalancePrefs = { months: 3, investments: true }

/** O app lembra a janela e o botão de investimentos (preferência do aparelho, fora do backup). */
export function useBalancePrefs(): BalancePrefs {
  const row = useLiveQuery(() => db.settings.get(PREFS_KEY), [])
  return { ...DEFAULT_PREFS, ...(row?.value as Partial<BalancePrefs> | undefined) }
}

export async function saveBalancePrefs(prefs: BalancePrefs): Promise<void> {
  await db.settings.put({ key: PREFS_KEY, value: prefs })
}

export interface BalanceView extends Balance {
  accounts: BankAccount[]
  investments: Investment[]
  commitments: Map<string, Commitment>
  /** Ordem das conexões em Ajustes → Bancos: dá a cor de cada banco. */
  itemOrder: string[]
}

/** Saldo atual e previsto mês a mês (docs/design.md, "Aba Saldo"), recalculado quando os dados mudam. */
export function useBalance(prefs: BalancePrefs): BalanceView | undefined {
  const reconciliation = useReconciliation()
  const classification = useClassification()
  const data = useLiveQuery(
    async () => ({
      accounts: await db.accounts.toArray(),
      investments: await db.investments.toArray(),
      transactions: await db.transactions.toArray(),
      bills: await db.bills.toArray(),
      pluggy: await loadPluggySettings(),
    }),
    [],
  )
  return useMemo(() => {
    if (!data || !reconciliation || !classification) return undefined
    const accounts = new Map(data.accounts.map((a) => [a.id, a]))
    const ctx = { ...classification.ctx, commitmentCategory: reconciliation.commitmentCategory }
    const categoryOf = (tx: BankTransaction) => {
      const account = accounts.get(tx.accountId)
      return account && classify(tx, account, ctx)
    }
    const result = balance({
      accounts: data.accounts,
      investments: data.investments,
      includeInvestments: prefs.investments,
      transactions: data.transactions,
      bills: data.bills,
      occurrences: reconciliation.occurrences,
      categoryOf,
      today: new Date(),
      months: prefs.months,
    })
    return {
      ...result,
      accounts: data.accounts,
      investments: data.investments,
      commitments: new Map(reconciliation.commitments.map((c) => [c.id, c])),
      itemOrder: data.pluggy?.itemIds ?? [],
    }
  }, [data, reconciliation, classification, prefs.investments, prefs.months])
}
