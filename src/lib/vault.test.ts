import { describe, expect, it } from 'vitest'
import { lockVault, unlockVault } from './vault'

// Nos testes, a derivação da chave é encurtada para rodar rápido; no app ela é lenta de propósito.
const FAST = 1_000
const PASSWORD = 'cavalo bateria grampo correto'

describe('cofre: arquivo trancado com senha', () => {
  it('trancar e destrancar devolve exatamente o que entrou', async () => {
    const payload = { pluggy: { clientId: 'id', clientSecret: 'segredo', itemIds: ['item1'] }, rules: [{ text: 'LOJA', category: 'Lazer' }] }

    const file = await lockVault(payload, PASSWORD, FAST)

    expect(await unlockVault(file, PASSWORD)).toEqual(payload)
  })

  it('senha errada é recusada', async () => {
    const file = await lockVault({ segredo: 1 }, PASSWORD, FAST)

    const error = await unlockVault(file, 'cavalo bateria grampo errado').catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'VaultError', reason: 'wrong-password' })
  })

  it('arquivo alterado é recusado (mesmo com a senha certa)', async () => {
    const file = JSON.parse(await lockVault({ valor: 100 }, PASSWORD, FAST)) as { data: string }
    const bytes = atob(file.data)
    file.data = btoa(bytes.slice(0, 5) + String.fromCharCode(bytes.charCodeAt(5) ^ 1) + bytes.slice(6))

    const error = await unlockVault(JSON.stringify(file), PASSWORD).catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'VaultError', reason: 'wrong-password' })
  })

  it('senha com menos de 16 caracteres não tranca', async () => {
    const error = await lockVault({}, 'curta demais 15', FAST).catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'VaultError', reason: 'weak-password' })
  })

  it('arquivo que não é cofre do box-flow é recusado', async () => {
    const reasons = await Promise.all(
      ['isto não é JSON', JSON.stringify({ format: 'box-flow-rules', version: 1, rules: [] })].map((text) =>
        unlockVault(text, PASSWORD).catch((e: { reason?: string }) => e.reason),
      ),
    )

    expect(reasons).toEqual(['not-a-vault', 'not-a-vault'])
  })
})
