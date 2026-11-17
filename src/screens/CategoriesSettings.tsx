import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeftIcon } from '../components/icons'
import { Group } from '../components/List'
import { ScreenHeader } from '../components/ScreenHeader'
import { addCategory, deleteRule, renameCategory } from '../db/classification'
import { db } from '../db/instance'
import { importRules, RulesFileError, type ImportResult } from '../db/rulesImport'
import { categoryName, TRANSFER, type Category } from '../domain/category'

/** Ajustes → Categorias e regras: importar o arquivo de regras, ver as suas regras, renomear e criar categorias. */
export function CategoriesSettings({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const userRules = useLiveQuery(() => db.rules.where('source').equals('user').toArray(), [])
  const importedCount = useLiveQuery(() => db.rules.where('source').equals('import').count(), [])
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ text: string; problems?: string[]; error?: boolean } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [newName, setNewName] = useState('')

  const byId = new Map((categories ?? []).map((c) => [c.id, c]))
  const sorted = [...(categories ?? [])].sort((a, b) =>
    a.id === TRANSFER ? 1 : b.id === TRANSFER ? -1 : categoryName(a, locale).localeCompare(categoryName(b, locale), locale),
  )

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // permite escolher o mesmo arquivo de novo
    if (!file) return
    try {
      const result: ImportResult = await importRules(db, await file.text())
      setMessage({
        text: t('rulesPage.importedNow', { rules: result.imported, categories: result.categoriesCreated }),
        problems: result.problems.map((p) => t('rulesPage.problem', { rule: p.rule, problem: t(`rulesPage.problems.${p.problem}`) })),
      })
    } catch (error) {
      const reason = error instanceof RulesFileError ? error.reason : null
      setMessage({
        text: reason === 'wrong-format' ? t('rulesPage.wrongFormat') : t('rulesPage.invalidJson'),
        error: true,
      })
    }
  }

  async function saveRename(category: Category) {
    await renameCategory(category.id, draft)
    setRenaming(null)
  }

  return (
    <>
      <button type="button" onClick={onBack} className="-ml-1 mb-1 flex items-center text-accent [&_svg]:size-5">
        <ChevronLeftIcon />
        {t('banks.back')}
      </button>
      <ScreenHeader title={t('settings.categories')} />

      <Group title={t('rulesPage.file')} footer={t('rulesPage.fileHint')}>
        <button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-11 w-full items-center px-4 py-2.5 text-accent">
          {t('rulesPage.importButton')}
        </button>
        <p className="px-4 py-2.5 text-ink-2">{t('rulesPage.importedCount', { count: importedCount ?? 0 })}</p>
        {message && (
          <div className={`px-4 py-2.5 text-[15px] ${message.error ? 'text-warning' : ''}`}>
            <p>{message.text}</p>
            {message.problems?.map((p) => (
              <p key={p} className="text-warning">
                {p}
              </p>
            ))}
          </div>
        )}
      </Group>
      <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onFile(e)} />

      <Group title={t('rulesPage.yourRules')}>
        {userRules?.length ? (
          userRules.map((rule) => {
            const category = byId.get(rule.categoryId)
            return (
              <div key={rule.id} className="flex items-center gap-3 px-4 py-2.5">
                <p className="min-w-0 flex-1 truncate">
                  <span className="font-mono text-[15px]">{rule.text}</span>
                  <span className="text-ink-2"> → {category ? categoryName(category, locale) : '?'}</span>
                </p>
                <button type="button" onClick={() => void deleteRule(rule.id)} aria-label={t('rulesPage.deleteRule')} className="text-warning">
                  ✕
                </button>
              </div>
            )
          })
        ) : (
          <p className="px-4 py-2.5 text-ink-2">{t('rulesPage.noRules')}</p>
        )}
      </Group>

      <Group title={t('rulesPage.categories')} footer={t('rulesPage.categoriesHint')}>
        {sorted.map((category) =>
          renaming === category.id ? (
            <form
              key={category.id}
              className="flex items-center gap-3 px-4 py-2"
              onSubmit={(e) => {
                e.preventDefault()
                void saveRename(category)
              }}
            >
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 bg-transparent py-1 outline-none" />
              <button type="submit" className="text-accent">
                {t('rulesPage.save')}
              </button>
            </form>
          ) : (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                setRenaming(category.id)
                setDraft(categoryName(category, locale))
              }}
              className="flex min-h-11 w-full items-center px-4 py-2.5 text-left active:bg-card-pressed"
            >
              {categoryName(category, locale)}
            </button>
          ),
        )}
        <form
          className="flex items-center gap-3 px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (newName.trim()) void addCategory(newName).then(() => setNewName(''))
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('rulesPage.newCategory')}
            className="min-w-0 flex-1 bg-transparent py-1 outline-none placeholder:text-ink-2"
          />
          <button type="submit" disabled={!newName.trim()} className="text-accent disabled:opacity-40">
            {t('categorize.add')}
          </button>
        </form>
      </Group>
    </>
  )
}
