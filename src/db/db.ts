import Dexie, { type DexieOptions, type EntityTable, type Table, type Transaction } from 'dexie'
import type { CommitmentLink } from '../domain/reconcile'
import type { BankAccount, BankTransaction } from '../domain/bank'
import type { CardBill } from '../domain/card'
import { DEFAULT_CATEGORIES, type Category, type Rule } from '../domain/category'
import type { Commitment } from '../domain/commitment'

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

/** Categoria escolhida à mão para um lançamento. Vence qualquer regra. */
export interface ManualClassification {
  txId: string
  categoryId: string
}

export interface IgnoredSuggestion {
  key: string
  text: string
  direction: 'in' | 'out'
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
  categories!: EntityTable<Category, 'id'>
  rules!: EntityTable<Rule, 'id'>
  classifications!: EntityTable<ManualClassification, 'txId'>
  commitments!: EntityTable<Commitment, 'id'>
  /** Vínculos confirmados pelo usuário (lançamento ↔ ocorrência). Os automáticos são calculados. */
  commitmentLinks!: Table<CommitmentLink, [string, string]>
  /** "Desvincular": o lançamento não se liga sozinho a este compromisso. */
  commitmentUnlinks!: Table<{ txId: string; commitmentId: string }, [string, string]>
  /** Ocorrências marcadas como "não aconteceu neste mês". */
  skips!: EntityTable<{ key: string }, 'key'>
  /** Sugestões de recorrente que o usuário mandou ignorar (o texto fica para poder mostrar de novo em Ajustes). */
  ignoredSuggestions!: EntityTable<IgnoredSuggestion, 'key'>

  constructor(name = 'box-flow', options?: DexieOptions) {
    super(name, options)
    this.version(1).stores({
      accounts: 'id, itemId',
      transactions: 'id, accountId, date, status',
      bills: 'id, accountId',
      connections: 'itemId',
      settings: 'key',
    })
    this.version(2)
      .stores({ categories: 'id', rules: 'id, source', classifications: 'txId' })
      .upgrade(seedCategories)
    this.version(3).stores({ commitments: 'id' })
    this.version(4).stores({
      commitmentLinks: '[txId+occurrenceKey], txId, occurrenceKey',
      commitmentUnlinks: '[txId+commitmentId], txId',
      skips: 'key',
    })
    this.version(5).stores({ ignoredSuggestions: 'key' })
    // Banco criado do zero (sem passar pelo upgrade): também recebe as categorias padrão.
    this.on('populate', seedCategories)
  }
}

async function seedCategories(tx: Transaction): Promise<void> {
  await tx.table('categories').bulkPut(DEFAULT_CATEGORIES.map(({ id }) => ({ id })))
}
