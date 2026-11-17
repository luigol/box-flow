import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeftIcon } from '../components/icons'
import { Group } from '../components/List'
import { ScreenHeader } from '../components/ScreenHeader'
import { addCategory, deleteRule, renameCategory } from '../db/classification'
import { db } from '../db/instance'
import { categoryName, TRANSFER, type Category } from '../domain/category'

/**
 * Ajustes → Categorias e regras: as regras criadas no app, as que vieram do arquivo box-flow.json
 * (só contagem) e as categorias, para criar e renomear. Abrir arquivo fica em Ajustes → Arquivos e backup.
 */
export function CategoriesSettings({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const userRules = useLiveQuery(() => db.rules.where('source').equals('user').toArray(), [])
  const importedCount = useLiveQuery(() => db.rules.where('source').equals('import').count(), [])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [newName, setNewName] = useState('')

  const byId = new Map((categories ?? []).map((c) => [c.id, c]))
  const sorted = [...(categories ?? [])].sort((a, b) =>
    a.id === TRANSFER ? 1 : b.id === TRANSFER ? -1 : categoryName(a, locale).localeCompare(categoryName(b, locale), locale),
  )

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

      <Group title={t('rulesPage.yourRules')} footer={importedCount ? t('rulesPage.importedCount', { count: importedCount }) : undefined}>
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
