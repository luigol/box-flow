import { describe, expect, it } from 'vitest'
import type { BankAccount, BankTransaction } from './bank'
import { CATEGORY_COLORS, categoryColor, classify, DEFAULT_RULES, TRANSFER, type Rule } from './category'

// Dados inventados: o repositório é público.
const checking: BankAccount = { id: 'acc1', itemId: 'item1', kind: 'checking', name: 'CONTA', balance: 0 }

function tx(fields: Partial<BankTransaction> = {}): BankTransaction {
  return { id: 'tx1', accountId: 'acc1', date: '2026-11-10', status: 'posted', description: 'X', amount: -1000, ...fields }
}

function rule(fields: Partial<Rule> & Pick<Rule, 'categoryId'>): Rule {
  return { id: `r-${Math.random()}`, source: 'user', ...fields }
}

const noManual = new Map<string, string>()

describe('classify: categoria de um lançamento', () => {
  it('regra de texto leva o lançamento para a categoria dela', () => {
    const rules = [rule({ text: 'DL*99 RIDE', categoryId: 'ride-hailing' })]

    expect(classify(tx({ description: 'DL*99 RIDESAO PAULOBRA' }), checking, { rules, manual: noManual })).toBe('ride-hailing')
  })

  it('maiúsculas, acentos e espaços não importam', () => {
    const rules = [
      rule({ text: 'dl *uberrides', categoryId: 'ride-hailing' }),
      rule({ text: 'Farmácia', categoryId: 'health' }),
    ]
    const ctx = { rules, manual: noManual }

    expect([
      classify(tx({ description: 'DL          *UberRidesSao PauloBRA' }), checking, ctx),
      classify(tx({ description: 'FARMACIA EXEMPLOCIDADEBRA' }), checking, ctx),
    ]).toEqual(['ride-hailing', 'health'])
  })

  it('procura também na descrição original e no estabelecimento', () => {
    const rules = [
      rule({ text: 'CLINICA EXEMPLO', categoryId: 'health' }),
      rule({ text: 'LOJA EXEMPLO', categoryId: 'clothing' }),
    ]
    const ctx = { rules, manual: noManual }

    expect([
      classify(tx({ description: 'PIX TRANSF 10/11', rawDescription: 'Pix enviado CLINICA EXEMPLO' }), checking, ctx),
      classify(tx({ description: 'PAG*XYZ', merchant: 'LOJA EXEMPLO LTDA' }), checking, ctx),
    ]).toEqual(['health', 'clothing'])
  })

  it('o que foi marcado à mão vence qualquer regra', () => {
    const rules = [rule({ text: 'LOJA', categoryId: 'clothing' })]
    const manual = new Map([['tx1', 'gifts']])

    expect(classify(tx({ id: 'tx1', description: 'LOJA EXEMPLO' }), checking, { rules, manual })).toBe('gifts')
  })

  it('entre regras: as suas vencem as importadas, que vencem as automáticas', () => {
    const imported = rule({ source: 'import', text: 'LOJA', categoryId: 'from-import' })
    const automatic = rule({ source: 'default', text: 'LOJA', categoryId: 'from-default' })
    const mine = rule({ source: 'user', text: 'LOJA', categoryId: 'from-user' })
    const description = 'LOJA EXEMPLO'

    expect([
      classify(tx({ description }), checking, { rules: [automatic, imported, mine], manual: noManual }),
      classify(tx({ description }), checking, { rules: [automatic, imported], manual: noManual }),
    ]).toEqual(['from-user', 'from-import'])
  })

  it('ligado a um compromisso: pega a categoria dele (vence as regras, perde para a escolha à mão)', () => {
    const rules = [rule({ text: 'LOJA', categoryId: 'clothing' })]
    const commitmentCategory = new Map([
      ['ligado', 'subscriptions'],
      ['ligado-e-a-mao', 'subscriptions'],
    ])
    const manual = new Map([['ligado-e-a-mao', 'gifts']])
    const ctx = { rules, manual, commitmentCategory }

    expect([
      classify(tx({ id: 'ligado', description: 'LOJA EXEMPLO' }), checking, ctx),
      classify(tx({ id: 'ligado-e-a-mao', description: 'LOJA EXEMPLO' }), checking, ctx),
      classify(tx({ id: 'solto', description: 'LOJA EXEMPLO' }), checking, ctx),
    ]).toEqual(['subscriptions', 'gifts', 'clothing'])
  })

  it('entre as suas regras, vale a mais recente', () => {
    const older = rule({ text: 'LOJA', categoryId: 'clothing', createdAt: '2026-11-01T10:00:00.000Z' })
    const newer = rule({ text: 'LOJA EXEMPLO', categoryId: 'gifts', createdAt: '2026-11-15T10:00:00.000Z' })

    expect(classify(tx({ description: 'LOJA EXEMPLO' }), checking, { rules: [older, newer], manual: noManual })).toBe('gifts')
  })
})

describe('regras automáticas de transferência (já vêm com o app)', () => {
  const card: BankAccount = { id: 'card1', itemId: 'item1', kind: 'credit_card', name: 'CARTAO', balance: 0 }
  const IN = 5000
  const OUT = -5000

  it.each([
    ['pagamento de fatura saindo da conta', checking, 'Credit card payment', OUT],
    ['pagamento recebido no cartão', card, 'Credit card payment', IN],
    ['Pix entre contas da mesma pessoa (saída)', checking, 'Same person transfer', OUT],
    ['Pix entre contas da mesma pessoa (entrada)', checking, 'Same person transfer', IN],
    ['aplicação no cofrinho', checking, 'Investments', OUT],
    ['resgate de CDB', checking, 'Fixed income', IN],
    ['entrada no cartão marcada como transferência (pagamento com saldo)', card, 'Transfers', IN],
    ['entrada no cartão por Pix (pagamento da fatura)', card, 'Transfer - PIX', IN],
  ])('%s → transferência', (_, account, bankCategory, amount) => {
    const t = tx({ accountId: account.id, bankCategory, amount })
    expect(classify(t, account, { rules: DEFAULT_RULES, manual: noManual })).toBe(TRANSFER)
  })

  it('"Pagamento de fatura" saindo da conta, mesmo que a Pluggy marque só como Transfers → transferência', () => {
    const t = tx({ description: 'Pagamento de fatura', bankCategory: 'Transfers', amount: OUT })
    expect(classify(t, checking, { rules: DEFAULT_RULES, manual: noManual })).toBe(TRANSFER)
  })

  it.each([
    ['saída no cartão marcada como transferência (Pix no crédito = empréstimo)', card, 'Transfers', OUT],
    ['rendimento', checking, 'Proceeds interests and dividends', IN],
    ['estorno no cartão', card, 'Eating out', IN],
    ['Pix para outra pessoa', checking, 'Transfer - PIX', OUT],
    ['Pix recebido de outra pessoa', checking, 'Transfers', IN],
  ])('%s → não é transferência', (_, account, bankCategory, amount) => {
    const t = tx({ accountId: account.id, bankCategory, amount })
    expect(classify(t, account, { rules: DEFAULT_RULES, manual: noManual })).toBeUndefined()
  })
})

describe('categoryColor: cor fixa de cada categoria', () => {
  it('a escolhida pelo usuário vence a padrão', () => {
    expect(categoryColor({ id: 'housing', color: 'purple' })).toBe('purple')
  })

  it('categoria que vem com o app tem cor padrão', () => {
    expect(categoryColor({ id: 'housing' })).toBe('red')
    expect(categoryColor({ id: 'food' })).toBe('orange')
  })

  it('categoria criada no app: sempre a mesma cor, tirada do id', () => {
    const color = categoryColor({ id: 'c:minha-categoria' })

    expect(CATEGORY_COLORS).toContain(color)
    expect(categoryColor({ id: 'c:minha-categoria' })).toBe(color)
  })

  it('cor desconhecida (arquivo antigo ou editado à mão) cai na padrão', () => {
    expect(categoryColor({ id: 'food', color: 'blue' as never })).toBe('orange')
  })
})
