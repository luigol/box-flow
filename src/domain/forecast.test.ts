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

  it('previsto com data antes de hoje não aparece (até existir o vínculo com o banco)', () => {
    const commitments = [recurring('antes', { day: 3 }), recurring('hoje', { day: 5 }), recurring('depois', { day: 20 })]

    const list = monthForecast({ year: 2026, month: 11 }, { commitments, bills: [], today: TODAY })

    expect(list.map((o) => o.commitmentId)).toEqual(['depois', 'hoje'])
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
