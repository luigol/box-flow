/** Mês do calendário. `month` vai de 1 a 12. */
export interface YearMonth {
  year: number
  month: number
}

export function currentMonth(today = new Date()): YearMonth {
  return { year: today.getFullYear(), month: today.getMonth() + 1 }
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** AAAA-MM-DD no mês, com o dia informado; se o mês não tem esse dia (31/02), o último dia do mês. */
export function dateInMonth(ym: YearMonth, day: number): string {
  const lastDay = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate()
  return `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

/** "Novembro" no ano corrente; "Janeiro de 2027" em outro ano. */
export function formatMonth(ym: YearMonth, locale: string, today = new Date()): string {
  const label = monthName(ym, locale, today)
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)
}

/** Nome do mês para o meio de uma frase ("gasto em novembro"); com o ano, se não for o corrente. */
export function monthName(ym: YearMonth, locale: string, today = new Date()): string {
  const options: Intl.DateTimeFormatOptions =
    ym.year === today.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' }
  return new Intl.DateTimeFormat(locale, options).format(new Date(ym.year, ym.month - 1, 1))
}

/** AAAA-MM-DD do dia no aparelho. */
export function localIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
