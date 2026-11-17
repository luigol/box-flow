import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../db/instance'
import type { BankTransaction } from '../domain/bank'
import { normalize } from '../domain/category'
import { formatMoney } from '../lib/format'
import { Sheet } from './Sheet'

/** Escolher um lançamento do extrato (com busca), do mais recente para o mais antigo. */
export function TxPicker({ title, onPick, onClose }: { title: string; onPick: (tx: BankTransaction) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [query, setQuery] = useState('')
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [])
  const accounts = new Map((useLiveQuery(() => db.accounts.toArray(), []) ?? []).map((a) => [a.id, a]))

  const shown = useMemo(() => {
    const q = normalize(query)
    return (transactions ?? [])
      .filter((tx) => !q || normalize([tx.description, tx.rawDescription, tx.merchant].filter(Boolean).join(' ')).includes(q))
      .slice(0, 80)
  }, [transactions, query])

  return (
    <Sheet title={title} onClose={onClose}>
      <h2 className="px-2 text-[21px] font-semibold">{title}</h2>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('link.search')}
        autoFocus
        className="mt-3 w-full rounded-xl bg-card px-4 py-3 outline-none placeholder:text-ink-2"
      />
      <div className="mt-3 divide-y-[0.5px] divide-separator overflow-hidden rounded-xl bg-card">
        {shown.map((tx) => {
          const account = accounts.get(tx.accountId)
          return (
            <button key={tx.id} type="button" onClick={() => onPick(tx)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left active:bg-card-pressed">
              <div className="min-w-0 flex-1">
                <p className="truncate">{tx.merchant ?? tx.description}</p>
                <p className="truncate text-[13px] tracking-normal text-ink-2">
                  {`${tx.date.slice(8, 10)}/${tx.date.slice(5, 7)}/${tx.date.slice(0, 4)}`}
                  {account ? ` · ${account.last4 ? `${account.name} •${account.last4}` : account.name}` : ''}
                </p>
              </div>
              <p className={`shrink-0 tabular-nums ${tx.amount > 0 ? 'text-positive' : ''}`}>{formatMoney(tx.amount, locale, { signed: tx.amount > 0 })}</p>
            </button>
          )
        })}
        {shown.length === 0 && <p className="px-4 py-3 text-ink-2">{t('link.nothing')}</p>}
      </div>
    </Sheet>
  )
}
