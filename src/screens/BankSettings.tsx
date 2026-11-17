import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeftIcon } from '../components/icons'
import { Group } from '../components/List'
import { ScreenHeader } from '../components/ScreenHeader'
import type { Connection } from '../db/db'
import { db, loadPluggySettings, savePluggySettings } from '../db/instance'
import type { BankAccount } from '../domain/bank'
import { formatDate, formatDateTime } from '../lib/format'
import { syncNow, useSyncRunning } from '../sync/runSync'

const CONSENT_WARNING_DAYS = 30

const inputProps = {
  autoComplete: 'off',
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
  className: 'mt-0.5 w-full bg-transparent font-mono text-[15px] outline-none',
} as const

/** Ajustes → Bancos: credenciais da Pluggy e situação de cada conexão. */
export function BankSettings({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const running = useSyncRunning()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [itemIds, setItemIds] = useState('')
  const [saved, setSaved] = useState(false)
  const connections = useLiveQuery(() => db.connections.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])

  useEffect(() => {
    void loadPluggySettings().then((settings) => {
      if (!settings) return
      setClientId(settings.clientId)
      setClientSecret(settings.clientSecret)
      setItemIds(settings.itemIds.join('\n'))
    })
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    await savePluggySettings({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      itemIds: [...new Set(itemIds.split(/[\s,;]+/).filter(Boolean))],
    })
    setSaved(true)
    void syncNow()
  }

  const canSave = clientId.trim() && clientSecret.trim() && itemIds.trim()

  return (
    <>
      <button type="button" onClick={onBack} className="-ml-1 mb-1 flex items-center text-accent [&_svg]:size-5">
        <ChevronLeftIcon />
        {t('banks.back')}
      </button>
      <ScreenHeader title={t('settings.banks')} />

      <form onSubmit={(event) => void save(event)}>
        <Group title={t('banks.pluggy')} footer={t('banks.privacy')}>
          <label className="block px-4 py-2.5">
            <span className="text-[13px] tracking-normal text-ink-2">{t('banks.clientId')}</span>
            <input {...inputProps} value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </label>
          <label className="block px-4 py-2.5">
            <span className="text-[13px] tracking-normal text-ink-2">{t('banks.clientSecret')}</span>
            <input {...inputProps} type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          </label>
          <label className="block px-4 py-2.5">
            <span className="text-[13px] tracking-normal text-ink-2">{t('banks.itemIds')}</span>
            <textarea {...inputProps} rows={3} value={itemIds} onChange={(e) => setItemIds(e.target.value)} />
            <span className="block text-[13px] tracking-normal text-ink-2">{t('banks.itemIdsHint')}</span>
          </label>
        </Group>
        <div className="mb-8 flex items-center gap-4 px-1">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-full bg-accent px-5 py-2.5 text-white disabled:opacity-40 active:opacity-80"
          >
            {t('banks.save')}
          </button>
          {saved && <span className="text-ink-2">{t('banks.saved')}</span>}
        </div>
      </form>

      <Group title={t('banks.connections')}>
        {connections?.length ? (
          connections.map((c) => (
            <ConnectionCard key={c.itemId} connection={c} accounts={(accounts ?? []).filter((a) => a.itemId === c.itemId)} />
          ))
        ) : (
          <p className="px-4 py-3 text-ink-2">{t('banks.noConnections')}</p>
        )}
      </Group>
      <button type="button" disabled={running} onClick={() => void syncNow()} className="px-1 text-accent disabled:text-ink-2">
        {running ? t('banks.updating') : t('banks.syncNow')}
      </button>
    </>
  )
}

function ConnectionCard({ connection: c, accounts }: { connection: Connection; accounts: BankAccount[] }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const daysToConsent = c.consentExpiresAt
    ? Math.ceil((new Date(c.consentExpiresAt).getTime() - Date.now()) / 86_400_000)
    : undefined

  return (
    <div className="space-y-0.5 px-4 py-3 text-[15px]">
      <p className="font-semibold">{accounts.map((a) => a.name).join(' · ') || c.itemId}</p>
      {c.lastUpdatedAt && (
        <p className="text-ink-2">
          {t('banks.pluggyUpdated')} {formatDateTime(c.lastUpdatedAt, locale)}
        </p>
      )}
      {c.nextAutoSyncAt && (
        <p className="text-ink-2">
          {t('banks.nextSync')}: {formatDateTime(c.nextAutoSyncAt, locale)}
        </p>
      )}
      {c.consentExpiresAt && (
        <p className="text-ink-2">
          {t('banks.consentUntil')} {formatDate(c.consentExpiresAt, locale)}
        </p>
      )}
      {daysToConsent !== undefined && daysToConsent <= CONSENT_WARNING_DAYS && (
        <p className="text-warning">{t('banks.consentExpiring', { days: Math.max(daysToConsent, 0) })}</p>
      )}
      {c.error && <p className="text-warning">{t('banks.error', { message: c.error })}</p>}
    </div>
  )
}
