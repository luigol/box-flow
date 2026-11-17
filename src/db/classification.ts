import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { DEFAULT_RULES, normalize, searchText, type Category, type ClassifyContext } from '../domain/category'
import { withoutInstallment, type BankTransaction } from '../domain/bank'
import { db } from './instance'

/** Categorias e contexto de classificação (suas regras, importadas, automáticas e marcações à mão). */
export function useClassification(): { categories: Category[]; ctx: ClassifyContext } | undefined {
  const data = useLiveQuery(
    async () => ({
      categories: await db.categories.toArray(),
      rules: await db.rules.toArray(),
      manual: await db.classifications.toArray(),
    }),
    [],
  )
  return useMemo(
    () =>
      data && {
        categories: data.categories,
        ctx: { rules: [...data.rules, ...DEFAULT_RULES], manual: new Map(data.manual.map((m) => [m.txId, m.categoryId])) },
      },
    [data],
  )
}

export async function setManualCategory(txId: string, categoryId: string): Promise<void> {
  await db.classifications.put({ txId, categoryId })
}

export async function clearManualCategory(txId: string): Promise<void> {
  await db.classifications.delete(txId)
}

/**
 * Cria uma regra sua. Se ela cobre o lançamento que originou a regra, a marcação à mão dele sai:
 * assim, mudar a regra depois muda também esse lançamento.
 */
export async function createUserRule(text: string, categoryId: string, origin?: BankTransaction): Promise<void> {
  await db.transaction('rw', [db.rules, db.classifications], async () => {
    await db.rules.add({ id: `user:${crypto.randomUUID()}`, source: 'user', text: text.trim(), categoryId, createdAt: new Date().toISOString() })
    if (origin && searchText(origin).includes(normalize(text))) await db.classifications.delete(origin.id)
  })
}

export async function deleteRule(id: string): Promise<void> {
  await db.rules.delete(id)
}

export async function addCategory(name: string): Promise<string> {
  const id = `c:${crypto.randomUUID()}`
  await db.categories.add({ id, name: name.trim() })
  return id
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await db.categories.update(id, { name: name.trim() || undefined })
}

/** Sugestão de texto para "aplicar a todos": a descrição sem o "NN/NN" da parcela. */
export function suggestRuleText(tx: BankTransaction): string {
  return withoutInstallment(tx.description)
}
