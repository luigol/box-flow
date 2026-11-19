import { describe, expect, it } from 'vitest'
import type { BankAccount, BankTransaction } from './bank'
import { balance, type BalanceInput } from './balance'
import { TRANSFER } from './category'
import type { ReconciledOccurrence } from './reconcile'

// Dados inventados: o repositório é público.
const TODAY = new Date(2026, 10, 19) // 19/11/2026

const CHECKING: BankAccount = { id: 'conta', itemId: 'item1', kind: 'checking', name: 'CONTA', balance: 100_000 }
const CARD: BankAccount = { id: 'cartao', itemId: 'item1', kind: 'credit_card', name: 'CARTAO', balance: -30_000 }

function occ(key: string, date: string, amount: number, fields: Partial<ReconciledOccurrence> = {}): ReconciledOccurrence {
  return { commitmentId: key.split(':')[0]!, key, chargeDate: date, date, amount, status: 'pending', txIds: [], suggestions: [], ...fields }
}

function input(fields: Partial<BalanceInput>): BalanceInput {
  return {
    accounts: [CHECKING, CARD], investments: [], includeInvestments: true, transactions: [], bills: [], occurrences: [],
    categoryOf: () => undefined, today: TODAY, months: 1, ...fields,
  }
}

describe('balance: saldo previsto mês a mês (docs/design.md, "Aba Saldo")', () => {
  it('saldo atual = contas + investimentos; o mês desconta os compromissos de saída que ainda vão acontecer', () => {
    const result = balance(input({
      investments: [{ id: 'cdb', itemId: 'item1', name: 'CDB', balance: 50_000 }],
      occurrences: [occ('academia:2026-11', '2026-11-25', -11_350)],
    }))

    expect(result.current).toBe(150_000)
    expect(result.months.map((m) => [m.month, m.committed, m.end.withIncome, m.end.withoutIncome])).toEqual([
      [{ year: 2026, month: 11 }, 11_350, 138_650, 138_650],
    ])
  })

  it('o saldo de um mês passa para o seguinte; "com receitas" soma as entradas previstas, "sem receitas" não', () => {
    const result = balance(input({
      months: 3,
      occurrences: [
        occ('salario:2026-12', '2026-12-05', 500_000),
        occ('aluguel:2026-12', '2026-12-10', -80_000),
        occ('aluguel:2027-01', '2027-01-10', -80_000),
      ],
    }))

    expect(result.months.map((m) => [m.month.month, m.receivable, m.committed, m.end.withIncome, m.end.withoutIncome])).toEqual([
      [11, 0, 0, 100_000, 100_000],
      [12, 500_000, 80_000, 520_000, 20_000],
      [1, 0, 80_000, 440_000, -60_000],
    ])
  })

  it('faturas: o que ainda vai sair do cartão entra no mês do vencimento; o pagamento da fatura anterior não conta', () => {
    const card = (id: string, amount: number, fields: Partial<BankTransaction>) =>
      ({ id, accountId: 'cartao', date: '2026-11-15', status: 'pending', description: id, amount, ...fields }) as BankTransaction
    const result = balance(input({
      months: 3,
      bills: [{ id: 'nov', accountId: 'cartao', dueDate: '2026-11-10', total: 20_000, payments: [{ date: '2026-11-10', amount: 20_000 }] }],
      transactions: [
        card('ja-paga', -20_000, { status: 'posted', card: { billId: 'nov' } }),
        card('compra', -15_000, { card: { billForecastMonth: '2026-12' } }),
        card('parcela', -5_000, { card: { billForecastMonth: '2027-01' } }),
        // O pagamento da fatura de novembro entra como crédito na fatura aberta.
        card('pagamento', 20_000, { card: { billForecastMonth: '2026-12' } }),
      ],
      categoryOf: (tx) => (tx.id === 'pagamento' ? TRANSFER : undefined),
    }))

    expect(result.months.map((m) => [m.month.month, m.bills, m.committed])).toEqual([
      [11, [], 0],
      [12, [{ accountId: 'cartao', date: '2026-12-10', amount: 15_000 }], 15_000],
      [1, [{ accountId: 'cartao', date: '2027-01-10', amount: 5_000 }], 5_000],
    ])
  })

  it('atrasado sem sugestão entra no mês atual; com Pix sugerido fica fora e vai para revisar; realizado e "não aconteceu" não contam', () => {
    const result = balance(input({
      occurrences: [
        occ('contador:2026-10', '2026-10-15', -18_900, { status: 'late' }),
        occ('salario:2026-10', '2026-10-05', 500_000, { status: 'late' }),
        occ('condominio:2026-11', '2026-11-10', -70_000, { status: 'late', suggestions: ['pix'] }),
        occ('academia:2026-11', '2026-11-05', -11_350, { status: 'realized', txIds: ['t1'] }),
        occ('seguro:2026-11', '2026-11-08', -30_000, { status: 'skipped' }),
      ],
    }))
    const [november] = result.months

    expect({
      outflows: november?.outflows.map((o) => o.key),
      inflows: november?.inflows.map((o) => o.key),
      review: result.review.map((o) => o.key),
    }).toEqual({ outflows: ['contador:2026-10'], inflows: ['salario:2026-10'], review: ['condominio:2026-11'] })
  })

  it('cartões: quanto falta pagar em cada um, além da janela, e o vencimento da próxima fatura', () => {
    const other: BankAccount = { id: 'outro', itemId: 'item1', kind: 'credit_card', name: 'OUTRO', balance: 0 }
    const result = balance(input({
      accounts: [CHECKING, CARD, other],
      bills: [{ id: 'nov', accountId: 'cartao', dueDate: '2026-11-10', total: 0, payments: [] }],
      transactions: [
        { id: 'a', accountId: 'cartao', date: '2026-11-15', status: 'pending', description: 'A', amount: -15_000, card: { billForecastMonth: '2026-12' } },
        { id: 'b', accountId: 'cartao', date: '2026-12-31', status: 'pending', description: 'B', amount: -5_000, card: { billForecastMonth: '2027-02' } },
      ],
    }))

    expect(result.cards).toEqual([
      { accountId: 'cartao', total: 20_000, next: '2026-12-10' },
      { accountId: 'outro', total: 0 },
    ])
  })

  it('com "Investimentos" desligado, o saldo atual e o previsto partem só das contas', () => {
    const result = balance(input({
      includeInvestments: false,
      investments: [{ id: 'cdb', itemId: 'item1', name: 'CDB', balance: 50_000 }],
      occurrences: [occ('academia:2026-11', '2026-11-25', -11_350)],
    }))

    expect([result.current, result.months[0]?.end.withIncome]).toEqual([100_000, 88_650])
  })
})
