import { BoxFlowDb, type PluggySettings } from './db'

/** O banco de dados do app, no IndexedDB do aparelho. */
export const db = new BoxFlowDb()

const PLUGGY_KEY = 'pluggy'

export async function loadPluggySettings(): Promise<PluggySettings | undefined> {
  const row = await db.settings.get(PLUGGY_KEY)
  return row?.value as PluggySettings | undefined
}

export async function savePluggySettings(settings: PluggySettings): Promise<void> {
  await db.transaction('rw', [db.settings, db.connections], async () => {
    await db.settings.put({ key: PLUGGY_KEY, value: settings })
    // Conexão tirada da lista sai da tela de Ajustes; os lançamentos dela continuam guardados.
    const removed = (await db.connections.toArray()).filter((c) => !settings.itemIds.includes(c.itemId))
    await db.connections.bulkDelete(removed.map((c) => c.itemId))
  })
}
