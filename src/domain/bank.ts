import type { CardCharge, Cents, IsoDate } from './card'

/** Dados de cartão de uma transação. `billId` e `billForecastMonth` alimentam `cashOutDate`. */
export interface CardDetails extends CardCharge {
  installment?: { number: number; total: number }
  /** Dia da compra em Brasília. Igual em todas as parcelas de uma compra. */
  purchaseDate?: IsoDate
}

/** Descrição sem o "NN/NN" da parcela no fim: igual em todas as parcelas de uma compra. */
export function withoutInstallment(description: string): string {
  return description.replace(/\s*\d{1,2}\/\d{1,2}\s*$/, '').replace(/\s+/g, ' ').trim()
}

/** Conta vinda do banco: conta corrente ou cartão. */
export interface BankAccount {
  id: string
  /** Conexão (item) da Pluggy. Muda quando o consentimento é renovado. */
  itemId: string
  kind: 'checking' | 'credit_card'
  name: string
  last4?: string
  /** Positivo = dinheiro que tenho; negativo = o que devo (no cartão, o limite usado). */
  balance: Cents
}

/** Transação vinda do banco, já no formato do app. */
export interface BankTransaction {
  id: string
  accountId: string
  /** Dia em Brasília. */
  date: IsoDate
  /** `pending`: fatura aberta, parcela futura ou ainda não liquidada. */
  status: 'pending' | 'posted'
  description: string
  /** Texto original do banco, quando difere de `description` (ex.: nome de quem recebeu o Pix). */
  rawDescription?: string
  /** Categoria sugerida pelo banco, em inglês. Só sugestão: a regra do usuário manda. */
  bankCategory?: string
  /** Nome do estabelecimento, quando o banco informa. */
  merchant?: string
  /** Em Pix e transferências: o outro lado é pessoa (CPF) ou empresa (CNPJ). O documento não é guardado. */
  counterparty?: 'person' | 'company'
  /** Em reais. Negativo = dinheiro saiu; positivo = entrou. Em qualquer tipo de conta. */
  amount: Cents
  /** Valor original de compra em outra moeda (ex.: US$ 12,00), com o mesmo sinal de `amount`. */
  foreign?: { currency: string; amount: Cents }
  /** Só em transações de cartão. */
  card?: CardDetails
}
