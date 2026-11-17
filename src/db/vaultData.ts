import type { BoxFlowDb, PluggySettings } from './db'
import { importRuleEntries, type ImportResult, type RulesFileRule } from './rulesImport'
import { readPluggySettings, writePluggySettings } from './settings'

/** Tabelas que vão no backup (as configurações vão em `pluggy`). */
const BACKUP_TABLES = ['accounts', 'transactions', 'bills', 'connections', 'categories', 'rules', 'classifications'] as const

/**
 * Conteúdo do arquivo trancado (docs/design.md, "Arquivo trancado"). Todas as partes são opcionais:
 * - `pluggy`: credenciais e Item IDs;
 * - `rules`: regras no formato do arquivo de regras (texto + nome da categoria), gravadas como importadas;
 * - `tables`: cópia das tabelas do app (backup). Ao abrir, substitui o que havia nelas.
 */
export interface VaultPayload {
  pluggy?: PluggySettings
  rules?: RulesFileRule[]
  tables?: Partial<Record<(typeof BACKUP_TABLES)[number], unknown[]>>
}

export interface ApplyResult {
  pluggy: boolean
  rules?: ImportResult
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
  return result
}
