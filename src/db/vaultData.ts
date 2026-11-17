import { normalize } from '../domain/category'
import type { Commitment } from '../domain/commitment'
import type { BoxFlowDb, PluggySettings } from './db'
import { categoriesByName, importRuleEntries, type ImportResult, type RulesFileRule } from './rulesImport'
import { readPluggySettings, writePluggySettings } from './settings'

/** Tabelas que vão no backup (as configurações vão em `pluggy`). */
const BACKUP_TABLES = [
  'accounts',
  'transactions',
  'bills',
  'connections',
  'categories',
  'rules',
  'classifications',
  'commitments',
  'commitmentLinks',
  'commitmentUnlinks',
  'skips',
  'ignoredSuggestions',
] as const

/**
 * Conteúdo do arquivo trancado (docs/design.md, "Arquivo trancado"). Todas as partes são opcionais:
 * - `pluggy`: credenciais e Item IDs;
 * - `rules`: regras no formato do arquivo de regras (texto + nome da categoria), gravadas como importadas;
 * - `tables`: cópia das tabelas do app (backup). Ao abrir, substitui o que havia nelas.
 */
export interface VaultPayload {
  pluggy?: PluggySettings
  rules?: RulesFileRule[]
  /** Compromissos com a categoria pelo nome (gerados pelo script); entram como `import`. */
  commitments?: CommitmentFileEntry[]
  tables?: Partial<Record<(typeof BACKUP_TABLES)[number], unknown[]>>
}

/** Compromisso no arquivo: igual ao do app, mas com `category` (nome) no lugar de `categoryId`. */
export type CommitmentFileEntry = DistributiveOmit<Commitment, 'categoryId' | 'source'> & { category?: string }
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export interface ApplyResult {
  pluggy: boolean
  rules?: ImportResult
  commitments?: number
  /** Lançamentos restaurados do backup. */
  transactions?: number
}

/** Backup completo do aparelho: credenciais e todas as tabelas, inclusive os lançamentos. */
export async function exportVault(db: BoxFlowDb): Promise<VaultPayload> {
  const tables: VaultPayload['tables'] = {}
  for (const name of BACKUP_TABLES) tables[name] = await db.table(name).toArray()
  return { pluggy: await readPluggySettings(db), tables }
}

/** Grava no aparelho o que veio no arquivo trancado. */
export async function applyVault(db: BoxFlowDb, payload: VaultPayload): Promise<ApplyResult> {
  const result: ApplyResult = { pluggy: false }
  if (payload.tables) {
    const tables = payload.tables
    await db.transaction('rw', BACKUP_TABLES.map((name) => db.table(name)), async () => {
      for (const name of BACKUP_TABLES) {
        const rows = tables[name]
        if (!rows) continue
        await db.table(name).clear()
        await db.table(name).bulkAdd(rows)
      }
    })
    result.transactions = tables.transactions?.length
  }
  if (payload.pluggy) {
    await writePluggySettings(db, payload.pluggy)
    result.pluggy = true
  }
  if (payload.rules) result.rules = await importRuleEntries(db, payload.rules)
  if (payload.commitments) result.commitments = await importCommitments(db, payload.commitments)
  return result
}

/** Compromissos do arquivo substituem os que vieram de arquivo antes; os criados no app ficam. */
async function importCommitments(db: BoxFlowDb, entries: CommitmentFileEntry[]): Promise<number> {
  await db.transaction('rw', [db.categories, db.commitments], async () => {
    const byName = categoriesByName(await db.categories.toArray())
    const imported: Commitment[] = []
    for (const { category, ...entry } of entries) {
      let categoryId = category ? byName.get(normalize(category)) : undefined
      if (category && !categoryId) {
        categoryId = `c:${crypto.randomUUID()}`
        await db.categories.add({ id: categoryId, name: category.trim() })
        byName.set(normalize(category), categoryId)
      }
      imported.push({ ...entry, ...(categoryId ? { categoryId } : {}), source: 'import' } as Commitment)
    }
    const previous = (await db.commitments.toArray()).filter((c) => c.source === 'import').map((c) => c.id)
    await db.commitments.bulkDelete(previous)
    await db.commitments.bulkPut(imported)
  })
  return entries.length
}
