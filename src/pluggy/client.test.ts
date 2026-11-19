import { describe, expect, it } from 'vitest'
import { createPluggyClient, PluggyError } from './client'

const CREDENTIALS = { clientId: 'client-id', clientSecret: 'client-secret' }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Pluggy de mentira: responde como a API real (login em /auth, chave no cabeçalho X-API-KEY,
 * 401 para chave inválida). Cada teste registra as rotas de que precisa.
 */
function fakePluggy() {
  let issued = 0
  const validKeys = new Set<string>()
  const routes = new Map<string, (url: URL) => unknown>()

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    if (method === 'POST' && url.pathname === '/auth') {
      const body = JSON.parse(String(init?.body)) as { clientId?: string; clientSecret?: string }
      if (body.clientId !== CREDENTIALS.clientId || body.clientSecret !== CREDENTIALS.clientSecret) {
        return json(401, { message: 'Invalid credentials' })
      }
      const apiKey = `key-${++issued}`
      validKeys.add(apiKey)
      return json(200, { apiKey })
    }
    const key = new Headers(init?.headers).get('X-API-KEY')
    if (!key || !validKeys.has(key)) return json(401, { message: 'Unauthorized' })
    const handler = routes.get(`${method} ${url.pathname}`)
    return handler ? json(200, handler(url)) : json(404, { message: 'Not found' })
  }

  return {
    fetch,
    on(route: string, handler: (url: URL) => unknown) {
      routes.set(route, handler)
    },
    /** Simula a chave vencendo (ela dura 2 h na Pluggy real). */
    expireKeys() {
      validKeys.clear()
    },
    /** Quantos logins foram feitos: cada um é uma ida à Pluggy. */
    get logins() {
      return issued
    },
  }
}

describe('createPluggyClient: conversa com a API da Pluggy', () => {
  it('faz login e lista as contas de uma conexão', async () => {
    const pluggy = fakePluggy()
    pluggy.on('GET /accounts', (url) => ({
      results: url.searchParams.get('itemId') === 'item1' ? [{ id: 'acc1' }, { id: 'acc2' }] : [],
    }))
    const client = createPluggyClient(CREDENTIALS, pluggy.fetch)

    const accounts = await client.listAccounts('item1')

    expect(accounts.map((a) => a.id)).toEqual(['acc1', 'acc2'])
  })

  it('busca todas as páginas de transações seguindo o campo next', async () => {
    const pluggy = fakePluggy()
    pluggy.on('GET /v2/transactions', (url) =>
      url.searchParams.get('after') === 'cursor1'
        ? { results: [{ id: 't3' }], next: null }
        : { results: [{ id: 't1' }, { id: 't2' }], next: '?accountId=acc1&after=cursor1' },
    )
    const client = createPluggyClient(CREDENTIALS, pluggy.fetch)

    const transactions = await client.listTransactions('acc1')

    expect(transactions.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('reaproveita o login enquanto a chave vale', async () => {
    const pluggy = fakePluggy()
    pluggy.on('GET /accounts', () => ({ results: [] }))
    const client = createPluggyClient(CREDENTIALS, pluggy.fetch)

    await client.listAccounts('item1')
    await client.listAccounts('item2')

    expect(pluggy.logins).toBe(1)
  })

  it('chave vencida: faz login de novo e repete o pedido', async () => {
    const pluggy = fakePluggy()
    pluggy.on('GET /accounts', () => ({ results: [{ id: 'acc1' }] }))
    const client = createPluggyClient(CREDENTIALS, pluggy.fetch)
    await client.listAccounts('item1')

    pluggy.expireKeys()
    const accounts = await client.listAccounts('item1')

    expect(accounts.map((a) => a.id)).toEqual(['acc1'])
  })

  it('credenciais erradas viram um erro claro, com o código da Pluggy', async () => {
    const pluggy = fakePluggy()
    const client = createPluggyClient({ clientId: 'client-id', clientSecret: 'errado' }, pluggy.fetch)

    const error = await client.listAccounts('item1').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(PluggyError)
    expect(error).toMatchObject({ status: 401, message: 'Invalid credentials' })
  })

  it('outra recusa da Pluggy também vira erro, com o código', async () => {
    const pluggy = fakePluggy() // sem rota de contas: a Pluggy responde 404
    const client = createPluggyClient(CREDENTIALS, pluggy.fetch)

    const error = await client.listAccounts('item1').catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'PluggyError', status: 404, message: 'Not found' })
  })

  it('lê a conexão: status, vencimento do consentimento e sincronizações', async () => {
    const pluggy = fakePluggy()
    pluggy.on('GET /items/item1', () => ({
      id: 'item1',
      status: 'UPDATED',
      consentExpiresAt: '2027-06-01T12:00:00.000Z',
      lastUpdatedAt: '2026-11-20T15:00:00.000Z',
      nextAutoSyncAt: '2026-11-21T15:00:00.000Z',
      clientUserId: 'ignorado',
    }))
    const client = createPluggyClient(CREDENTIALS, pluggy.fetch)

    const item = await client.getItem('item1')

    expect(item).toMatchObject({
      status: 'UPDATED',
      consentExpiresAt: '2027-06-01T12:00:00.000Z',
      lastUpdatedAt: '2026-11-20T15:00:00.000Z',
      nextAutoSyncAt: '2026-11-21T15:00:00.000Z',
    })
  })

  it('busca todas as páginas de faturas (paginação por número de página)', async () => {
    const pluggy = fakePluggy()
    pluggy.on('GET /bills', (url) => {
      if (url.searchParams.get('accountId') !== 'card1') return { page: 1, totalPages: 1, results: [] }
      const page = Number(url.searchParams.get('page') ?? '1')
      return { page, totalPages: 2, results: page === 1 ? [{ id: 'b1' }, { id: 'b2' }] : [{ id: 'b3' }] }
    })
    const client = createPluggyClient(CREDENTIALS, pluggy.fetch)

    const bills = await client.listBills('card1')

    expect(bills.map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
  })

  it('busca todas as páginas de investimentos da conexão', async () => {
    const pluggy = fakePluggy()
    pluggy.on('GET /investments', (url) => {
      if (url.searchParams.get('itemId') !== 'item1') return { page: 1, totalPages: 1, results: [] }
      const page = Number(url.searchParams.get('page') ?? '1')
      return { page, totalPages: 2, results: page === 1 ? [{ id: 'i1' }, { id: 'i2' }] : [{ id: 'i3' }] }
    })
    const client = createPluggyClient(CREDENTIALS, pluggy.fetch)

    const investments = await client.listInvestments('item1')

    expect(investments.map((i) => i.id)).toEqual(['i1', 'i2', 'i3'])
  })
})
