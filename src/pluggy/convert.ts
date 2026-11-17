import type { BankAccount, BankTransaction, CardDetails } from '../domain/bank'
import type { CardBill, IsoDate } from '../domain/card'
import type { PluggyAccount, PluggyBill, PluggyCreditCardMetadata, PluggyTransaction } from './types'

/** Fuso fixo: uma compra é do dia em que foi feita no Brasil, mesmo com o celular em outro fuso. */
const TIME_ZONE = 'America/Sao_Paulo'

const dayInTimeZone = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Converte uma transação da Pluggy para o formato do app, guardando só o necessário. */
export function fromPluggyTransaction(raw: PluggyTransaction): BankTransaction {
  const tx: BankTransaction = {
    id: raw.id,
    accountId: raw.accountId,
    date: localDay(raw.date),
    status: raw.status === 'PENDING' ? 'pending' : 'posted',
    description: raw.description,
    amount: signedCents(raw.type, raw.amountInAccountCurrency ?? raw.amount),
  }
  if (raw.descriptionRaw && raw.descriptionRaw !== raw.description) tx.rawDescription = raw.descriptionRaw
  if (raw.category) tx.bankCategory = raw.category
  const merchant = raw.merchant?.businessName || raw.merchant?.name
  if (merchant) tx.merchant = merchant
  const counterparty = counterpartyType(raw)
  if (counterparty) tx.counterparty = counterparty
  // Compra no exterior: `amount` vem na moeda estrangeira e o valor em reais vem à parte.
  if (raw.amountInAccountCurrency != null) {
    tx.foreign = { currency: raw.currencyCode, amount: signedCents(raw.type, raw.amount) }
  }
  if (raw.creditCardMetadata) tx.card = cardDetails(raw.creditCardMetadata)
  return tx
}

/**
 * Só o TIPO do documento do outro lado (quem recebeu, se saiu; quem pagou, se entrou).
 * Serve para decidir se um compromisso é "Pix para pessoa" (sugerido) ou de empresa (automático).
 */
function counterpartyType(raw: PluggyTransaction): 'person' | 'company' | undefined {
  const data = raw.paymentData as { payer?: Party; receiver?: Party } | null | undefined
  const other = raw.type === 'DEBIT' ? data?.receiver : data?.payer
  const type = other?.documentNumber?.type
  if (type === 'CPF') return 'person'
  if (type === 'CNPJ') return 'company'
  return undefined
}

type Party = { documentNumber?: { type?: string } | null } | null

function cardDetails(cc: PluggyCreditCardMetadata): CardDetails {
  const card: CardDetails = {}
  if (cc.billId) card.billId = cc.billId
  if (cc.billForecastDate) card.billForecastMonth = cc.billForecastDate.slice(0, 7)
  if (cc.installmentNumber && cc.totalInstallments) {
    card.installment = { number: cc.installmentNumber, total: cc.totalInstallments }
  }
  if (cc.purchaseDate) card.purchaseDate = localDay(cc.purchaseDate)
  return card
}

export function fromPluggyAccount(raw: PluggyAccount): BankAccount {
  const isCard = raw.type === 'CREDIT'
  const account: BankAccount = {
    id: raw.id,
    itemId: raw.itemId,
    kind: isCard ? 'credit_card' : 'checking',
    name: raw.name,
    // No cartão, `balance` é o limite usado: o que eu devo.
    balance: isCard ? -Math.abs(toCents(raw.balance)) : toCents(raw.balance),
  }
  const digits = raw.number?.replace(/\D/g, '')
  if (digits) account.last4 = digits.slice(-4)
  return account
}

/** Fatura: vencimento e pagamentos são "só o dia", gravados como meia-noite UTC; não passam por fuso. */
export function fromPluggyBill(raw: PluggyBill): CardBill {
  const bill: CardBill = {
    id: raw.id,
    dueDate: raw.dueDate.slice(0, 10),
    total: toCents(raw.totalAmount),
    payments: (raw.payments ?? []).map((p) => ({ date: p.paymentDate.slice(0, 10), amount: toCents(p.amount) })),
  }
  if (raw.billClosingDate) bill.closingDate = raw.billClosingDate.slice(0, 10)
  return bill
}

/** Reais → centavos inteiros, arredondando frações (fatura em dólar pode vir com 4 casas). */
function toCents(value: number): number {
  return Math.round(value * 100) || 0
}

/** Momento em UTC → dia em Brasília (AAAA-MM-DD). */
function localDay(instant: string): IsoDate {
  const parts = Object.fromEntries(dayInTimeZone.formatToParts(new Date(instant)).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/**
 * O sinal de `amount` muda conforme a conta (no cartão a compra vem positiva).
 * `type` é estável: DEBIT = saiu, CREDIT = entrou.
 */
function signedCents(type: PluggyTransaction['type'], value: number): number {
  const cents = Math.abs(toCents(value))
  return type === 'DEBIT' ? -cents : cents
}
