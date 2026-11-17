import type { CardBill } from './card'

/** Fatura guardada, ligada à conta do cartão. */
export interface StoredBillLike extends CardBill {
  accountId: string
}
