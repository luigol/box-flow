import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteCommitment, endCommitment, saveCommitment } from '../db/commitments'
import { db } from '../db/instance'
import { categoryName, TRANSFER } from '../domain/category'
import { firstMonth, type Commitment } from '../domain/commitment'
import { moneyInput, parseMoney } from '../lib/format'
import { currentMonth, type YearMonth } from '../lib/month'
import { Sheet } from './Sheet'

const field = 'mt-1 w-full rounded-xl bg-card px-4 py-3 outline-none'
const primary = 'rounded-full bg-accent px-5 py-2.5 text-white disabled:opacity-40 active:opacity-80'

/** Criar ou editar um compromisso (docs/design.md, "Compromisso"). */
export function CommitmentSheet({ commitment, onClose }: { commitment?: Commitment; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const existing = commitment
  const [kind, setKind] = useState<Commitment['kind']>(existing?.kind ?? 'recurring')
  const [direction, setDirection] = useState<Commitment['direction']>(existing?.direction ?? 'out')
  const [name, setName] = useState(existing?.name ?? '')
  const [person, setPerson] = useState(existing?.kind === 'installment' ? existing.person : '')
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '')
  const [amountText, setAmountText] = useState(existing ? moneyInput(existing.amount, locale) : '')
  const [amountMode, setAmountMode] = useState<Commitment['amountMode']>(existing?.amountMode ?? 'fixed')
  const [frequency, setFrequency] = useState(existing?.kind === 'recurring' ? existing.frequency : 'monthly')
  const [day, setDay] = useState(String(existing?.day ?? ''))
  const [month, setMonth] = useState(String(existing?.start.month ?? currentMonth().month))
  const [accountId, setAccountId] = useState(existing?.accountId ?? '')
  const [total, setTotal] = useState(existing?.kind === 'installment' ? String(existing.total) : '')
  const [paid, setPaid] = useState(existing?.kind === 'installment' ? String(existing.paid) : '0')
  const [confirming, setConfirming] = useState<'end' | 'remove' | null>(null)

  const amount = parseMoney(amountText)
  const dayNumber = Number(day)
  const totalNumber = Number(total)
  const paidNumber = Number(paid)
  const isCard = accounts?.find((a) => a.id === accountId)?.kind === 'credit_card'
  const valid =
    name.trim() &&
    amount !== null &&
    Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 31 &&
    (kind === 'recurring' || (person.trim() && totalNumber >= 1 && paidNumber >= 0 && paidNumber < totalNumber))

  function start(): YearMonth {
    const today = new Date()
    // Na edição, a data de início só muda se o agendamento mudou (o passado não muda).
    const scheduleChanged =
      !existing ||
      existing.day !== dayNumber ||
      (existing.kind === 'recurring' && (existing.frequency !== frequency || (frequency === 'yearly' && existing.start.month !== Number(month))))
    if (!scheduleChanged) return existing.start
    if (kind === 'recurring' && frequency === 'yearly') {
      const m = Number(month)
      const now = currentMonth(today)
      const passed = m < now.month || (m === now.month && today.getDate() > dayNumber)
      return { year: now.year + (passed ? 1 : 0), month: m }
    }
    return firstMonth(dayNumber, today, { linkedThisMonth: false })
  }

  async function save() {
    if (!valid || amount === null) return
    const base = {
      id: existing?.id ?? `k:${crypto.randomUUID()}`,
      name: name.trim(),
      direction: kind === 'installment' ? ('out' as const) : direction,
      amount,
      amountMode: kind === 'installment' ? ('fixed' as const) : amountMode,
      day: dayNumber,
      start: start(),
      ...(categoryId ? { categoryId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(existing?.bankText ? { bankText: existing.bankText } : {}),
    }
    const next: Commitment =
      kind === 'recurring'
        ? { ...base, kind, frequency, ...(existing?.kind === 'recurring' && existing.end ? { end: existing.end } : {}) }
        : { ...base, kind, person: person.trim(), total: totalNumber, paid: paidNumber }
    await saveCommitment(next)
    onClose()
  }

  const sortedCategories = [...(categories ?? [])]
    .filter((c) => c.id !== TRANSFER)
    .sort((a, b) => categoryName(a, locale).localeCompare(categoryName(b, locale), locale))
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2026, i, 1)),
  )

  return (
    <Sheet title={existing ? t('commitmentForm.editTitle') : t('commitmentForm.newTitle')} onClose={onClose}>
      <h2 className="px-2 text-[21px] font-semibold">{existing ? t('commitmentForm.editTitle') : t('commitmentForm.newTitle')}</h2>
      <form
        className="mt-3 space-y-3 px-1"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {!existing && (
          <Segmented
            value={kind}
            onChange={(v) => setKind(v)}
            options={[
              ['recurring', t('commitmentForm.kindRecurring')],
              ['installment', t('commitmentForm.kindInstallment')],
            ]}
          />
        )}
        {kind === 'recurring' && (
          <Segmented
            value={direction}
            onChange={(v) => setDirection(v)}
            options={[
              ['out', t('commitmentForm.out')],
              ['in', t('commitmentForm.in')],
            ]}
          />
        )}
        {kind === 'installment' && (
          <Label text={t('commitmentForm.person')}>
            <input value={person} onChange={(e) => setPerson(e.target.value)} className={field} />
          </Label>
        )}
        <Label text={kind === 'installment' ? t('commitmentForm.reason') : t('commitmentForm.name')}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'installment' ? t('commitmentForm.reasonPlaceholder') : t('commitmentForm.namePlaceholder')}
            className={`${field} placeholder:text-ink-2`}
          />
        </Label>
        <Label text={t('commitmentForm.category')}>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field}>
            <option value="">{t('commitmentForm.noCategory')}</option>
            {sortedCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryName(c, locale)}
              </option>
            ))}
          </select>
        </Label>
        <Label text={kind === 'installment' ? t('commitmentForm.installmentAmount') : t('commitmentForm.amount')}>
          <input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00" className={`${field} tabular-nums placeholder:text-ink-2`} />
        </Label>
        {kind === 'recurring' && (
          <>
            <Segmented
              value={amountMode}
              onChange={(v) => setAmountMode(v)}
              options={[
                ['fixed', t('commitmentForm.amountFixed')],
                ['average', t('commitmentForm.amountAverage')],
              ]}
            />
            {amountMode === 'average' && <p className="px-3 text-[13px] tracking-normal text-ink-2">{t('commitmentForm.amountAverageHint')}</p>}
            <Segmented
              value={frequency}
              onChange={(v) => setFrequency(v)}
              options={[
                ['monthly', t('commitmentForm.monthly')],
                ['yearly', t('commitmentForm.yearly')],
              ]}
            />
          </>
        )}
        <div className="flex gap-3">
          <Label text={isCard ? t('commitmentForm.chargeDay') : t('commitmentForm.day')} className="flex-1">
            <input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))} className={field} />
          </Label>
          {kind === 'recurring' && frequency === 'yearly' && (
            <Label text={t('commitmentForm.month')} className="flex-[2]">
              <select value={month} onChange={(e) => setMonth(e.target.value)} className={field}>
                {monthNames.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </Label>
          )}
        </div>
        {kind === 'installment' && (
          <div className="flex gap-3">
            <Label text={t('commitmentForm.total')} className="flex-1">
              <input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ''))} className={field} />
            </Label>
            <Label text={t('commitmentForm.paid')} className="flex-1">
              <input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value.replace(/\D/g, ''))} className={field} />
            </Label>
          </div>
        )}
        <Label text={t('commitmentForm.account')}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
            <option value="">{t('commitmentForm.anyAccount')}</option>
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.last4 ? `${a.name} •${a.last4}` : a.name}
              </option>
            ))}
          </select>
        </Label>
        {isCard && <p className="px-3 text-[13px] tracking-normal text-ink-2">{t('commitmentForm.cardHint')}</p>}

        {confirming ? (
          <div className="rounded-xl bg-card p-4">
            <p className="text-[15px]">{confirming === 'end' ? t('commitmentForm.endConfirm') : t('commitmentForm.removeConfirm')}</p>
            <div className="mt-3 flex gap-5">
              <button
                type="button"
                className="text-warning"
                onClick={() =>
                  void (confirming === 'end' && existing ? endCommitment(existing) : deleteCommitment(existing!.id)).then(onClose)
                }
              >
                {t('commitmentForm.confirm')}
              </button>
              <button type="button" className="text-accent" onClick={() => setConfirming(null)}>
                {t('commitmentForm.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5 pt-2">
            <button type="submit" disabled={!valid} className={primary}>
              {t('commitmentForm.save')}
            </button>
            {existing?.kind === 'recurring' && !existing.end && (
              <button type="button" className="text-accent" onClick={() => setConfirming('end')}>
                {t('commitmentForm.end')}
              </button>
            )}
            {existing && (
              <button type="button" className="text-warning" onClick={() => setConfirming('remove')}>
                {t('commitmentForm.remove')}
              </button>
            )}
          </div>
        )}
      </form>
    </Sheet>
  )
}

function Label({ text, className = '', children }: { text: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block px-1 text-[13px] tracking-normal text-ink-2 ${className}`}>
      {text}
      <div className="text-[17px] tracking-[-0.022em] text-ink">{children}</div>
    </label>
  )
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex rounded-full bg-card-pressed p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`flex-1 rounded-full px-2 py-1.5 text-[14px] font-semibold tracking-[-0.016em] ${value === v ? 'bg-card text-ink shadow-sm' : 'text-ink-2'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
