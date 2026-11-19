import { describe, expect, it } from 'vitest'
import type { BankTransaction } from './bank'
import type { Commitment } from './commitment'
import { reconcile, type ReconcileInput } from './reconcile'

// Dados inventados: o repositório é público.
const TODAY = new Date(2026, 11, 20) // 20/12/2026
const UNTIL = { year: 2026, month: 12 }

function subscription(fields: Partial<Commitment> = {}): Commitment {
  return {
    id: 'sub', kind: 'recurring', name: 'Assinatura exemplo', direction: 'out', amount: 5_000, amountMode: 'fixed',
    frequency: 'monthly', day: 15, start: { year: 2026, month: 11 }, bankText: 'STREAMING EXEMPLO', ...fields,
  } as Commitment
}

function tx(id: string, date: string, fields: Partial<BankTransaction> = {}): BankTransaction {
  return { id, accountId: 'acc1', date, status: 'posted', description: `STREAMING EXEMPLO ${id}`, amount: -5_000, ...fields }
}

function input(fields: Partial<ReconcileInput>): ReconcileInput {
  return { commitments: [], transactions: [], bills: [], links: [], unlinks: [], skips: [], today: TODAY, until: UNTIL, ...fields }
}

const view = (r: ReturnType<typeof reconcile>) => r.occurrences.map((o) => [o.key, o.status, o.txIds])

describe('reconcile: situação de cada previsto', () => {
  it('lançamento com o texto do compromisso, até 10 dias da data, realiza o previsto sozinho', () => {
    const result = reconcile(input({ commitments: [subscription()], transactions: [tx('nov', '2026-11-22'), tx('dez', '2026-12-08')] }))

    expect(view(result)).toEqual([
      ['sub:2026-11', 'realized', ['nov']],
      ['sub:2026-12', 'realized', ['dez']],
    ])
  })

  it('sem lançamento na janela: data passada fica atrasado, data futura fica pendente', () => {
    const result = reconcile(
      input({
        commitments: [subscription()],
        transactions: [tx('longe', '2026-11-30')], // 15 dias depois de 15/11: fora da janela
        until: { year: 2027, month: 1 },
      }),
    )

    expect(view(result)).toEqual([
      ['sub:2026-11', 'late', []],
      ['sub:2026-12', 'late', []],
      ['sub:2027-01', 'pending', []],
    ])
  })

  it('respeita a conta do compromisso e o sentido (estorno não realiza uma despesa)', () => {
    const result = reconcile(
      input({
        commitments: [subscription({ accountId: 'acc1' })],
        transactions: [
          tx('outra-conta', '2026-12-15', { accountId: 'acc2' }),
          tx('estorno', '2026-12-16', { amount: 5_000 }),
          tx('certo', '2026-12-14'),
        ],
      }),
    )

    expect(result.occurrences.find((o) => o.key === 'sub:2026-12')?.txIds).toEqual(['certo'])
  })

  it('vários lançamentos realizam um previsto: vale a soma (salário que chega em vários Pix)', () => {
    const salary = subscription({ id: 'sal', direction: 'in', amount: 400_000, day: 2, bankText: 'Pix recebido EMPRESA EXEMPLO' })
    const pix = (id: string, date: string, amount: number) => tx(id, date, { description: 'Pix recebido EMPRESA EXEMPLO LTDA', amount })

    const result = reconcile(
      input({ commitments: [salary], transactions: [pix('a', '2026-12-01', 131_700), pix('b', '2026-12-02', 160_500), pix('c', '2026-12-02', 60_800)] }),
    )
    const december = result.occurrences.find((o) => o.key === 'sal:2026-12')

    expect({ status: december?.status, realized: december?.realized }).toEqual({ status: 'realized', realized: 353_000 })
  })

  it('"o valor precisa bater": só o lançamento com exatamente o valor do compromisso o realiza', () => {
    const contract = subscription({ id: 'contrato', direction: 'in', amount: 125_500, day: 2, bankText: 'Pix recebido EMPRESA EXEMPLO', exactAmount: true })
    const pix = (id: string, amount: number) => tx(id, '2026-12-02', { description: 'Pix recebido EMPRESA EXEMPLO LTDA', amount })

    const result = reconcile(input({ commitments: [contract], transactions: [pix('outro', 160_500), pix('certo', 125_500)] }))

    expect(result.occurrences.find((o) => o.key === 'contrato:2026-12')?.txIds).toEqual(['certo'])
  })

  it('o mais específico vence: o Pix que casou pelo valor sai do compromisso sem valor que tem o mesmo texto', () => {
    const text = 'Pix recebido EMPRESA EXEMPLO'
    const salary = subscription({ id: 'sal', direction: 'in', amount: 300_000, day: 2, bankText: text })
    const contract = subscription({ id: 'contrato', direction: 'in', amount: 125_500, day: 2, bankText: text, exactAmount: true })
    const pix = (id: string, amount: number) => tx(id, '2026-12-02', { description: `${text} LTDA`, amount })

    const result = reconcile(input({ commitments: [salary, contract], transactions: [pix('a', 160_500), pix('b', 125_500), pix('c', 145_000)] }))
    const december = (id: string) => result.occurrences.find((o) => o.key === `${id}:2026-12`)

    expect([december('sal')?.txIds, december('sal')?.realized, december('contrato')?.txIds]).toEqual([['a', 'c'], 305_500, ['b']])
  })

  it('receita parcelada com o texto do banco realiza sozinha; só o parcelado de saída (com pessoa) é sempre confirmado', () => {
    const contract: Commitment = {
      id: 'contrato', kind: 'installment', name: 'Contrato', person: 'Empresa', direction: 'in', amount: 125_500, amountMode: 'fixed',
      day: 2, start: { year: 2026, month: 12 }, total: 2, paid: 0, bankText: 'Pix recebido EMPRESA EXEMPLO',
    }

    const result = reconcile(input({ commitments: [contract], transactions: [tx('pix', '2026-12-02', { description: 'Pix recebido EMPRESA EXEMPLO LTDA', amount: 125_500 })] }))

    expect(result.occurrences.find((o) => o.key === 'contrato:2026-12')?.status).toBe('realized')
  })

  it('compra pendente no cartão já conta como realizada', () => {
    const result = reconcile(input({ commitments: [subscription()], transactions: [tx('pend', '2026-12-15', { status: 'pending' })] }))

    expect(result.occurrences.find((o) => o.key === 'sub:2026-12')?.status).toBe('realized')
  })

  it('Pix para pessoa (confirmar a cada mês) vira sugestão; não realiza sozinho', () => {
    const rent = subscription({ id: 'rent', day: 10, bankText: 'Pix enviado FULANO', confirmEach: true })
    const debt: Commitment = {
      id: 'debt', kind: 'installment', name: 'Notebook', person: 'Fulano', direction: 'out', amount: 14_500,
      amountMode: 'fixed', day: 10, start: { year: 2026, month: 12 }, total: 12, paid: 10, bankText: 'Pix enviado FULANO',
    }
    const result = reconcile(
      input({ commitments: [rent, debt], transactions: [tx('pix', '2026-12-10', { description: 'Pix enviado FULANO DE TAL', amount: -95_300 })] }),
    )

    expect(
      result.occurrences.filter((o) => o.key.endsWith('2026-12')).map((o) => [o.key, o.status, o.txIds, o.suggestions]),
    ).toEqual([
      ['rent:2026-12', 'late', [], ['pix']],
      ['debt:2026-12', 'late', [], ['pix']],
    ])
  })

  it('confirmado: um Pix realiza vários previstos, e cada um conta o seu valor esperado', () => {
    const rent = subscription({ id: 'rent', day: 10, amount: 66_500, bankText: 'Pix enviado FULANO', confirmEach: true })
    const debt: Commitment = {
      id: 'debt', kind: 'installment', name: 'Notebook', person: 'Fulano', direction: 'out', amount: 14_500,
      amountMode: 'fixed', day: 10, start: { year: 2026, month: 12 }, total: 12, paid: 10,
    }
    const pix = tx('pix', '2026-12-10', { description: 'Pix enviado FULANO DE TAL', amount: -95_300 })
    const links = [
      { txId: 'pix', occurrenceKey: 'rent:2026-12' },
      { txId: 'pix', occurrenceKey: 'debt:2026-12' },
    ]

    const result = reconcile(input({ commitments: [rent, debt], transactions: [pix], links }))

    expect(
      result.occurrences.filter((o) => o.key.endsWith('2026-12')).map((o) => [o.key, o.status, o.realized, o.suggestions]),
    ).toEqual([
      ['rent:2026-12', 'realized', -66_500, []],
      ['debt:2026-12', 'realized', -14_500, []],
    ])
  })

  it('desvincular impede o vínculo automático daquele lançamento com aquele compromisso', () => {
    const result = reconcile(
      input({ commitments: [subscription()], transactions: [tx('errado', '2026-12-15')], unlinks: [{ txId: 'errado', commitmentId: 'sub' }] }),
    )

    expect(result.occurrences.find((o) => o.key === 'sub:2026-12')).toMatchObject({ status: 'late', txIds: [] })
  })

  it('"não aconteceu neste mês" tira o previsto de atrasado', () => {
    const result = reconcile(input({ commitments: [subscription()], skips: ['sub:2026-11'] }))

    expect(view(result)).toEqual([
      ['sub:2026-11', 'skipped', []],
      ['sub:2026-12', 'late', []],
    ])
  })

  it('média dos últimos 3 meses realizados; antes disso, o valor informado', () => {
    const variable = subscription({ amountMode: 'average', amount: 50_000, start: { year: 2026, month: 9 } })
    const transactions = [
      tx('set', '2026-09-15', { amount: -40_000 }),
      tx('out', '2026-10-15', { amount: -44_000 }),
      tx('nov', '2026-11-15', { amount: -48_000 }),
    ]

    const result = reconcile(input({ commitments: [variable], transactions }))

    expect(result.occurrences.map((o) => [o.key, o.amount])).toEqual([
      ['sub:2026-09', -50_000],
      ['sub:2026-10', -50_000],
      ['sub:2026-11', -50_000],
      ['sub:2026-12', -44_000], // média de 40, 44 e 48
    ])
  })

  it('histórico: meses antes do início aparecem só se tiveram pagamento (sem "atrasado" falso)', () => {
    const linked = subscription({ start: { year: 2026, month: 12 }, historyFrom: { year: 2026, month: 8 } })
    const transactions = [tx('ago', '2026-08-15'), tx('out', '2026-10-14'), tx('dez', '2026-12-16')]

    const result = reconcile(input({ commitments: [linked], transactions }))

    expect(view(result)).toEqual([
      ['sub:2026-08', 'realized', ['ago']],
      ['sub:2026-10', 'realized', ['out']],
      ['sub:2026-12', 'realized', ['dez']],
    ])
  })
})
