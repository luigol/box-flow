import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExportSheet, OpenFileSheet } from '../components/FileSheets'
import { Group, LinkRow, Row } from '../components/List'
import { ScreenHeader } from '../components/ScreenHeader'
import { db, loadPluggySettings } from '../db/instance'
import { currentLanguage, LANGUAGES, setLanguage, type Language } from '../i18n'

export function Settings({ onOpenBanks, onOpenCategories }: { onOpenBanks: () => void; onOpenCategories: () => void }) {
  const { t } = useTranslation()
  const pluggy = useLiveQuery(loadPluggySettings, [])
  const categoryCount = useLiveQuery(() => db.categories.count(), [])
  const connectionCount = pluggy?.itemIds.length ?? 0
  const fileInput = useRef<HTMLInputElement>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

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
      </Group>
      <Group title={t('settings.backup')} footer={t('settings.backupHint')}>
        <button type="button" onClick={() => fileInput.current?.click()} className={actionRow}>
          {t('files.open')}
        </button>
        <button type="button" onClick={() => setExporting(true)} className={actionRow}>
          {t('files.exportBackup')}
        </button>
      </Group>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = '' // permite escolher o mesmo arquivo de novo
          if (file) void file.text().then(setOpening)
        }}
      />
      <Group title={t('settings.about')}>
        <Row label="box-flow">{t('settings.license')}</Row>
      </Group>
      {opening !== null && <OpenFileSheet fileText={opening} onClose={() => setOpening(null)} />}
      {exporting && <ExportSheet onClose={() => setExporting(false)} />}
    </>
  )
}

const actionRow = 'flex min-h-11 w-full items-center px-4 py-2.5 text-left text-accent active:bg-card-pressed'
