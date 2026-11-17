import { describe, expect, it } from 'vitest'
import type { Commitment } from './commitment'
import { forecastTotals, monthForecast } from './forecast'

// Dados inventados: o repositório é público.
function recurring(id: string, fields: Partial<Commitment> = {}): Commitment {
  return {
    id, kind: 'recurring', name: id, direction: 'out', amount: 10_000, amountMode: 'fixed',
    frequency: 'monthly', day: 10, start: { year: 2026, month: 11 }, ...fields,
  } as Commitment
}

const TODAY = new Date(2026, 10, 5) // 05/11/2026

describe('monthForecast: previstos que caem num mês', () => {
  it('previstos do mês, de vários compromissos, do mais recente para o mais antigo', () => {
    const commitments = [recurring('aluguel', { day: 10 }), recurring('academia', { day: 25 }), recurring('salario', { day: 5, direction: 'in' })]

    const list = monthForecast({ year: 2026, month: 12 }, { commitments, bills: [], today: TODAY })

    expect(list.map((o) => [o.commitmentId, o.date])).toEqual([
      ['academia', '2026-12-25'],
      ['aluguel', '2026-12-10'],
      ['salario', '2026-12-05'],
    ])
  })

  it('realizado sai da lista (o lançamento já está lá); atrasado aparece; "não aconteceu" some', () => {
    const commitments = [
      recurring('pago', { day: 2, bankText: 'LOJA PAGA' }),
      recurring('atrasado', { day: 3 }),
      recurring('pulado', { day: 4 }),
      recurring('depois', { day: 20 }),
    ]
    const transactions = [{ id: 't1', accountId: 'acc1', date: '2026-11-02', status: 'posted' as const, description: 'LOJA PAGA', amount: -10_000 }]

    const list = monthForecast({ year: 2026, month: 11 }, { commitments, bills: [], today: TODAY, transactions, skips: ['pulado:2026-11'] })

    expect(list.map((o) => [o.commitmentId, o.status])).toEqual([
      ['depois', 'pending'],
      ['atrasado', 'late'],
    ])
  })

  it('depois de 12 meses à frente, só as parcelas (que vão até a última)', () => {
    const debt = {
      id: 'parcela', kind: 'installment', name: 'Notebook', person: 'Fulano', direction: 'out', amount: 14_500,
      amountMode: 'fixed', day: 10, start: { year: 2026, month: 11 }, total: 24, paid: 0,
    } as const satisfies Commitment
    const commitments = [recurring('aluguel'), debt]

    const within = monthForecast({ year: 2027, month: 11 }, { commitments, bills: [], today: TODAY })
    const beyond = monthForecast({ year: 2027, month: 12 }, { commitments, bills: [], today: TODAY })

    expect({ within: within.map((o) => o.commitmentId).sort(), beyond: beyond.map((o) => o.commitmentId) }).toEqual({
      within: ['aluguel', 'parcela'],
      beyond: ['parcela'],
    })
  })
})

describe('forecastTotals: entradas e saídas previstas', () => {
  it('soma separado o que entra e o que sai', () => {
    const list = [
      { commitmentId: 'salario', date: '2026-12-05', amount: 300_000 },
      { commitmentId: 'aluguel', date: '2026-12-10', amount: -80_000 },
      { commitmentId: 'academia', date: '2026-12-25', amount: -11_350 },
    ]

    expect(forecastTotals(list)).toEqual({ income: 300_000, expense: -91_350 })
  })
})
