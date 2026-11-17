import { describe, expect, it } from 'vitest'
import type { BankTransaction } from './bank'
import { recurringSuggestions, type SuggestionsInput } from './suggestions'

// Dados inventados: o repositório é público.
const TODAY = new Date(2026, 10, 17) // 17/11/2026: os últimos 6 meses vão de junho a novembro

function tx(id: string, date: string, fields: Partial<BankTransaction> = {}): BankTransaction {
  return { id, accountId: 'acc1', date, status: 'posted', description: 'STREAMING EXEMPLO', amount: -5_000, ...fields }
}

function input(fields: Partial<SuggestionsInput>): SuggestionsInput {
  return { transactions: [], commitments: [], linkedTxIds: new Set(), categoryOf: () => undefined, ignored: new Set(), today: TODAY, ...fields }
}

const view = (list: ReturnType<typeof recurringSuggestions>) => list.map((s) => [s.text, s.direction, s.amount, s.months, s.latest.id])

describe('recurringSuggestions: sugestões de recorrentes a partir do extrato', () => {
  it('o mesmo texto em 3 dos últimos 6 meses, com valores parecidos, vira sugestão com o valor típico do mês', () => {
    const transactions = [tx('ago', '2026-08-15', { amount: -4_800 }), tx('set', '2026-09-15'), tx('out', '2026-10-16', { amount: -5_200 })]

    expect(view(recurringSuggestions(input({ transactions })))).toEqual([['STREAMING EXEMPLO', 'out', 5_000, 3, 'out']])
  })

  it('basta 3 meses perto do valor típico (até 25%); muitos lançamentos por mês ou valores espalhados não viram sugestão', () => {
    const plan = (id: string, date: string, amount: number) => tx(id, date, { description: 'PLANO EXEMPLO', amount })
    const ride = (id: string, date: string) => tx(id, date, { description: 'CORRIDA EXEMPLO', amount: -1_000 })
    const shop = (id: string, date: string, amount: number) => tx(id, date, { description: 'LOJA EXEMPLO', amount })
    const transactions = [
      // Mês com desconto não atrapalha: 3 meses no valor cheio.
      plan('p8', '2026-08-05', -990), plan('p9', '2026-09-05', -2_490), plan('p10', '2026-10-05', -2_490), plan('p11', '2026-11-05', -2_490),
      // Três corridas por mês, todo mês o mesmo total: é gasto do dia a dia, não assinatura.
      ...['09', '10', '11'].flatMap((m) => [ride(`r${m}a`, `2026-${m}-02`), ride(`r${m}b`, `2026-${m}-12`), ride(`r${m}c`, `2026-${m}-22`)]),
      // Um por mês, mas cada mês num valor bem diferente.
      shop('s9', '2026-09-10', -2_000), shop('s10', '2026-10-10', -9_000), shop('s11', '2026-11-10', -4_500),
    ]

    expect(view(recurringSuggestions(input({ transactions })))).toEqual([['PLANO EXEMPLO', 'out', 2_490, 4, 'p11']])
  })

  it('assinatura cancelada (não apareceu neste mês nem no anterior) não vira sugestão', () => {
    const old = (id: string, date: string) => tx(id, date, { description: 'SERVICO CANCELADO' })
    const transactions = [
      old('c6', '2026-06-03'), old('c7', '2026-07-03'), old('c8', '2026-08-03'), old('c9', '2026-09-03'),
      // Ainda ativo: apareceu no mês passado, e o deste mês ainda não chegou.
      tx('a8', '2026-08-25'), tx('a9', '2026-09-25'), tx('a10', '2026-10-25'),
    ]

    expect(view(recurringSuggestions(input({ transactions })))).toEqual([['STREAMING EXEMPLO', 'out', 5_000, 3, 'a10']])
  })

  it('fica de fora: transferência, parcela do cartão, o que já é compromisso (pelo texto ou ligado) e o que foi ignorado', () => {
    const monthly = (prefix: string, fields: Partial<BankTransaction>) =>
      ['09', '10', '11'].map((m, i) => tx(`${prefix}${m}`, `2026-${m}-08`, { ...fields, description: fields.description?.replace('#', `${i + 1}/3`) }))
    const transactions = [
      ...monthly('t', { description: 'TRANSFERENCIA PROPRIA' }),
      ...monthly('p', { description: 'LOJA PARCELADA #', card: { installment: { number: 1, total: 3 } } }),
      ...monthly('k', { description: 'ACADEMIA EXEMPLO CENTRO' }),
      ...monthly('l', { description: 'CURSO EXEMPLO' }),
      ...monthly('s', { description: 'STREAMING EXEMPLO' }),
      ...monthly('j', { description: 'JORNAL EXEMPLO' }),
    ]
    const base = input({
      transactions,
      categoryOf: (t) => (t.description === 'TRANSFERENCIA PROPRIA' ? 'transfer' : undefined),
      commitments: [
        { id: 'gym', kind: 'recurring', name: 'Academia', direction: 'out', amount: 5_000, amountMode: 'fixed', frequency: 'monthly', day: 8, start: { year: 2026, month: 9 }, bankText: 'Academia exemplo' },
      ],
      // Ligados à mão a um compromisso sem texto do banco.
      linkedTxIds: new Set(['l09', 'l10', 'l11']),
    })
    const streaming = recurringSuggestions(base).find((s) => s.text === 'STREAMING EXEMPLO')!

    expect(view(recurringSuggestions({ ...base, ignored: new Set([streaming.key]) }))).toEqual([['JORNAL EXEMPLO', 'out', 5_000, 3, 'j11']])
  })
})
