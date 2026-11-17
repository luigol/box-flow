import type { BoxFlowDb, PluggySettings } from './db'

const PLUGGY_KEY = 'pluggy'

export async function readPluggySettings(db: BoxFlowDb): Promise<PluggySettings | undefined> {
  const row = await db.settings.get(PLUGGY_KEY)
  return row?.value as PluggySettings | undefined
}

export async function writePluggySettings(db: BoxFlowDb, settings: PluggySettings): Promise<void> {
  await db.transaction('rw', [db.settings, db.connections], async () => {
    await db.settings.put({ key: PLUGGY_KEY, value: settings })
    // Conexão tirada da lista sai da tela de Ajustes; os lançamentos dela continuam guardados.
    const removed = (await db.connections.toArray()).filter((c) => !settings.itemIds.includes(c.itemId))
    await db.connections.bulkDelete(removed.map((c) => c.itemId))
  })
}
