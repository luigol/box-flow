/**
 * Formato bruto da API da Pluggy, só com os campos que o app lê.
 * Referência: docs/design.md, "API da Pluggy".
 */

export interface PluggyTransaction {
  id: string
  accountId: string
  description: string
  descriptionRaw?: string | null
  /** Moeda de `amount`. Em compra no exterior é a moeda estrangeira (ex.: USD). */
  currencyCode: string
  /** Valor na moeda `currencyCode`. O sinal varia conforme a conta: use `type`. */
  amount: number
  /** Valor em reais quando `currencyCode` não é a moeda da conta. */
  amountInAccountCurrency?: number | null
  /** Momento em UTC (ex.: 2026-11-04T02:59:59.999Z). */
  date: string
  category?: string | null
  type: 'DEBIT' | 'CREDIT'
  status?: 'PENDING' | 'POSTED' | null
  creditCardMetadata?: PluggyCreditCardMetadata | null
  merchant?: { name?: string | null; businessName?: string | null } | null
  // A Pluggy manda também paymentData (com CPF), balance, etc.: o app ignora.
  [ignored: string]: unknown
}

export interface PluggyCreditCardMetadata {
  installmentNumber?: number | null
  totalInstallments?: number | null
  /** Momento em UTC. */
  purchaseDate?: string | null
  billId?: string | null
  /** Mês da fatura prevista, AAAA-MM. */
  billForecastDate?: string | null
  [ignored: string]: unknown
}

export interface PluggyBill {
  id: string
  /** Só o dia, gravado como meia-noite UTC (ex.: 2026-11-10T00:00:00.000Z). */
  dueDate: string
  /** Só o dia, como `dueDate`. */
  billClosingDate?: string | null
  totalAmount: number
  payments?: { paymentDate: string; amount: number }[] | null
  [ignored: string]: unknown
}

/** Conexão com um banco (item). Cada banco autorizado no Meu Pluggy é um item. */
export interface PluggyItem {
  id: string
  /** UPDATED, UPDATING, LOGIN_ERROR, OUTDATED… */
  status: string
  /** Momento em UTC em que o consentimento vence (1 ano por banco). */
  consentExpiresAt?: string | null
  /** Última sincronização com o banco (o Meu Pluggy sincroniza a cada 24 h). */
  lastUpdatedAt?: string | null
  nextAutoSyncAt?: string | null
  [ignored: string]: unknown
}

export interface PluggyAccount {
  id: string
  itemId: string
  type: 'BANK' | 'CREDIT'
  name: string
  number?: string | null
  balance: number
  currencyCode: string
  [ignored: string]: unknown
}
