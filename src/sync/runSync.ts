import { useSyncExternalStore } from 'react'
import { db, loadPluggySettings } from '../db/instance'
import { createPluggyClient } from '../pluggy/client'
import { syncConnection } from './sync'

/** Atualização de todas as conexões, disparada ao abrir o app e pelo botão "Atualizar". */

let running = false
const listeners = new Set<() => void>()

function setRunning(value: boolean) {
  running = value
  for (const listener of listeners) listener()
}

/** `true` enquanto uma atualização está em andamento. */
export function useSyncRunning(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => running,
  )
}

let current: Promise<void> | null = null

/** Atualiza todas as conexões. Se já houver uma atualização em andamento, espera por ela. */
export function syncNow(): Promise<void> {
  current ??= run().finally(() => {
    current = null
  })
  return current
}

async function run(): Promise<void> {
  const settings = await loadPluggySettings()
  if (!settings || settings.itemIds.length === 0) return
  setRunning(true)
  try {
    const client = createPluggyClient(settings)
    for (const itemId of settings.itemIds) {
      try {
        await syncConnection(db, client, itemId)
      } catch (error) {
        // Uma conexão com problema não impede as outras; o erro aparece em Ajustes → Bancos.
        const existing = await db.connections.get(itemId)
        await db.connections.put({ ...existing, itemId, error: error instanceof Error ? error.message : String(error) })
      }
    }
  } finally {
    setRunning(false)
  }
}
