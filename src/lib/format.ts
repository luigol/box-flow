import type { Cents, IsoDate } from '../domain/card'

/** R$ 1.234,56 (ou o formato do idioma). Positivos com "+" quando `signed`. */
export function formatMoney(cents: Cents, locale: string, options: { signed?: boolean; currency?: string } = {}): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: options.currency ?? 'BRL',
    signDisplay: options.signed ? 'exceptZero' : 'auto',
  }).format(cents / 100)
}

/**
 * Texto digitado → centavos: aceita "487", "487,00", "1.234,56", "23.45".
 * O último separador seguido de 1 ou 2 dígitos é o decimal; os outros são de milhar.
 */
export function parseMoney(text: string): Cents | null {
  const clean = text.replace(/[^\d.,]/g, '')
  if (!clean) return null
  const decimal = clean.match(/[.,](\d{1,2})$/)
  const whole = (decimal ? clean.slice(0, -decimal[0].length) : clean).replace(/[.,]/g, '')
  const cents = Number(whole || '0') * 100 + (decimal ? Number(decimal[1]!.padEnd(2, '0')) : 0)
  return Number.isFinite(cents) && cents > 0 ? cents : null
}

/** Centavos → texto para editar ("487,00"). */
export function moneyInput(cents: Cents, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
}

/** "Sexta-feira, 20 de novembro" a partir de AAAA-MM-DD. */
export function formatDay(date: IsoDate, locale: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const label = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(year ?? 0, (month ?? 1) - 1, day ?? 1),
  )
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)
}

/** "17/11/2026 12:01" a partir de um momento em UTC, no fuso do aparelho. */
export function formatDateTime(instant: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(instant))
}

/** "16/11/2027" a partir de um momento em UTC. */
export function formatDate(instant: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(instant))
}
