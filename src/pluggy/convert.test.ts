import { describe, expect, it } from 'vitest'
import { fromPluggyAccount, fromPluggyBill, fromPluggyTransaction } from './convert'
import type { PluggyTransaction } from './types'

// Dados inventados, com a mesma forma que a Pluggy entrega: o repositório é público.
function rawTx(fields: Partial<PluggyTransaction> = {}): PluggyTransaction {
  return {
    id: 'tx1',
    accountId: 'acc1',
    description: 'PADARIA EXEMPLO',
    currencyCode: 'BRL',
    amount: -47.83,
    date: '2026-11-10T15:00:00.000Z',
    type: 'DEBIT',
    status: 'POSTED',
    ...fields,
  }
}

describe('fromPluggyTransaction: tradução de uma transação da Pluggy', () => {
  it('saída na conta corrente vira centavos negativos', () => {
    expect(fromPluggyTransaction(rawTx({ type: 'DEBIT', amount: -47.83 })).amount).toBe(-4783)
  })

  it('compra no cartão, que a Pluggy manda positiva, vira saída', () => {
    expect(fromPluggyTransaction(rawTx({ type: 'DEBIT', amount: 47.83 })).amount).toBe(-4783)
  })

  it('estorno ou pagamento no cartão, que a Pluggy manda negativo, vira entrada', () => {
    expect(fromPluggyTransaction(rawTx({ type: 'CREDIT', amount: -89.9 })).amount).toBe(8990)
  })

  it('data vem em UTC e vira o dia em Brasília', () => {
    // A conta corrente marca o fim do dia 03/11 em Brasília como 04/11 02:59:59 UTC.
    expect(fromPluggyTransaction(rawTx({ date: '2026-11-04T02:59:59.999Z' })).date).toBe('2026-11-03')
  })

  it('compra em dólar usa o valor em reais e guarda o original', () => {
    const tx = fromPluggyTransaction(
      rawTx({ type: 'DEBIT', currencyCode: 'USD', amount: 12, amountInAccountCurrency: 66.37 }),
    )
    expect({ amount: tx.amount, foreign: tx.foreign }).toEqual({
      amount: -6637,
      foreign: { currency: 'USD', amount: -1200 },
    })
  })

  it('parcela futura traz a parcela, a data da compra em Brasília e o mês previsto da fatura', () => {
    const tx = fromPluggyTransaction(
      rawTx({
        type: 'DEBIT',
        amount: 41.37,
        date: '2027-01-31T03:00:00.000Z',
        creditCardMetadata: {
          installmentNumber: 3,
          totalInstallments: 6,
          purchaseDate: '2026-11-06T01:40:00.000Z', // 05/11 às 22:40 em Brasília
          billForecastDate: '2027-02',
          billId: null,
        },
      }),
    )
    expect(tx.card).toEqual({
      installment: { number: 3, total: 6 },
      purchaseDate: '2026-11-05',
      billForecastMonth: '2027-02',
    })
  })

  it('guarda descrição, categoria do banco, estabelecimento e status', () => {
    const tx = fromPluggyTransaction(
      rawTx({
        description: 'PIX TRANSF FULANO 10/11',
        descriptionRaw: 'Pix enviado FULANO DE TAL',
        category: 'Transfer - PIX',
        merchant: { name: 'loja exemplo', businessName: 'LOJA EXEMPLO LTDA' },
        status: 'PENDING',
      }),
    )
    expect({
      description: tx.description,
      rawDescription: tx.rawDescription,
      bankCategory: tx.bankCategory,
      merchant: tx.merchant,
      status: tx.status,
    }).toEqual({
      description: 'PIX TRANSF FULANO 10/11',
      rawDescription: 'Pix enviado FULANO DE TAL',
      bankCategory: 'Transfer - PIX',
      merchant: 'LOJA EXEMPLO LTDA',
      status: 'pending',
    })
  })

  it('guarda só se o outro lado é pessoa ou empresa (sem o documento)', () => {
    const doc = (type: string, value: string) => ({ documentNumber: { type, value } })
    const sentToPerson = rawTx({ type: 'DEBIT', paymentData: { payer: doc('CPF', '111.222.333-44'), receiver: doc('CPF', '555.666.777-88') } })
    const receivedFromCompany = rawTx({ type: 'CREDIT', amount: 100, paymentData: { payer: doc('CNPJ', '12.345.678/0001-90'), receiver: doc('CPF', '111.222.333-44') } })

    expect([
      fromPluggyTransaction(sentToPerson).counterparty,
      fromPluggyTransaction(receivedFromCompany).counterparty,
      fromPluggyTransaction(rawTx()).counterparty,
    ]).toEqual(['person', 'company', undefined])
  })

  it('não guarda o CPF nem os dados de quem pagou ou recebeu', () => {
    const tx = fromPluggyTransaction(
      rawTx({
        paymentData: {
          payer: { documentNumber: { type: 'CPF', value: '123.456.789-09' } },
          receiver: { documentNumber: { type: 'CPF', value: '987.654.321-00' } },
        },
      }),
    )
    expect(JSON.stringify(tx)).not.toMatch(/123\.456|987\.654|paymentData|payer|receiver/)
  })
})

describe('fromPluggyBill: tradução de uma fatura', () => {
  it('datas da fatura são só o dia (sem fuso) e valores fracionados viram centavos', () => {
    const bill = fromPluggyBill({
      id: 'b1',
      dueDate: '2026-11-15T00:00:00.000Z',
      billClosingDate: '2026-11-08T00:00:00.000Z',
      totalAmount: 312.4971,
      payments: [{ paymentDate: '2026-11-12T00:00:00.000Z', amount: 312.5 }],
    })
    expect(bill).toEqual({
      id: 'b1',
      dueDate: '2026-11-15',
      closingDate: '2026-11-08',
      total: 31250,
      payments: [{ date: '2026-11-12', amount: 31250 }],
    })
  })
})

describe('fromPluggyAccount: tradução de uma conta', () => {
  it('cartão: o saldo da Pluggy é o limite usado e vira dívida (negativo)', () => {
    const account = fromPluggyAccount({
      id: 'acc2',
      itemId: 'item1',
      type: 'CREDIT',
      name: 'CARTAO EXEMPLO',
      number: '1234',
      balance: 812.4,
      currencyCode: 'BRL',
    })
    expect(account).toEqual({
      id: 'acc2',
      itemId: 'item1',
      kind: 'credit_card',
      name: 'CARTAO EXEMPLO',
      last4: '1234',
      balance: -81240,
    })
  })

  it('conta corrente: o saldo é o que tenho (positivo)', () => {
    const account = fromPluggyAccount({
      id: 'acc1',
      itemId: 'item1',
      type: 'BANK',
      name: 'CONTA EXEMPLO',
      number: '0001/12345-6',
      balance: 150.25,
      currencyCode: 'BRL',
    })
    expect({ kind: account.kind, balance: account.balance }).toEqual({ kind: 'checking', balance: 15025 })
  })
})
