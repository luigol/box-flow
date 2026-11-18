import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addCategory, clearManualCategory, createUserRule, setManualCategory, suggestRuleText } from '../db/classification'
import type { BankTransaction } from '../domain/bank'
import { categoryName, classify, TRANSFER, type Category, type ClassifyContext } from '../domain/category'
import type { StatementEntry } from '../domain/statement'
import { CheckIcon } from './icons'
import { Sheet } from './Sheet'

interface CategorySheetProps {
  entry: StatementEntry
  categories: Category[]
  ctx: ClassifyContext
  onClose: () => void
}

/** Escolher a categoria de um lançamento e, em seguida, se quiser, criar uma regra para os parecidos. */
export function CategorySheet({ entry, categories, ctx, onClose }: CategorySheetProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { tx, account } = entry
  const current = classify(tx, account, ctx)
  const isManual = ctx.manual.has(tx.id)
  const [chosen, setChosen] = useState<string | null>(null)
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

  if (chosen) {
    return (
      <Sheet title={t('categorize.applyAllTitle')} onClose={onClose}>
        <RuleStep tx={tx} categoryId={chosen} categories={categories} secondary={t('categorize.onlyThis')} onDone={onClose} />
      </Sheet>
    )
  }

  return (
    <Sheet title={t('categorize.title')} onClose={onClose}>
      <h2 className="mb-4 px-2 text-center font-semibold">{t('categorize.title')}</h2>
      <div className="inset-rows overflow-hidden rounded-block bg-card">
        {sorted.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => void choose(category.id)}
            className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left active:bg-card-pressed"
          >
            <span>{categoryName(category, locale)}</span>
            {category.id === current && <CheckIcon />}
          </button>
        ))}
      </div>
      <form
        className="mt-3.5 flex items-center gap-3 rounded-block bg-card px-4 py-2"
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
          className="min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-ink-2"
        />
        <button type="submit" disabled={!newName.trim()} className="font-semibold disabled:opacity-40">
          {t('categorize.add')}
        </button>
      </form>
      {isManual && (
        <button type="button" onClick={() => void clearManualCategory(tx.id).then(onClose)} className="mt-3.5 flex min-h-[54px] w-full items-center rounded-full bg-card px-5 active:bg-card-pressed">
          {t('categorize.backToRule')}
        </button>
      )}
    </Sheet>
  )
}

/** "Criar regra para parecidos", direto do detalhe do lançamento. */
export function RuleSheet({ tx, categoryId, categories, onClose }: { tx: BankTransaction; categoryId: string; categories: Category[]; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Sheet title={t('categorize.applyAllTitle')} onClose={onClose}>
      <RuleStep tx={tx} categoryId={categoryId} categories={categories} secondary={t('categorize.cancel')} onDone={onClose} />
    </Sheet>
  )
}

/** Regra com um trecho do texto do banco: vale para todos os parecidos, inclusive os antigos. */
function RuleStep(props: { tx: BankTransaction; categoryId: string; categories: Category[]; secondary: string; onDone: () => void }) {
  const { tx, categoryId, categories, secondary, onDone } = props
  const { t, i18n } = useTranslation()
  const [ruleText, setRuleText] = useState(() => suggestRuleText(tx))
  const category = categories.find((c) => c.id === categoryId)

  async function createRule() {
    if (ruleText.trim()) await createUserRule(ruleText, categoryId, tx)
    onDone()
  }

  return (
    <>
      <h2 className="px-2 text-[21px] font-semibold">{t('categorize.applyAllTitle')}</h2>
      <p className="mt-1 px-2 text-[15px] text-ink-2">
        {t('categorize.applyAllBody', { category: category ? categoryName(category, i18n.language) : '' })}
      </p>
      <input
        value={ruleText}
        onChange={(e) => setRuleText(e.target.value)}
        aria-label={t('categorize.ruleText')}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="mt-3 w-full rounded-block bg-card px-4 py-3 font-mono text-[15px] outline-none"
      />
      <div className="mt-5 flex items-center gap-5 px-2">
        <button
          type="button"
          disabled={!ruleText.trim()}
          onClick={() => void createRule()}
          className="rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent disabled:opacity-40 active:opacity-80"
        >
          {t('categorize.createRule')}
        </button>
        <button type="button" onClick={onDone} className="text-ink-2">
          {secondary}
        </button>
      </div>
    </>
  )
}
