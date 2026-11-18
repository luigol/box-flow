import { useTranslation } from 'react-i18next'
import { categoryColor, categoryName, type Category } from '../domain/category'
import type { MonthSpending } from '../domain/statement'
import { formatMoney } from '../lib/format'

interface MonthBarProps {
  /** Entradas realizadas no mês (centavos). */
  income: number
  /** Entradas ainda previstas no mês (centavos, positivo). */
  plannedIncome: number
  spending: MonthSpending
  /** Saídas ainda previstas no mês (centavos, positivo). */
  plannedExpense: number
  categories: Category[]
}

interface Segment {
  key: string
  label: string
  amount: number
  /** Cor da bolinha e do trecho; sem cor, é o previsto (listrado). */
  color?: string
}

/** Abaixo desta fração da barra, o valor livre não cabe dentro dela e vai para baixo. */
const MIN_FREE_LABEL = 0.28

/**
 * Barra do mês, como a de Ajustes → Armazenamento do iPhone (docs/design.md, "Visual"): o total são
 * as entradas; cada cor é uma categoria de gasto, o listrado é o previsto e o espaço escuro, com o
 * valor dentro, é o que fica livre.
 */
export function MonthBar({ income, plannedIncome, spending, plannedExpense, categories }: MonthBarProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const byId = new Map(categories.map((c) => [c.id, c]))

  const segments: Segment[] = spending.top.map(({ categoryId, amount }) => {
    const category = byId.get(categoryId) ?? { id: categoryId }
    return { key: categoryId, label: categoryName(category, locale), amount, color: `var(--cat-${categoryColor(category)})` }
  })
  if (spending.others > 0) segments.push({ key: 'others', label: t('statement.others'), amount: spending.others, color: 'var(--cat-gray)' })
  if (plannedExpense > 0) segments.push({ key: 'planned', label: t('statement.forecast'), amount: plannedExpense })

  const used = spending.total + plannedExpense
  const free = income - used
  const total = Math.max(income, used)
  if (total <= 0) return null

  const width = (amount: number) => `${((amount / total) * 100).toFixed(2)}%`
  const freeFits = free > 0 && free / total >= MIN_FREE_LABEL
  const summary = t('statement.monthBar', {
    income: formatMoney(income, locale),
    parts: [
      ...segments.map((s) => `${s.label} ${formatMoney(s.amount, locale)}`),
      free >= 0 ? t('statement.free', { amount: formatMoney(free, locale) }) : t('statement.short', { amount: formatMoney(-free, locale) }),
    ].join(', '),
  })

  return (
    <section className="mb-3.5 rounded-block bg-card px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3 tabular-nums">
        <span>{t('statement.income')}</span>
        {free >= 0 ? (
          <span className="text-ink-2">{formatMoney(income, locale)}</span>
        ) : (
          <span className="text-warning">{t('statement.short', { amount: formatMoney(-free, locale) })}</span>
        )}
      </div>
      {plannedIncome > 0 && (
        <p className="text-right text-[13px] tracking-normal text-ink-2 tabular-nums">
          {t('statement.plannedIncome', { amount: formatMoney(plannedIncome, locale) })}
        </p>
      )}

      <div role="img" aria-label={summary} className="mt-2.5 flex h-[22px] gap-[1.5px] overflow-hidden rounded-[5px] bg-bar-free">
        {segments.map((s) => (
          <span
            key={s.key}
            className={`h-full min-w-[2px] ${s.color ? '' : 'bar-planned'}`}
            style={{ width: width(s.amount), ...(s.color ? { background: s.color } : {}) }}
          />
        ))}
        {free > 0 && (
          <span className="flex h-full min-w-0 items-center justify-center" style={{ width: width(free) }}>
            {freeFits && <b className="text-[15px] font-medium whitespace-nowrap tabular-nums">{formatMoney(free, locale)}</b>}
          </span>
        )}
      </div>
      {free > 0 && !freeFits && (
        <p className="mt-1 text-right text-[13px] tracking-normal text-ink-2 tabular-nums">{t('statement.free', { amount: formatMoney(free, locale) })}</p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[15px] leading-snug">
        {segments.map((s) => (
          <span key={s.key} className="whitespace-nowrap">
            <i
              className="mr-1.5 inline-block size-[9px] rounded-full align-[1px]"
              style={{ background: s.color ?? 'var(--planned)' }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </section>
  )
}
