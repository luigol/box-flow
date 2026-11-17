import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { categoryName } from '../domain/category'
import { BoxFlowDb } from './db'
import { importRuleEntries } from './rulesImport'

// Dados inventados: o repositório é público.
let dbCount = 0
function freshDb() {
  return new BoxFlowDb(`import-test-${++dbCount}`, { indexedDB, IDBKeyRange })
}

/** Regras guardadas como "texto → nome da categoria", para conferir sem depender de ids. */
async function storedRules(db: BoxFlowDb): Promise<string[]> {
  const categories = new Map((await db.categories.toArray()).map((c) => [c.id, categoryName(c, 'pt-BR')]))
  return (await db.rules.where('source').equals('import').toArray()).map((r) => `${r.text} → ${categories.get(r.categoryId)}`)
}

describe('importRuleEntries: regras que vêm no box-flow.json', () => {
  it('grava as regras, reaproveita categorias existentes e cria as que faltam', async () => {
    const db = freshDb()

    const result = await importRuleEntries(db, [
      { text: 'PADARIA EXEMPLO', category: 'alimentacao' },
      { text: 'PETSHOP EXEMPLO', category: 'Pet' },
    ])

    expect({ result, rules: await storedRules(db) }).toEqual({
      result: { imported: 2, categoriesCreated: 1, problems: [] },
      rules: ['PADARIA EXEMPLO → Alimentação', 'PETSHOP EXEMPLO → Pet'],
    })
  })

  it('abrir de novo substitui as regras importadas, sem duplicar categorias', async () => {
    const db = freshDb()
    await importRuleEntries(db, [{ text: 'PETSHOP EXEMPLO', category: 'Pet' }, { text: 'X', category: 'Lazer' }])

    const second = await importRuleEntries(db, [{ text: 'PETSHOP NOVO', category: 'Pet' }])

    expect({
      categoriesCreated: second.categoriesCreated,
      rules: await storedRules(db),
      pets: (await db.categories.toArray()).filter((c) => c.name === 'Pet').length,
    }).toEqual({ categoriesCreated: 0, rules: ['PETSHOP NOVO → Pet'], pets: 1 })
  })

  it('linhas com problema são avisadas pelo número e ignoradas; o resto entra', async () => {
    const db = freshDb()

    const result = await importRuleEntries(db, [
      { text: 'LOJA EXEMPLO', category: 'Lazer' },
      { category: 'Lazer' },
      { text: 'SEM CATEGORIA' },
      { text: '   ', category: 'Lazer' },
    ])

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
})
