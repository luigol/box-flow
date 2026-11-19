import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import type { BankTransaction } from '../domain/bank'
import type { Commitment } from '../domain/commitment'
import type { PluggyTransaction } from '../pluggy/types'
import { syncConnection } from '../sync/sync'
import { BoxFlowDb } from './db'
import { readPluggySettings, writePluggySettings } from './settings'
import { applyVault, exportVault, type VaultPayload } from './vaultData'

// Dados inventados: o repositório é público.
let dbCount = 0
function freshDb() {
  return new BoxFlowDb(`vault-test-${++dbCount}`, { indexedDB, IDBKeyRange })
}

const PLUGGY = { clientId: 'client-id', clientSecret: 'client-secret', itemIds: ['item1', 'item2'] }

describe('applyVault: abrir o conteúdo do arquivo trancado', () => {
  it('arquivo do script (credenciais + regras) configura as duas coisas', async () => {
    const db = freshDb()

    await applyVault(db, { pluggy: PLUGGY, rules: [{ text: 'PADARIA EXEMPLO', category: 'Alimentação' }] })

    expect({
      pluggy: await readPluggySettings(db),
      rules: (await db.rules.where('source').equals('import').toArray()).map((r) => [r.text, r.categoryId]),
    }).toEqual({ pluggy: PLUGGY, rules: [['PADARIA EXEMPLO', 'food']] })
  })

  it('compromissos do arquivo: categoria pelo nome; abrir de novo substitui os do arquivo e mantém os criados no app', async () => {
    const db = freshDb()
    const mine: Commitment = {
      id: 'k:meu', kind: 'recurring', name: 'Criado no app', direction: 'out', amount: 1_000, amountMode: 'fixed',
      frequency: 'monthly', day: 1, start: { year: 2026, month: 12 },
    }
    await db.commitments.put(mine)
    const seed = (name: string) => ({
      id: 'seed:aluguel', kind: 'recurring' as const, name, category: 'Moradia', direction: 'out' as const, amount: 80_000,
      amountMode: 'fixed' as const, frequency: 'monthly' as const, day: 10, start: { year: 2026, month: 11 },
    })
    const old = { ...seed('Antigo'), id: 'seed:sumiu', category: 'Pet' }

    await applyVault(db, { commitments: [seed('Aluguel'), old] })
    await applyVault(db, { commitments: [seed('Aluguel novo')] })

    expect((await db.commitments.orderBy('id').toArray()).map((c) => [c.id, c.name, c.categoryId, c.source])).toEqual([
      ['k:meu', 'Criado no app', undefined, undefined],
      ['seed:aluguel', 'Aluguel novo', 'housing', 'import'],
    ])
  })

  it('backup exportado de um aparelho e aberto em outro deixa tudo igual', async () => {
    const phone = freshDb()
    await writePluggySettings(phone, PLUGGY)
    await phone.accounts.put({ id: 'acc1', itemId: 'item1', kind: 'checking', name: 'CONTA', balance: 12_345 })
    await phone.transactions.put({ id: 't1', accountId: 'acc1', date: '2025-03-10', status: 'posted', description: 'ANTIGA', amount: -4_000 })
    await phone.bills.put({ id: 'b1', accountId: 'card1', dueDate: '2026-11-15', total: 9_900, payments: [] })
    await phone.connections.put({ itemId: 'item1', status: 'UPDATED', syncedAt: '2026-11-17T12:00:00.000Z' })
    await phone.categories.put({ id: 'food', name: 'Comida' })
    await phone.categories.put({ id: 'c:pet', name: 'Pet' })
    await phone.rules.put({ id: 'user:1', source: 'user', text: 'PETSHOP', categoryId: 'c:pet', createdAt: '2026-11-17T12:00:00.000Z' })
    await phone.classifications.put({ txId: 't1', categoryId: 'c:pet' })
    const rent: Commitment = {
      id: 'k1', kind: 'recurring', name: 'Aluguel', direction: 'out', amount: 80_000, amountMode: 'fixed',
      frequency: 'monthly', day: 10, start: { year: 2026, month: 12 },
    }
    await phone.commitments.put(rent)
    await phone.commitmentLinks.put({ txId: 't1', occurrenceKey: 'k1:2026-12' })
    await phone.commitmentUnlinks.put({ txId: 't9', commitmentId: 'k1' })
    await phone.skips.put({ key: 'k1:2027-01' })
    await phone.ignoredSuggestions.put({ key: 'STREAMINGEXEMPLO|out', text: 'STREAMING EXEMPLO', direction: 'out' })
    await phone.investments.put({ id: 'cdb1', itemId: 'item1', name: 'CDB EXEMPLO', balance: 250_000 })

    const newPhone = freshDb()
    const fileContent = JSON.parse(JSON.stringify(await exportVault(phone))) as VaultPayload
    await applyVault(newPhone, fileContent)

    expect(await snapshot(newPhone)).toEqual(await snapshot(phone))
  })

  it('depois de restaurar, a atualização segue a regra dos 2 meses', async () => {
    const tx = (id: string, date: string, description: string): BankTransaction => ({
      id, accountId: 'acc1', date, status: 'posted', description, amount: -1_000,
    })
    const backup: VaultPayload = {
      tables: {
        accounts: [{ id: 'acc1', itemId: 'item1', kind: 'checking', name: 'CONTA', balance: 0 }],
        transactions: [
          tx('old', '2026-03-10', 'ANTIGA'), // fechado: o banco nem devolve mais
          tx('cancelled', '2026-11-05', 'CANCELADA'), // aberto: o banco cancelou depois do backup
          tx('revised', '2026-10-20', 'ORIGINAL'), // aberto (mês anterior): o banco revisou
        ],
      },
    }
    const bankNow = [
      rawTx('revised', '2026-10-20T15:00:00.000Z', 'REVISADA'),
      rawTx('new', '2026-11-18T15:00:00.000Z', 'NOVA'),
    ]
    const client = {
      getItem: async () => ({ id: 'item1', status: 'UPDATED' }),
      listAccounts: async () => [{ id: 'acc1', itemId: 'item1', type: 'BANK' as const, name: 'CONTA', balance: 0, currencyCode: 'BRL' }],
      listTransactions: async () => bankNow,
      listBills: async () => [],
      listInvestments: async () => [],
    }
    const db = freshDb()

    await applyVault(db, backup)
    await syncConnection(db, client, 'item1', new Date(2026, 10, 20)) // 20/11: aberto desde 01/10

    expect((await db.transactions.orderBy('id').toArray()).map((t) => [t.id, t.description])).toEqual([
      ['new', 'NOVA'],
      ['old', 'ANTIGA'],
      ['revised', 'REVISADA'],
    ])
  })
})

function rawTx(id: string, date: string, description: string): PluggyTransaction {
  return { id, accountId: 'acc1', description, currencyCode: 'BRL', amount: -10, date, type: 'DEBIT', status: 'POSTED' }
}

/** Conteúdo de todas as tabelas, para comparar dois aparelhos. */
async function snapshot(db: BoxFlowDb) {
  return Object.fromEntries(await Promise.all(db.tables.map(async (t) => [t.name, await t.toArray()] as const)))
}
