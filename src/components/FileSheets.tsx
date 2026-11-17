import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../db/instance'
import { importRules, RulesFileError } from '../db/rulesImport'
import { applyVault, exportVault, type VaultPayload } from '../db/vaultData'
import { isVault, lockVault, MIN_PASSWORD_LENGTH, unlockVault, VaultError } from '../lib/vault'
import { syncNow } from '../sync/runSync'
import { Sheet } from './Sheet'

const passwordInput = 'mt-1 w-full rounded-xl bg-card px-4 py-3 outline-none'
const primary = 'rounded-full bg-accent px-5 py-2.5 text-white disabled:opacity-40 active:opacity-80'

/**
 * Abrir um arquivo do box-flow: regras (aberto) ou trancado (pede a senha).
 * Backup com lançamentos substitui os dados do aparelho: pede confirmação antes.
 */
export function OpenFileSheet({ fileText, onClose }: { fileText: string; onClose: () => void }) {
  const { t } = useTranslation()
  const locked = isVault(fileText)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [payload, setPayload] = useState<VaultPayload | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  async function finish(content: VaultPayload) {
    const result = await applyVault(db, content)
    const parts = [
      result.pluggy && t('files.partPluggy'),
      result.rules && t('files.partRules', { count: result.rules.imported }),
      result.transactions !== undefined && t('files.partTransactions', { count: result.transactions }),
    ].filter(Boolean)
    setMessage({ text: t('files.opened', { parts: parts.join(', ') }) })
    if (result.pluggy) void syncNow()
  }

  async function unlock() {
    setBusy(true)
    setMessage(null)
    try {
      const content = (await unlockVault(fileText, password)) as VaultPayload
      if (content.tables) setPayload(content) // backup: confirmar antes de substituir
      else await finish(content)
    } catch (error) {
      const reason = error instanceof VaultError ? error.reason : 'not-a-vault'
      setMessage({ text: t(reason === 'wrong-password' ? 'files.wrongPassword' : 'files.notAVault'), error: true })
    } finally {
      setBusy(false)
    }
  }

  async function openPlain() {
    try {
      const result = await importRules(db, fileText)
      setMessage({ text: t('rulesPage.importedNow', { rules: result.imported, categories: result.categoriesCreated }) })
    } catch (error) {
      const wrongFormat = error instanceof RulesFileError && error.reason === 'wrong-format'
      setMessage({ text: t(wrongFormat ? 'rulesPage.wrongFormat' : 'rulesPage.invalidJson'), error: true })
    }
  }

  return (
    <Sheet title={t('files.openTitle')} onClose={onClose}>
      <h2 className="px-2 text-[21px] font-semibold">{t('files.openTitle')}</h2>
      {message ? (
        <>
          <p className={`mt-2 px-2 ${message.error ? 'text-warning' : ''}`}>{message.text}</p>
          <button type="button" onClick={onClose} className="mt-5 px-2 text-accent">
            {t('quickAdd.close')}
          </button>
        </>
      ) : payload ? (
        <>
          <p className="mt-2 px-2 text-[15px] text-ink-2">{t('files.restoreWarning')}</p>
          <div className="mt-5 flex items-center gap-5 px-2">
            <button type="button" className={primary} onClick={() => void finish(payload)}>
              {t('files.restore')}
            </button>
            <button type="button" onClick={onClose} className="text-accent">
              {t('files.cancel')}
            </button>
          </div>
        </>
      ) : locked ? (
        <form
          className="mt-2 px-2"
          onSubmit={(e) => {
            e.preventDefault()
            void unlock()
          }}
        >
          <p className="text-[15px] text-ink-2">{t('files.lockedBody')}</p>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label={t('files.password')}
            className={passwordInput}
          />
          <button type="submit" disabled={!password || busy} className={`mt-5 ${primary}`}>
            {busy ? t('files.unlocking') : t('files.unlock')}
          </button>
        </form>
      ) : (
        <div className="mt-2 px-2">
          <p className="text-[15px] text-ink-2">{t('files.plainBody')}</p>
          <button type="button" className={`mt-5 ${primary}`} onClick={() => void openPlain()}>
            {t('rulesPage.importButton')}
          </button>
        </div>
      )}
    </Sheet>
  )
}

/** Exportar o backup completo, trancado com a senha que o usuário escolhe. */
export function ExportSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const length = [...password.normalize('NFC')].length
  const tooShort = length < MIN_PASSWORD_LENGTH
  const mismatch = confirm.length > 0 && confirm !== password

  async function exportNow() {
    setBusy(true)
    try {
      const text = await lockVault(await exportVault(db), password)
      await deliverFile(text, `box-flow-backup-${new Date().toISOString().slice(0, 10)}.json`)
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={t('files.exportTitle')} onClose={onClose}>
      <h2 className="px-2 text-[21px] font-semibold">{t('files.exportTitle')}</h2>
      {done ? (
        <>
          <p className="mt-2 px-2">{t('files.exported')}</p>
          <button type="button" onClick={onClose} className="mt-5 px-2 text-accent">
            {t('quickAdd.close')}
          </button>
        </>
      ) : (
        <form
          className="mt-2 px-2"
          onSubmit={(e) => {
            e.preventDefault()
            void exportNow()
          }}
        >
          <p className="text-[15px] text-ink-2">{t('files.exportBody')}</p>
          <label className="mt-4 block text-[13px] tracking-normal text-ink-2">
            {t('files.password')}
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={passwordInput} />
          </label>
          <p className={`mt-1 text-[13px] tracking-normal ${password && tooShort ? 'text-warning' : 'text-ink-2'}`}>
            {t('files.minLength', { min: MIN_PASSWORD_LENGTH, count: length })}
          </p>
          <label className="mt-3 block text-[13px] tracking-normal text-ink-2">
            {t('files.confirm')}
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={passwordInput} />
          </label>
          {mismatch && <p className="mt-1 text-[13px] tracking-normal text-warning">{t('files.mismatch')}</p>}
          <button type="submit" disabled={tooShort || confirm !== password || busy} className={`mt-5 ${primary}`}>
            {busy ? t('files.locking') : t('files.export')}
          </button>
        </form>
      )}
    </Sheet>
  )
}

/** No celular, abre o menu de compartilhar (Salvar em Arquivos, AirDrop); no computador, baixa o arquivo. */
async function deliverFile(text: string, name: string): Promise<void> {
  const file = new File([text], name, { type: 'application/json' })
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
