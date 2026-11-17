import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addCategory,
  clearManualCategory,
  createUserRule,
  setManualCategory,
  suggestRuleText,
} from '../db/classification'
import { categoryName, classify, TRANSFER, type Category, type ClassifyContext } from '../domain/category'
import type { StatementEntry } from '../domain/statement'
import { formatMoney } from '../lib/format'
import { Sheet } from './Sheet'

interface CategorySheetProps {
  entry: StatementEntry
  categories: Category[]
  ctx: ClassifyContext
  onClose: () => void
}

/** Escolher a categoria de um lançamento e, se quiser, criar uma regra para os parecidos. */
export function CategorySheet({ entry, categories, ctx, onClose }: CategorySheetProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { tx, account } = entry
  const current = classify(tx, account, ctx)
  const isManual = ctx.manual.has(tx.id)
  const [chosen, setChosen] = useState<string | null>(null)
  const [ruleText, setRuleText] = useState(() => suggestRuleText(tx))
  const [newName, setNewName] = useState('')

  const sorted = [...categories].sort((a, b) =>
    a.id === TRANSFER ? 1 : b.id === TRANSFER ? -1 : categoryName(a, locale).localeCompare(categoryName(b, locale), locale),
  )

  async function choose(categoryId: string) {
    await setManualCategory(tx.id, categoryId)
    setChosen(categoryId)
  }

  async function createAndChoose() {
    if (!newName.trim()) return
    await choose(await addCategory(newName))
  }

  async function createRule() {
    if (chosen && ruleText.trim()) await createUserRule(ruleText, chosen, tx)
    onClose()
  }

  const header = (
    <div className="mb-4 px-2">
      <p className="truncate font-semibold">{tx.merchant ?? tx.description}</p>
      <p className="text-ink-2 tabular-nums">{formatMoney(tx.amount, locale, { signed: tx.amount > 0 })}</p>
    </div>
  )

  if (chosen) {
    const chosenCategory = categories.find((c) => c.id === chosen)
    return (
      <Sheet title={t('categorize.applyAllTitle')} onClose={onClose}>
        {header}
        <h2 className="px-2 text-[21px] font-semibold">{t('categorize.applyAllTitle')}</h2>
        <p className="mt-1 px-2 text-[15px] text-ink-2">
          {t('categorize.applyAllBody', { category: chosenCategory ? categoryName(chosenCategory, locale) : '' })}
        </p>
        <input
          value={ruleText}
          onChange={(e) => setRuleText(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="mt-3 w-full rounded-xl bg-card px-4 py-3 font-mono text-[15px] outline-none"
        />
        <div className="mt-5 flex items-center gap-5 px-2">
          <button
            type="button"
            disabled={!ruleText.trim()}
            onClick={() => void createRule()}
            className="rounded-full bg-accent px-5 py-2.5 text-white disabled:opacity-40 active:opacity-80"
          >
            {t('categorize.createRule')}
          </button>
          <button type="button" onClick={onClose} className="text-accent">
            {t('categorize.onlyThis')}
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={t('categorize.title')} onClose={onClose}>
      {header}
      <div className="divide-y-[0.5px] divide-separator overflow-hidden rounded-xl bg-card">
        {sorted.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => void choose(category.id)}
            className="flex min-h-11 w-full items-center justify-between px-4 py-2.5 text-left active:bg-card-pressed"
          >
            <span>{categoryName(category, locale)}</span>
            {category.id === current && <span className="text-accent">✓</span>}
          </button>
        ))}
        <form
          className="flex items-center gap-3 px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            void createAndChoose()
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('categorize.newCategoryPlaceholder')}
            aria-label={t('categorize.newCategory')}
            className="min-w-0 flex-1 bg-transparent py-1 outline-none placeholder:text-ink-2"
          />
          <button type="submit" disabled={!newName.trim()} className="text-accent disabled:opacity-40">
            {t('categorize.add')}
          </button>
        </form>
      </div>
      {isManual && (
        <button
          type="button"
          onClick={() => void clearManualCategory(tx.id).then(onClose)}
          className="mt-4 px-2 text-accent"
        >
          {t('categorize.backToRule')}
        </button>
      )}
    </Sheet>
  )
}
