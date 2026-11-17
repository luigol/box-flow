import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenHeader } from '../components/ScreenHeader'
import { currentLanguage, LANGUAGES, setLanguage, type Language } from '../i18n'

/** Lista agrupada como no app Ajustes do iPhone. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="px-4 pb-1.5 text-[13px] text-ink-2 uppercase tracking-normal">{title}</h2>
      <div className="divide-y-[0.5px] divide-separator overflow-hidden rounded-xl bg-card">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
      <span>{label}</span>
      <span className="text-ink-2">{children}</span>
    </div>
  )
}

export function Settings() {
  const { t } = useTranslation()

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
        <Row label={t('settings.banks')}>{t('settings.soon')}</Row>
        <Row label={t('settings.backup')}>{t('settings.soon')}</Row>
      </Group>
      <Group title={t('settings.about')}>
        <Row label="box-flow">{t('settings.license')}</Row>
      </Group>
    </>
  )
}
