import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { Group, LinkRow, Row } from '../components/List'
import { ScreenHeader } from '../components/ScreenHeader'
import { db, loadPluggySettings } from '../db/instance'
import { currentLanguage, LANGUAGES, setLanguage, type Language } from '../i18n'

export function Settings({ onOpenBanks, onOpenCategories }: { onOpenBanks: () => void; onOpenCategories: () => void }) {
  const { t } = useTranslation()
  const pluggy = useLiveQuery(loadPluggySettings, [])
  const categoryCount = useLiveQuery(() => db.categories.count(), [])
  const connectionCount = pluggy?.itemIds.length ?? 0

  return (
    <>
      <ScreenHeader title={t('tabs.settings')} />
      <Group title={t('settings.general')}>
        <Row label={t('settings.language')}>
          <select
            value={currentLanguage()}
            onChange={(event) => setLanguage(event.target.value as Language)}
            aria-label={t('settings.language')}
            className="appearance-none bg-transparent text-right text-ink-2 outline-none"
          >
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Row>
      </Group>
      <Group title={t('settings.data')}>
        <LinkRow
          label={t('settings.banks')}
          value={connectionCount ? t('settings.banksConnected', { count: connectionCount }) : t('settings.banksNotConfigured')}
          onClick={onOpenBanks}
        />
        <LinkRow
          label={t('settings.categories')}
          value={t('settings.categoriesCount', { count: categoryCount ?? 0 })}
          onClick={onOpenCategories}
        />
        <Row label={t('settings.backup')}>{t('settings.soon')}</Row>
      </Group>
      <Group title={t('settings.about')}>
        <Row label="box-flow">{t('settings.license')}</Row>
      </Group>
    </>
  )
}
