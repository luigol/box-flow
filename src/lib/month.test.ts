import { describe, expect, it } from 'vitest'
import { addMonths, formatMonth } from './month'

describe('addMonths', () => {
  it('avança dentro do ano', () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2026, month: 12 })
  })

  it('vira o ano para frente e para trás', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(addMonths({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 })
  })

  it('anda vários meses', () => {
    expect(addMonths({ year: 2026, month: 11 }, 17)).toEqual({ year: 2028, month: 4 })
  })
})

describe('formatMonth', () => {
  const today = new Date(2026, 10, 17)

  it('mostra só o mês no ano corrente', () => {
    expect(formatMonth({ year: 2026, month: 11 }, 'pt-BR', today)).toBe('Novembro')
    expect(formatMonth({ year: 2026, month: 11 }, 'en', today)).toBe('November')
  })

  it('mostra o ano quando é outro ano', () => {
    expect(formatMonth({ year: 2027, month: 1 }, 'pt-BR', today)).toBe('Janeiro de 2027')
    expect(formatMonth({ year: 2027, month: 1 }, 'en', today)).toBe('January 2027')
  })
})
