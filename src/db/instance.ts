import { BoxFlowDb, type PluggySettings } from './db'
import { readPluggySettings, writePluggySettings } from './settings'

/** O banco de dados do app, no IndexedDB do aparelho. */
export const db = new BoxFlowDb()

export function loadPluggySettings(): Promise<PluggySettings | undefined> {
  return readPluggySettings(db)
}

export function savePluggySettings(settings: PluggySettings): Promise<void> {
  return writePluggySettings(db, settings)
}
