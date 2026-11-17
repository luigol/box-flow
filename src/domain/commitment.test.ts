import { describe, expect, it } from 'vitest'
import { firstMonth, occurrences, type Commitment } from './commitment'

// Dados inventados: o repositório é público.
function recurring(fields: Partial<Commitment> = {}): Commitment {
  return {
    id: 'c1',
    kind: 'recurring',
    name: 'Aluguel exemplo',
    direction: 'out',
    amount: 80_000,
    amountMode: 'fixed',
    frequency: 'monthly',
    day: 10,
    start: { year: 2026, month: 11 },
    ...fields,
  } as Commitment
}

const dates = (list: { date: string }[]) => list.map((o) => o.date)

describe('occurrences: quando e com que valor um compromisso cai', () => {
  it('recorrente mensal na conta: no dia informado, todo mês, como saída', () => {
    const list = occurrences(recurring(), { until: { year: 2027, month: 1 }, bills: [] })

    expect(list.map((o) => [o.date, o.amount])).toEqual([
      ['2026-11-10', -80_000],
      ['2026-12-10', -80_000],
      ['2027-01-10', -80_000],
    ])
  })

  it('entrada (ex.: salário) vem positiva', () => {
    const list = occurrences(recurring({ direction: 'in', amount: 300_000 }), { until: { year: 2026, month: 11 }, bills: [] })

    expect(list.map((o) => o.amount)).toEqual([300_000])
  })

  it('dia que o mês não tem vira o último dia do mês', () => {
    const list = occurrences(recurring({ day: 31 }), { until: { year: 2027, month: 2 }, bills: [] })

    expect(dates(list)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'])
  })

  it('anual: uma vez por ano, no mês e no dia do início', () => {
    const list = occurrences(recurring({ frequency: 'yearly', day: 15, start: { year: 2027, month: 3 } }), {
      until: { year: 2028, month: 6 },
      bills: [],
    })

    expect(dates(list)).toEqual(['2027-03-15', '2028-03-15'])
  })

  it('encerrado: para no mês do encerramento', () => {
    const list = occurrences(recurring({ end: { year: 2026, month: 12 } }), { until: { year: 2027, month: 3 }, bills: [] })

    expect(dates(list)).toEqual(['2026-11-10', '2026-12-10'])
  })

  it('parcelado com pessoa: só as parcelas que faltam, numeradas, até a última (além do horizonte)', () => {
    const debt = {
      id: 'd1', kind: 'installment', name: 'Notebook', person: 'Fulano', direction: 'out', amount: 14_500,
      amountMode: 'fixed', day: 10, start: { year: 2026, month: 12 }, total: 12, paid: 10,
    } as const satisfies Commitment
    const long = { ...debt, total: 24, paid: 0 }

    const short = occurrences(debt, { until: { year: 2026, month: 12 }, bills: [] })
    const all = occurrences(long, { until: { year: 2026, month: 12 }, bills: [] })

    expect({
      short: short.map((o) => [o.date, o.installment]),
      longCount: all.length,
      longLast: all.at(-1)?.date,
    }).toEqual({
      short: [
        ['2026-12-10', { number: 11, total: 12 }],
        ['2027-01-10', { number: 12, total: 12 }],
      ],
      longCount: 24,
      longLast: '2028-11-10',
    })
  })

  it('no cartão: cai no vencimento da fatura em que a cobrança entra', () => {
    // Cartão que fecha dia 03 e vence dia 10. Cobrança até 2 dias antes do fechamento entra na
    // fatura que fecha naquele mês; a partir de 1 dia antes, vai para a seguinte.
    const bills = [
      { id: 'b1', accountId: 'card1', closingDate: '2026-09-03', dueDate: '2026-09-10', total: 0, payments: [] },
      { id: 'b2', accountId: 'card1', closingDate: '2026-10-03', dueDate: '2026-10-13', total: 0, payments: [] }, // feriado
      { id: 'b3', accountId: 'card1', closingDate: '2026-11-03', dueDate: '2026-11-10', total: 0, payments: [] },
    ]
    const options = { until: { year: 2026, month: 12 }, bills }
    const onCard = (day: number) => recurring({ accountId: 'card1', day, start: { year: 2026, month: 12 } })

    expect([21, 1, 2].map((day) => dates(occurrences(onCard(day), options)))).toEqual([
      ['2027-01-10'], // cobrado 21/12 → fecha 03/01 → vence 10/01
      ['2026-12-10'], // cobrado 01/12 → fecha 03/12 → vence 10/12
      ['2027-01-10'], // cobrado 02/12 → um dia antes do fechamento → fatura seguinte
    ])
  })
})

describe('firstMonth: primeiro previsto de um recorrente novo', () => {
  const today = new Date(2026, 10, 17) // criado em 17/11

  it('com o lançamento deste mês vinculado, começa neste mês (que já nasce realizado)', () => {
    expect(firstMonth(10, today, { linkedThisMonth: true })).toEqual({ year: 2026, month: 11 })
  })

  it('dia já passou sem lançamento: começa no mês seguinte', () => {
    expect(firstMonth(10, today, { linkedThisMonth: false })).toEqual({ year: 2026, month: 12 })
  })

  it('dia ainda não chegou: começa neste mês', () => {
    expect(firstMonth(25, today, { linkedThisMonth: false })).toEqual({ year: 2026, month: 11 })
  })
})
