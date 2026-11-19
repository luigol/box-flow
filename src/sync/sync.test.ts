import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { BoxFlowDb } from '../db/db'
import type { PluggyAccount, PluggyBill, PluggyInvestment, PluggyItem, PluggyTransaction } from '../pluggy/types'
import { syncConnection } from './sync'

// Dados inventados: o repositório é público.
const TODAY = new Date(2026, 10, 20) // 20/11/2026: período aberto desde 01/10/2026

let dbCount = 0
function freshDb() {
  return new BoxFlowDb(`test-${++dbCount}`, { indexedDB, IDBKeyRange })
}

function rawTx(id: string, fields: Partial<PluggyTransaction> = {}): PluggyTransaction {
  return {
    id,
    accountId: 'acc1',
    description: `COMPRA ${id}`,
    currencyCode: 'BRL',
    amount: -23.17,
    date: '2026-11-10T15:00:00.000Z',
    type: 'DEBIT',
    status: 'POSTED',
    ...fields,
  }
}

/** Banco de mentira atrás da Pluggy: cada teste ajusta o estado e chama a atualização. */
function fakeBank() {
  const state = {
    item: { id: 'item1', status: 'UPDATED', consentExpiresAt: '2027-06-01T12:00:00.000Z' } as PluggyItem,
    accounts: [
      { id: 'acc1', itemId: 'item1', type: 'BANK', name: 'CONTA EXEMPLO', balance: 120.5, currencyCode: 'BRL' },
    ] as PluggyAccount[],
    transactions: { acc1: [] as PluggyTransaction[] } as Record<string, PluggyTransaction[]>,
    bills: {} as Record<string, PluggyBill[]>,
    investments: [] as PluggyInvestment[],
  }
  const client = {
    getItem: async () => state.item,
    listAccounts: async () => state.accounts,
    listTransactions: async (accountId: string) => state.transactions[accountId] ?? [],
    listBills: async (accountId: string) => state.bills[accountId] ?? [],
    listInvestments: async () => state.investments,
  }
  return { state, client }
}

describe('syncConnection: atualização a partir da Pluggy', () => {
  it('primeira atualização guarda a conta, as transações e os dados da conexão', async () => {
    const db = freshDb()
    const bank = fakeBank()
    bank.state.transactions.acc1 = [rawTx('t1'), rawTx('t2', { type: 'CREDIT', amount: 300 })]

    await syncConnection(db, bank.client, 'item1', TODAY)

    expect({
      accounts: (await db.accounts.toArray()).map((a) => [a.id, a.kind, a.balance]),
      transactions: (await db.transactions.orderBy('id').toArray()).map((t) => [t.id, t.amount]),
      consent: (await db.connections.get('item1'))?.consentExpiresAt,
    }).toEqual({
      accounts: [['acc1', 'checking', 12050]],
      transactions: [
        ['t1', -2317],
        ['t2', 30000],
      ],
      consent: '2027-06-01T12:00:00.000Z',
    })
  })

  it('cartão: guarda também as faturas, ligadas à conta', async () => {
    const db = freshDb()
    const bank = fakeBank()
    bank.state.accounts.push({
      id: 'card1', itemId: 'item1', type: 'CREDIT', name: 'CARTAO EXEMPLO', balance: 210.3, currencyCode: 'BRL',
    })
    bank.state.bills.card1 = [{ id: 'b1', dueDate: '2026-11-15T00:00:00.000Z', totalAmount: 210.3, payments: [] }]

    await syncConnection(db, bank.client, 'item1', TODAY)

    expect(await db.bills.toArray()).toEqual([
      { id: 'b1', accountId: 'card1', dueDate: '2026-11-15', total: 21030, payments: [] },
    ])
  })

  it('investimentos: guarda só os ativos, em centavos; a atualização seguinte substitui os da conexão', async () => {
    const db = freshDb()
    const bank = fakeBank()
    bank.state.investments = [
      { id: 'cdb1', itemId: 'item1', name: 'CDB EXEMPLO', type: 'FIXED_INCOME', balance: 1234.56, status: 'ACTIVE' },
      { id: 'cdb2', itemId: 'item1', name: 'CDB RESGATADO', balance: 0, status: 'TOTAL_WITHDRAWAL' },
    ]
    await syncConnection(db, bank.client, 'item1', TODAY)
    const first = (await db.investments.toArray()).map((i) => [i.id, i.name, i.balance])

    await db.investments.put({ id: 'outro', itemId: 'item2', name: 'DE OUTRA CONEXAO', balance: 50_000 })
    bank.state.investments = [{ id: 'cdb3', itemId: 'item1', name: 'CDB NOVO', balance: 10, status: 'ACTIVE' }]
    await syncConnection(db, bank.client, 'item1', TODAY)

    expect({ first, second: (await db.investments.orderBy('id').toArray()).map((i) => [i.id, i.balance]) }).toEqual({
      first: [['cdb1', 'CDB EXEMPLO', 123_456]],
      second: [['cdb3', 1_000], ['outro', 50_000]],
    })
  })

  it('período aberto fica igual ao banco: o que sumiu de lá some daqui', async () => {
    const db = freshDb()
    const bank = fakeBank()
    bank.state.transactions.acc1 = [rawTx('t1', { date: '2026-11-10T15:00:00.000Z' }), rawTx('t2')]
    await syncConnection(db, bank.client, 'item1', TODAY)

    bank.state.transactions.acc1 = [rawTx('t2')] // o banco cancelou t1
    await syncConnection(db, bank.client, 'item1', TODAY)

    expect((await db.transactions.toArray()).map((t) => t.id)).toEqual(['t2'])
  })

  it('período fechado não muda: nem some, nem é alterado pelo banco', async () => {
    const db = freshDb()
    const bank = fakeBank()
    const september = { date: '2026-09-10T15:00:00.000Z', description: 'ORIGINAL' }
    bank.state.transactions.acc1 = [rawTx('old1', september), rawTx('old2', september)]
    await syncConnection(db, bank.client, 'item1', TODAY)

    bank.state.transactions.acc1 = [rawTx('old2', { ...september, description: 'ALTERADA' })] // old1 sumiu
    await syncConnection(db, bank.client, 'item1', TODAY)

    expect((await db.transactions.orderBy('id').toArray()).map((t) => [t.id, t.description])).toEqual([
      ['old1', 'ORIGINAL'],
      ['old2', 'ORIGINAL'],
    ])
  })

  it('pendente antiga que voltou liquidada com outro id: fica só a nova', async () => {
    const db = freshDb()
    const bank = fakeBank()
    const purchase = { date: '2026-09-28T15:00:00.000Z', description: 'LOJA EXEMPLO' }
    bank.state.transactions.acc1 = [rawTx('pend1', { ...purchase, status: 'PENDING' })]
    await syncConnection(db, bank.client, 'item1', TODAY)

    bank.state.transactions.acc1 = [rawTx('post1', { ...purchase, status: 'POSTED' })]
    await syncConnection(db, bank.client, 'item1', TODAY)

    expect((await db.transactions.toArray()).map((t) => [t.id, t.status])).toEqual([['post1', 'posted']])
  })

  it('lançamento novo sempre entra, mesmo com data no período fechado', async () => {
    const db = freshDb()
    const bank = fakeBank()
    await syncConnection(db, bank.client, 'item1', TODAY)

    bank.state.transactions.acc1 = [rawTx('late', { date: '2026-08-30T15:00:00.000Z' })] // banco sincronizou atrasado
    await syncConnection(db, bank.client, 'item1', TODAY)

    expect((await db.transactions.toArray()).map((t) => t.id)).toEqual(['late'])
  })

  it('se a Pluggy falha no meio, o que estava guardado continua igual', async () => {
    const db = freshDb()
    const bank = fakeBank()
    bank.state.transactions.acc1 = [rawTx('t1')]
    await syncConnection(db, bank.client, 'item1', TODAY)

    bank.state.transactions.acc1 = []
    bank.client.listTransactions = async () => {
      throw new Error('Pluggy fora do ar')
    }
    await expect(syncConnection(db, bank.client, 'item1', TODAY)).rejects.toThrow('Pluggy fora do ar')

    expect((await db.transactions.toArray()).map((t) => t.id)).toEqual(['t1'])
  })

  it('guarda quando a Pluggy sincronizou, a próxima sincronização e quando o app atualizou', async () => {
    const db = freshDb()
    const bank = fakeBank()
    bank.state.item = {
      ...bank.state.item,
      lastUpdatedAt: '2026-11-20T15:00:00.000Z',
      nextAutoSyncAt: '2026-11-21T15:00:00.000Z',
    }

    await syncConnection(db, bank.client, 'item1', TODAY)

    expect(await db.connections.get('item1')).toMatchObject({
      lastUpdatedAt: '2026-11-20T15:00:00.000Z',
      nextAutoSyncAt: '2026-11-21T15:00:00.000Z',
      syncedAt: TODAY.toISOString(),
    })
  })
})
