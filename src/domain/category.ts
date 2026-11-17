import type { BankAccount, BankTransaction } from './bank'

/** Categoria especial: transferência entre contas próprias. Não conta como entrada nem saída. */
export const TRANSFER = 'transfer'

export interface Category {
  id: string
  /** Nome dado pelo usuário. Sem ele, vale o nome padrão no idioma do app. */
  name?: string
}

type Language = 'pt-BR' | 'en'

/** Categorias que já vêm com o app (docs/design.md, "Categorias padrão"). */
export const DEFAULT_CATEGORIES: { id: string; names: Record<Language, string> }[] = [
  { id: 'ride-hailing', names: { 'pt-BR': 'Transporte por app', en: 'Ride-hailing' } },
  { id: 'transport', names: { 'pt-BR': 'Transporte', en: 'Transport' } },
  { id: 'food', names: { 'pt-BR': 'Alimentação', en: 'Food' } },
  { id: 'leisure', names: { 'pt-BR': 'Lazer', en: 'Leisure' } },
  { id: 'health', names: { 'pt-BR': 'Saúde', en: 'Health' } },
  { id: 'gifts', names: { 'pt-BR': 'Presente', en: 'Gifts' } },
  { id: 'clothing', names: { 'pt-BR': 'Roupa', en: 'Clothing' } },
  { id: 'airfare', names: { 'pt-BR': 'Passagem', en: 'Airfare' } },
  { id: 'housing', names: { 'pt-BR': 'Moradia', en: 'Housing' } },
  { id: 'accounting', names: { 'pt-BR': 'Contabilidade', en: 'Accounting' } },
  { id: 'taxes', names: { 'pt-BR': 'Imposto', en: 'Taxes' } },
  { id: 'subscriptions', names: { 'pt-BR': 'Assinaturas', en: 'Subscriptions' } },
  { id: 'loan', names: { 'pt-BR': 'Empréstimo', en: 'Loan' } },
  { id: 'salary', names: { 'pt-BR': 'Salário', en: 'Salary' } },
  { id: TRANSFER, names: { 'pt-BR': 'Transferência', en: 'Transfer' } },
]

/** Nome para mostrar: o dado pelo usuário ou o padrão no idioma. */
export function categoryName(category: Category, language: string): string {
  if (category.name) return category.name
  const names = DEFAULT_CATEGORIES.find((c) => c.id === category.id)?.names
  return names?.[language === 'en' ? 'en' : 'pt-BR'] ?? category.id
}

/**
 * Regra de classificação: condições sobre o lançamento → categoria.
 * Todas as condições presentes precisam valer; uma regra sem condição nenhuma não se aplica.
 */
export interface Rule {
  id: string
  /** `user`: criada no app; `import`: veio do arquivo de regras; `default`: já vem com o app. */
  source: 'user' | 'import' | 'default'
  /** Trecho do texto do banco (descrição, original ou estabelecimento). */
  text?: string
  /** Categoria que a Pluggy deu ao lançamento (em inglês), uma destas. */
  bankCategories?: string[]
  accountKind?: BankAccount['kind']
  /** `in`: dinheiro entrou; `out`: saiu. */
  direction?: 'in' | 'out'
  categoryId: string
  /** Quando foi criada. Entre as suas regras, vale a mais recente. */
  createdAt?: string
}

export interface ClassifyContext {
  rules: Rule[]
  /** Categoria escolhida à mão, por id do lançamento. */
  manual: Map<string, string>
}

/**
 * Transferências que a Pluggy já identifica (docs/design.md, "Categorias").
 * Ficam de fora: saída no cartão marcada como transferência (Pix no crédito, que é empréstimo),
 * rendimentos e estornos.
 */
export const DEFAULT_RULES: Rule[] = [
  {
    id: 'default:transfers',
    source: 'default',
    bankCategories: ['Credit card payment', 'Same person transfer', 'Investments', 'Fixed income'],
    categoryId: TRANSFER,
  },
  {
    // Alguns bancos mandam o pagamento da fatura só como "Transfers".
    id: 'default:bill-payment-text',
    source: 'default',
    text: 'Pagamento de fatura',
    direction: 'out',
    categoryId: TRANSFER,
  },
  {
    id: 'default:card-payment-in',
    source: 'default',
    accountKind: 'credit_card',
    direction: 'in',
    bankCategories: ['Transfers', 'Transfer - PIX'],
    categoryId: TRANSFER,
  },
]

/** Categoria do lançamento, ou `undefined` se nenhuma regra se aplica. */
export function classify(tx: BankTransaction, account: BankAccount, ctx: ClassifyContext): string | undefined {
  const manual = ctx.manual.get(tx.id)
  if (manual) return manual
  // Separados por "|" para um trecho não casar juntando o fim de um texto com o começo de outro.
  const text = [tx.description, tx.rawDescription, tx.merchant].filter(Boolean).map((s) => normalize(s!)).join('|')
  for (const source of SOURCE_PRIORITY) {
    const candidates = ctx.rules.filter((r) => r.source === source && matches(r, tx, account, text))
    // Entre as suas regras, a mais recente é uma correção das anteriores.
    if (source === 'user') candidates.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    if (candidates[0]) return candidates[0].categoryId
  }
  return undefined
}

/** As suas regras vencem as importadas, que vencem as que vêm com o app. */
const SOURCE_PRIORITY: Rule['source'][] = ['user', 'import', 'default']

function matches(rule: Rule, tx: BankTransaction, account: BankAccount, text: string): boolean {
  if (!rule.text && !rule.bankCategories) return false
  if (rule.text && !text.includes(normalize(rule.text))) return false
  if (rule.bankCategories && !(tx.bankCategory && rule.bankCategories.includes(tx.bankCategory))) return false
  if (rule.accountKind && rule.accountKind !== account.kind) return false
  if (rule.direction && rule.direction !== (tx.amount > 0 ? 'in' : 'out')) return false
  return true
}

/**
 * Forma de comparar textos do banco: sem acento, em maiúsculas e sem espaços.
 * O banco varia os espaços ("DL *UberRides", "DL          *UberRides", "DL*UberRides").
 */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, '')
}
