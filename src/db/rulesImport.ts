import { DEFAULT_CATEGORIES, normalize, type Category, type Rule } from '../domain/category'
import type { BoxFlowDb } from './db'

/**
 * Regra como vem no box-flow.json (docs/design.md, "Arquivo trancado"): texto + nome da categoria.
 * Ex.: { "text": "DL*99", "category": "Transporte por app" }
 */
export interface RulesFileRule {
  text?: unknown
  category?: unknown
}

export interface ImportResult {
  imported: number
  categoriesCreated: number
  problems: { rule: number; problem: 'missing-text' | 'missing-category' }[]
}

/**
 * Grava as regras do arquivo como `import`, criando as categorias que faltam. Substitui as importadas
 * antes (as criadas no app ficam); linha sem texto ou sem categoria é ignorada e avisada.
 */
export async function importRuleEntries(db: BoxFlowDb, entries: RulesFileRule[]): Promise<ImportResult> {
  const file = { rules: entries }
  const result: ImportResult = { imported: 0, categoriesCreated: 0, problems: [] }

  await db.transaction('rw', [db.categories, db.rules], async () => {
    const byName = categoriesByName(await db.categories.toArray())
    const rules: Rule[] = []
    for (const [index, entry] of file.rules.entries()) {
      const text = typeof entry.text === 'string' ? entry.text.trim() : ''
      const name = typeof entry.category === 'string' ? entry.category.trim() : ''
      if (!text || !name) {
        result.problems.push({ rule: index + 1, problem: text ? 'missing-category' : 'missing-text' })
        continue
      }
      let categoryId = byName.get(normalize(name))
      if (!categoryId) {
        categoryId = `c:${crypto.randomUUID()}`
        await db.categories.add({ id: categoryId, name })
        byName.set(normalize(name), categoryId)
        result.categoriesCreated++
      }
      // O id segue a posição no arquivo: entre regras importadas, a ordem do arquivo decide qual vale.
      const position = String(rules.length).padStart(6, '0')
      rules.push({ id: `import:${position}`, source: 'import', text, categoryId })
    }
    // O arquivo novo substitui as regras importadas antes; as suas regras e as automáticas ficam.
    await db.rules.where('source').equals('import').delete()
    await db.rules.bulkAdd(rules)
    result.imported = rules.length
  })
  return result
}

/** Nome (sem acento, maiúsculas e espaços) → id, incluindo os nomes padrão nos dois idiomas. */
export function categoriesByName(categories: Category[]): Map<string, string> {
  const byName = new Map<string, string>()
  for (const category of categories) {
    const defaults = DEFAULT_CATEGORIES.find((c) => c.id === category.id)?.names
    for (const name of [category.name, defaults?.['pt-BR'], defaults?.en]) {
      if (name) byName.set(normalize(name), category.id)
    }
  }
  return byName
}
