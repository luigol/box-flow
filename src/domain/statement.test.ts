import { describe, expect, it } from 'vitest'
import type { BankAccount, BankTransaction } from './bank'
import type { CardBill } from './card'
import { TRANSFER } from './category'
import { monthStatement, monthTotals, type StatementEntry } from './statement'

// Dados inventados: o repositório é público.
const checking: BankAccount = { id: 'acc1', itemId: 'item1', kind: 'checking', name: 'CONTA EXEMPLO', balance: 0 }
const card: BankAccount = { id: 'card1', itemId: 'item1', kind: 'credit_card', name: 'CARTAO EXEMPLO', balance: 0 }

function tx(id: string, fields: Partial<BankTransaction> = {}): BankTransaction {
  return { id, accountId: 'acc1', date: '2026-11-10', status: 'posted', description: id, amount: -1000, ...fields }
}

const NOVEMBER = { year: 2026, month: 11 }

describe('monthStatement: lançamentos que caem num mês', () => {
  it('conta corrente: cada lançamento entra pelo seu dia', () => {
    const transactions = [tx('nov', { date: '2026-11-05' }), tx('out', { date: '2026-10-31' })]

    const ids = monthStatement(NOVEMBER, { accounts: [checking], transactions, bills: [] }).map((e) => e.tx.id)

    expect(ids).toEqual(['nov'])
  })

  it('cartão: entra no mês em que o dinheiro sai, não no dia da compra', () => {
    const bills: (CardBill & { accountId: string })[] = [
      { id: 'b1', accountId: 'card1', dueDate: '2026-11-15', total: 2000, payments: [] },
    ]
    const transactions = [
      tx('compra-out', { accountId: 'card1', date: '2026-10-25', card: { billId: 'b1' } }),
      tx('compra-nov', { accountId: 'card1', date: '2026-11-20', status: 'pending', card: { billForecastMonth: '2026-12' } }),
    ]

    const ids = monthStatement(NOVEMBER, { accounts: [card], transactions, bills }).map((e) => e.tx.id)

    expect(ids).toEqual(['compra-out'])
  })

  it('cartão novo, sem fatura fechada: mês previsto pelo banco ou, sem previsão, o da compra', () => {
    const transactions = [
      tx('prevista', { accountId: 'card1', date: '2026-10-28', status: 'pending', card: { billForecastMonth: '2026-11' } }),
      tx('sem-previsao', { accountId: 'card1', date: '2026-11-08', status: 'pending', card: {} }),
    ]

    const ids = monthStatement(NOVEMBER, { accounts: [card], transactions, bills: [] }).map((e) => e.tx.id)

    expect(ids.sort()).toEqual(['prevista', 'sem-previsao'])
  })

  it('mais recente primeiro', () => {
    const transactions = [tx('dia-03', { date: '2026-11-03' }), tx('dia-21', { date: '2026-11-21' }), tx('dia-12', { date: '2026-11-12' })]

    const ids = monthStatement(NOVEMBER, { accounts: [checking], transactions, bills: [] }).map((e) => e.tx.id)

    expect(ids).toEqual(['dia-21', 'dia-12', 'dia-03'])
  })
})

describe('monthTotals: entradas, saídas e resultado do mês', () => {
  const entry = (id: string, amount: number): StatementEntry => ({ tx: tx(id, { amount }), account: checking })
  const noCategory = () => undefined

  it('soma entradas e saídas e calcula o resultado', () => {
    const entries = [entry('salario', 300_000), entry('mercado', -2_317), entry('farmacia', -10_000)]

    expect(monthTotals(entries, noCategory)).toEqual({ income: 300_000, expense: -12_317, net: 287_683 })
  })

  it('transferências entre suas contas não entram', () => {
    const entries = [entry('salario', 300_000), entry('fatura-sai', -50_000), entry('fatura-entra', 50_000), entry('mercado', -2_317)]
    const categoryOf = (e: StatementEntry) => (e.tx.id.startsWith('fatura') ? TRANSFER : undefined)

    expect(monthTotals(entries, categoryOf)).toEqual({ income: 300_000, expense: -2_317, net: 297_683 })
  })
})
