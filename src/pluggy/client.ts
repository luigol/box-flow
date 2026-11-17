import type { PluggyAccount, PluggyBill, PluggyItem, PluggyTransaction } from './types'

const BASE_URL = 'https://api.pluggy.ai'

export interface PluggyCredentials {
  clientId: string
  clientSecret: string
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** Recusa da Pluggy: `status` é o código HTTP e `message` vem da própria Pluggy. */
export class PluggyError extends Error {
  override name = 'PluggyError'

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { message?: string }
  if (!response.ok) throw new PluggyError(response.status, body.message ?? response.statusText)
  return body as T
}

/**
 * Cliente da API da Pluggy, chamado direto do navegador (a API libera CORS).
 * `fetchFn` é injetável para os testes usarem uma Pluggy de mentira.
 */
export function createPluggyClient(credentials: PluggyCredentials, fetchFn: Fetch = globalThis.fetch.bind(globalThis)) {
  async function authenticate(): Promise<string> {
    const response = await fetchFn(`${BASE_URL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    const body = await readJson<{ apiKey: string }>(response)
    return body.apiKey
  }

  let apiKey: string | undefined

  async function get<T>(path: string): Promise<T> {
    apiKey ??= await authenticate()
    let response = await fetchFn(`${BASE_URL}${path}`, { headers: { 'X-API-KEY': apiKey } })
    if (response.status === 401) {
      // A chave dura 2 h: venceu, faz login de novo e repete uma vez.
      apiKey = await authenticate()
      response = await fetchFn(`${BASE_URL}${path}`, { headers: { 'X-API-KEY': apiKey } })
    }
    return readJson<T>(response)
  }

  return {
    getItem(itemId: string): Promise<PluggyItem> {
      return get<PluggyItem>(`/items/${encodeURIComponent(itemId)}`)
    },

    async listAccounts(itemId: string): Promise<PluggyAccount[]> {
      const body = await get<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`)
      return body.results
    },

    /** Todas as transações da conta. A API devolve até 500 por página e não aceita `pageSize`. */
    async listTransactions(accountId: string): Promise<PluggyTransaction[]> {
      const all: PluggyTransaction[] = []
      let query: string | null = `?accountId=${encodeURIComponent(accountId)}`
      while (query) {
        const page: TransactionPage = await get<TransactionPage>(`/v2/transactions${query}`)
        all.push(...page.results)
        query = page.next ?? null // `next` é uma query string pronta: ?accountId=…&after=…
      }
      return all
    },

    /** Faturas fechadas do cartão. Aqui a paginação é por número de página. */
    async listBills(accountId: string): Promise<PluggyBill[]> {
      const all: PluggyBill[] = []
      for (let page = 1, totalPages = 1; page <= totalPages; page++) {
        const body: NumberedPage<PluggyBill> = await get<NumberedPage<PluggyBill>>(
          `/bills?accountId=${encodeURIComponent(accountId)}&page=${page}`,
        )
        all.push(...body.results)
        totalPages = body.totalPages
      }
      return all
    },
  }
}

interface NumberedPage<T> {
  page: number
  totalPages: number
  results: T[]
}

interface TransactionPage {
  results: PluggyTransaction[]
  next?: string | null
}
