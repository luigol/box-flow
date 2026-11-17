import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { categoryName } from '../domain/category'
import { BoxFlowDb } from './db'
import { importRules, type RulesFileError } from './rulesImport'

// Dados inventados: o repositório é público.
let dbCount = 0
function freshDb() {
  return new BoxFlowDb(`import-test-${++dbCount}`, { indexedDB, IDBKeyRange })
}

function rulesFile(rules: unknown[]): string {
  return JSON.stringify({ format: 'box-flow-rules', version: 1, rules })
}

/** Regras guardadas como "texto → nome da categoria", para conferir sem depender de ids. */
async function storedRules(db: BoxFlowDb): Promise<string[]> {
  const categories = new Map((await db.categories.toArray()).map((c) => [c.id, categoryName(c, 'pt-BR')]))
  return (await db.rules.where('source').equals('import').toArray()).map((r) => `${r.text} → ${categories.get(r.categoryId)}`)
}

describe('importRules: arquivo de regras', () => {
  it('importa as regras, reaproveita categorias existentes e cria as que faltam', async () => {
    const db = freshDb()
    const file = rulesFile([
      { text: 'PADARIA EXEMPLO', category: 'alimentacao' },
      { text: 'CLINICA EXEMPLO', category: 'Fisioterapia' },
    ])

    const result = await importRules(db, file)

    expect({ result, rules: await storedRules(db) }).toEqual({
      result: { imported: 2, categoriesCreated: 1, problems: [] },
      rules: ['PADARIA EXEMPLO → Alimentação', 'CLINICA EXEMPLO → Fisioterapia'],
    })
  })

  it('importar de novo substitui as regras importadas, sem duplicar categorias', async () => {
    const db = freshDb()
    await importRules(db, rulesFile([{ text: 'CLINICA EXEMPLO', category: 'Fisioterapia' }, { text: 'X', category: 'Lazer' }]))

    const second = await importRules(db, rulesFile([{ text: 'CLINICA NOVA', category: 'Fisioterapia' }]))

    expect({
      categoriesCreated: second.categoriesCreated,
      rules: await storedRules(db),
      fisioterapias: (await db.categories.toArray()).filter((c) => c.name === 'Fisioterapia').length,
    }).toEqual({ categoriesCreated: 0, rules: ['CLINICA NOVA → Fisioterapia'], fisioterapias: 1 })
  })

  it('linhas com problema são avisadas pelo número e ignoradas; o resto entra', async () => {
    const db = freshDb()
    const file = rulesFile([
      { text: 'LOJA EXEMPLO', category: 'Lazer' },
      { category: 'Lazer' },
      { text: 'SEM CATEGORIA' },
      { text: '   ', category: 'Lazer' },
    ])

    const result = await importRules(db, file)

    expect({ result, rules: await storedRules(db) }).toEqual({
      result: {
        imported: 1,
        categoriesCreated: 0,
        problems: [
          { rule: 2, problem: 'missing-text' },
          { rule: 3, problem: 'missing-category' },
          { rule: 4, problem: 'missing-text' },
        ],
      },
      rules: ['LOJA EXEMPLO → Lazer'],
    })
  })

  it('arquivo que não é de regras do box-flow: avisa e não mexe no que já estava', async () => {
    const db = freshDb()
    await importRules(db, rulesFile([{ text: 'LOJA EXEMPLO', category: 'Lazer' }]))

    const notJson = await importRules(db, 'isto não é JSON').catch((e: unknown) => e)
    const otherFormat = await importRules(db, JSON.stringify({ format: 'outra-coisa', rules: [] })).catch((e: unknown) => e)

    expect({
      notJson: (notJson as RulesFileError).reason,
      otherFormat: (otherFormat as RulesFileError).reason,
      rules: await storedRules(db),
    }).toEqual({ notJson: 'invalid-json', otherFormat: 'wrong-format', rules: ['LOJA EXEMPLO → Lazer'] })
  })
})
