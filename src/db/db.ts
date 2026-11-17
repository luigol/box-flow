import Dexie, { type DexieOptions, type EntityTable } from 'dexie'
import type { BankAccount, BankTransaction } from '../domain/bank'
import type { CardBill } from '../domain/card'

export interface StoredBill extends CardBill {
  accountId: string
}

/** Conexão com um banco na Pluggy (item) e o resultado da última atualização. */
export interface Connection {
  itemId: string
  status?: string
  consentExpiresAt?: string
  /** Última vez que a Pluggy sincronizou com o banco. */
  lastUpdatedAt?: string
  nextAutoSyncAt?: string
  /** Última vez que o app atualizou a partir da Pluggy. */
  syncedAt?: string
  /** Mensagem do último erro ao atualizar, se houve. */
  error?: string
}

export interface PluggySettings {
  clientId: string
  clientSecret: string
  itemIds: string[]
}

interface Setting {
  key: string
  value: unknown
}

/** Banco de dados local, só no aparelho (IndexedDB). */
export class BoxFlowDb extends Dexie {
  accounts!: EntityTable<BankAccount, 'id'>
  transactions!: EntityTable<BankTransaction, 'id'>
  bills!: EntityTable<StoredBill, 'id'>
  connections!: EntityTable<Connection, 'itemId'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'box-flow', options?: DexieOptions) {
    super(name, options)
    this.version(1).stores({
      accounts: 'id, itemId',
      transactions: 'id, accountId, date, status',
      bills: 'id, accountId',
      connections: 'itemId',
      settings: 'key',
    })
  }
}
