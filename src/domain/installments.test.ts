import { describe, expect, it } from 'vitest'
import type { BankTransaction } from './bank'
import type { StoredBillLike } from './commitmentTypes'
import { cardInstallments } from './installments'

// Dados inventados: o repositório é público.
const TODAY = new Date(2026, 10, 17) // 17/11/2026

// Fatura de novembro, quitada no vencimento; as seguintes vencem no mesmo dia 10.
const BILLS: StoredBillLike[] = [
  { id: 'nov', accountId: 'card1', dueDate: '2026-11-10', total: 10_000, payments: [{ date: '2026-11-10', amount: 10_000 }] },
]

function installment(number: number, total: number, date: string, fields: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: `loja-${number}`, accountId: 'card1', date, status: 'pending', description: `LOJA EXEMPLO ${number}/${total}`, amount: -3_000,
    card: { installment: { number, total }, purchaseDate: '2026-10-20' }, ...fields,
  }
}

describe('cardInstallments: parcelados do cartão, reconhecidos do banco', () => {
  it('junta as parcelas de uma compra e conta como paga a parcela cujo dinheiro já saiu', () => {
    const transactions = [
      installment(1, 3, '2026-10-20', { status: 'posted', card: { billId: 'nov', installment: { number: 1, total: 3 }, purchaseDate: '2026-10-20' } }),
      installment(2, 3, '2026-11-30', { card: { billForecastMonth: '2026-12', installment: { number: 2, total: 3 }, purchaseDate: '2026-10-20' } }),
      installment(3, 3, '2026-12-31', { card: { billForecastMonth: '2027-01', installment: { number: 3, total: 3 }, purchaseDate: '2026-10-20' } }),
    ]

    expect(cardInstallments({ transactions, bills: BILLS, today: TODAY })).toEqual([
      { accountId: 'card1', description: 'LOJA EXEMPLO', purchaseDate: '2026-10-20', total: 3, paid: 1, remaining: 6_000, lastDate: '2027-01-10' },
    ])
  })

  it('compra antiga: as primeiras parcelas, fora do histórico, contam como pagas', () => {
    const transactions = [
      installment(8, 10, '2026-10-20', { status: 'posted', card: { billId: 'nov', installment: { number: 8, total: 10 } } }),
      installment(9, 10, '2026-11-30', { card: { billForecastMonth: '2026-12', installment: { number: 9, total: 10 } } }),
      installment(10, 10, '2026-12-31', { card: { billForecastMonth: '2027-01', installment: { number: 10, total: 10 } } }),
    ]

    const result = cardInstallments({ transactions, bills: BILLS, today: TODAY })

    expect(result.map((p) => [p.paid, p.total, p.remaining])).toEqual([[8, 10, 6_000]])
  })

  it('compra quitada sai da lista; mesmo texto com outra data de compra é outra compra; a que termina antes vem primeiro', () => {
    const paidCard = (n: number, total: number, purchaseDate: string) => ({ billId: 'nov', installment: { number: n, total }, purchaseDate })
    const future = (n: number, total: number, purchaseDate: string, month: string) => ({ billForecastMonth: month, installment: { number: n, total }, purchaseDate })
    const transactions = [
      // Quitada: as duas parcelas já saíram.
      installment(1, 2, '2026-10-01', { id: 'q1', status: 'posted', card: paidCard(1, 2, '2026-09-01') }),
      installment(2, 2, '2026-10-01', { id: 'q2', status: 'posted', card: paidCard(2, 2, '2026-09-01') }),
      // Mesma loja, comprada de novo em 05/11: vai até fevereiro.
      installment(1, 3, '2026-11-05', { id: 'n1', card: future(1, 3, '2026-11-05', '2026-12') }),
      installment(2, 3, '2026-12-31', { id: 'n2', card: future(2, 3, '2026-11-05', '2027-01') }),
      installment(3, 3, '2027-01-31', { id: 'n3', card: future(3, 3, '2026-11-05', '2027-02') }),
      // Outra compra, que termina em janeiro.
      installment(2, 2, '2026-12-31', { id: 'o2', description: 'OUTRA LOJA 2/2', card: future(2, 2, '2026-10-01', '2027-01') }),
    ]

    const result = cardInstallments({ transactions, bills: BILLS, today: TODAY })

    expect(result.map((p) => [p.description, p.purchaseDate, p.paid, p.remaining, p.lastDate])).toEqual([
      ['OUTRA LOJA', '2026-10-01', 1, 3_000, '2027-01-10'],
      ['LOJA EXEMPLO', '2026-11-05', 0, 9_000, '2027-02-10'],
    ])
  })
})
