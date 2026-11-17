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

/** "Novembro" no ano corrente; "Janeiro de 2027" em outro ano. */
export function formatMonth(ym: YearMonth, locale: string, today = new Date()): string {
  const options: Intl.DateTimeFormatOptions =
    ym.year === today.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' }
  const label = new Intl.DateTimeFormat(locale, options).format(new Date(ym.year, ym.month - 1, 1))
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)
}
