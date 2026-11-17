import { describe, expect, it } from 'vitest'
import { cashOutDate, type CardBill } from './card'

// Valores e datas inventados: o repositório é público.
function bill(fields: Partial<CardBill> & Pick<CardBill, 'id' | 'dueDate'>): CardBill {
  return { total: 0, payments: [], ...fields }
}

describe('cashOutDate: dia em que o dinheiro de uma compra no cartão sai', () => {
  it('fatura fechada e paga no vencimento: sai no vencimento', () => {
    const bills = [
      bill({ id: 'b1', dueDate: '2026-11-15', total: 50_000, payments: [{ date: '2026-11-15', amount: 50_000 }] }),
    ]
    expect(cashOutDate({ billId: 'b1' }, bills)).toBe('2026-11-15')
  })

  it('fatura paga antes do vencimento, no mês anterior: sai no dia do pagamento', () => {
    // Fecha 28/11, vence 05/12, paga 30/11: a compra entra em novembro.
    const bills = [
      bill({ id: 'b1', dueDate: '2026-12-05', total: 32_000, payments: [{ date: '2026-11-30', amount: 32_000 }] }),
    ]
    expect(cashOutDate({ billId: 'b1' }, bills)).toBe('2026-11-30')
  })

  it('pagamentos misturados: vale o pagamento que completou o total', () => {
    // O banco lista fora de ordem e inclui pagamentos que não são desta fatura.
    const bills = [
      bill({
        id: 'b1',
        dueDate: '2026-12-15',
        total: 80_000,
        payments: [
          { date: '2027-01-10', amount: 40_000 },
          { date: '2026-12-02', amount: 30_000 },
          { date: '2026-12-10', amount: 50_000 },
        ],
      }),
    ]
    expect(cashOutDate({ billId: 'b1' }, bills)).toBe('2026-12-10')
  })

  it('fatura fechada e ainda não quitada: sai no vencimento', () => {
    const bills = [
      bill({ id: 'b1', dueDate: '2026-12-15', total: 80_000, payments: [{ date: '2026-12-02', amount: 30_000 }] }),
    ]
    expect(cashOutDate({ billId: 'b1' }, bills)).toBe('2026-12-15')
  })

  it('fatura paga com atraso: sai no dia do pagamento, no mês seguinte', () => {
    const bills = [
      bill({ id: 'b1', dueDate: '2026-12-15', total: 80_000, payments: [{ date: '2027-01-05', amount: 80_000 }] }),
    ]
    expect(cashOutDate({ billId: 'b1' }, bills)).toBe('2027-01-05')
  })

  it('compra pendente na fatura aberta: sai no vencimento previsto do mês indicado pelo banco', () => {
    const bills = [
      bill({ id: 'b0', dueDate: '2026-10-15' }),
      bill({ id: 'b1', dueDate: '2026-11-15' }),
    ]
    expect(cashOutDate({ billForecastMonth: '2026-12' }, bills)).toBe('2026-12-15')
  })

  it('vencimento adiado por feriado não muda o dia previsto das próximas faturas', () => {
    const bills = [
      bill({ id: 'b0', dueDate: '2026-08-15' }),
      bill({ id: 'b1', dueDate: '2026-09-15' }),
      bill({ id: 'b2', dueDate: '2026-10-18' }), // caiu no fim de semana e foi adiado
    ]
    expect(cashOutDate({ billForecastMonth: '2026-12' }, bills)).toBe('2026-12-15')
  })

  it('parcela futura: sai no vencimento do mês em que a parcela cai', () => {
    const bills = [bill({ id: 'b1', dueDate: '2026-11-15' })]
    expect(cashOutDate({ billForecastMonth: '2027-03' }, bills)).toBe('2027-03-15')
  })

  it('compra lançada à mão, antes de o banco sincronizar: sai no vencimento da fatura aberta', () => {
    // A última fatura fechada vence em novembro; a aberta é a de dezembro.
    const bills = [
      bill({ id: 'b0', dueDate: '2026-10-15' }),
      bill({ id: 'b1', dueDate: '2026-11-15' }),
    ]
    expect(cashOutDate({}, bills)).toBe('2026-12-15')
  })
})
