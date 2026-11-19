import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/Card'
import { CommitmentSheet } from '../components/CommitmentSheet'
import { Block, DetailHero, DetailSection, PushScreen } from '../components/Detail'
import { GlassTopBar } from '../components/GlassTopBar'
import { CalendarIcon, CheckIcon, GrowthIcon } from '../components/icons'
import { Disclosure, ListRow } from '../components/ListRow'
import { OccurrenceDetail } from '../components/OccurrenceDetail'
import { Switch } from '../components/Switch'
import { Tag } from '../components/Tag'
import { BALANCE_WINDOWS, saveBalancePrefs, useBalance, useBalancePrefs, type BalancePrefs, type BalanceView } from '../db/balance'
import { db } from '../db/instance'
import type { BalanceMonth } from '../domain/balance'
import type { BankAccount } from '../domain/bank'
import type { Commitment } from '../domain/commitment'
import type { ReconciledOccurrence } from '../domain/reconcile'
import { formatMoney, formatShortDate } from '../lib/format'
import { addMonths, dateInMonth, formatMonth, type YearMonth } from '../lib/month'

type View = 'with' | 'without'

/** Cor do cartãozinho de cada banco: a ordem das conexões em Ajustes → Bancos. */
const BANK_COLORS = ['var(--cat-orange)', 'var(--cat-purple)', 'var(--cat-indigo)', 'var(--cat-green)', 'var(--cat-red)']

/**
 * Aba Saldo (docs/design.md, "Aba Saldo"): o saldo atual e o previsto mês a mês, com e sem as
 * receitas previstas, partindo do dinheiro de hoje. Um destaque: o saldo previsto no fim da janela.
 */
export function Balance() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const prefs = useBalancePrefs()
  const data = useBalance(prefs)
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const [view, setView] = useState<View>('with')
  const [openMonth, setOpenMonth] = useState<number | null>(null)
  const [openOccurrence, setOpenOccurrence] = useState<{ occurrence: ReconciledOccurrence; commitment: Commitment } | null>(null)
  const [editing, setEditing] = useState<Commitment | null>(null)
  const withIncome = view === 'with'
  const setPrefs = (next: Partial<BalancePrefs>) => void saveBalancePrefs({ ...prefs, ...next })
  const money = (cents: number) => formatMoney(cents, locale)

  const openOccurrenceOf = (occurrence: ReconciledOccurrence) => {
    const commitment = data?.commitments.get(occurrence.commitmentId)
    if (commitment) setOpenOccurrence({ occurrence, commitment })
  }

  const topBar = (
    <GlassTopBar
      leading={<WindowMenu months={prefs.months} onChange={(months) => setPrefs({ months })} />}
      trailing={
        <div className="glass flex h-[46px] items-center gap-2.5 rounded-full pr-[9px] pl-4 text-ink">
          <span id="balance-investments" className="font-semibold tracking-[-0.02em] whitespace-nowrap">
            {t('balance.investments')}
          </span>
          <Switch checked={prefs.investments} onChange={(investments) => setPrefs({ investments })} labelledBy="balance-investments" />
        </div>
      }
    />
  )

  let body: ReactNode = null
  if (data && data.accounts.length === 0) {
    body = <EmptyState title={t('balance.emptyTitle')} body={t('balance.emptyBody')} />
  } else if (data) {
    const last = data.months[data.months.length - 1]!
    const end = withIncome ? last.end.withIncome : last.end.withoutIncome
    const other = withIncome ? last.end.withoutIncome : last.end.withIncome
    const firstReview = data.review[0]
    body = (
      <>
        <section className="pt-[26px] pb-[26px] text-center">
          <p className="font-rounded text-[length:clamp(2.25rem,12vw,3rem)] leading-[1.05] font-bold tracking-[-0.02em] whitespace-nowrap tabular-nums">
            {money(end)}
          </p>
          <p className="mt-1.5 text-ink-2">{t('balance.forecastOn', { date: formatShortDate(lastDay(last.month), locale) })}</p>
          <p className="mt-3.5 text-[15px] text-ink-2 tabular-nums">
            {t('balance.otherMode', { mode: withIncome ? t('balance.withoutIncome') : t('balance.withIncome'), amount: money(other) })}
          </p>
        </section>

        {firstReview && (
          <button
            type="button"
            onClick={() => openOccurrenceOf(firstReview)}
            className="flex w-full items-start gap-2.5 rounded-block bg-card px-4 py-3 text-left active:bg-card-pressed"
          >
            <div className="min-w-0 flex-1 leading-[1.3]">
              <p className="font-semibold tracking-[-0.02em]">{t('balance.toReview')}</p>
              <p className="mt-0.5 text-[15px] tracking-[-0.012em] text-ink-2">
                {data.review.length === 1
                  ? t('balance.toReviewOne', { name: data.commitments.get(firstReview.commitmentId)?.name ?? '' })
                  : t('balance.toReviewMany', { count: data.review.length })}
              </p>
            </div>
            <span className="font-semibold text-warning tabular-nums">{data.review.length}</span>
            <Disclosure />
          </button>
        )}

        <SectionTitle>{t('balance.byMonth')}</SectionTitle>
        <div className="flex flex-col gap-3">
          {data.months.map((m, i) => (
            <MonthCard key={`${m.month.year}-${m.month.month}`} month={m} withIncome={withIncome} onOpen={() => setOpenMonth(i)} />
          ))}
        </div>
        <Foot>{withIncome ? t('balance.footWithIncome') : t('balance.footWithoutIncome')}</Foot>

        <SectionTitle>{t('balance.today')}</SectionTitle>
        <TodayBlock data={data} investments={prefs.investments} />
        <Foot>{prefs.investments ? t('balance.footInvestmentsOn') : t('balance.footInvestmentsOff')}</Foot>

        {data.cards.length > 0 && (
          <>
            <SectionTitle>{t('balance.cards')}</SectionTitle>
            <Block>
              {data.cards.map((card) => {
                const account = data.accounts.find((a) => a.id === card.accountId)
                if (!account) return null
                // O banco diz quanto do limite está usado: só aparece se não bater com a soma do app.
                const bank = -account.balance
                return (
                  <AccountRow
                    key={card.accountId}
                    color={bankColor(account, data.itemOrder)}
                    title={account.name}
                    lines={[
                      account.last4 ? `${t('balance.creditCard')} •${account.last4}` : t('balance.creditCard'),
                      card.next ? t('balance.nextBill', { date: dayMonth(card.next, locale) }) : t('balance.nothingToPay'),
                      ...(bank !== card.total ? [t('balance.bankSays', { amount: money(bank) })] : []),
                    ]}
                    amount={money(card.total)}
                  />
                )
              })}
            </Block>
            <Foot>{t('balance.footCards')}</Foot>
          </>
        )}
      </>
    )
  }

  const month = openMonth !== null ? data?.months[openMonth] : undefined
  return (
    <>
      {topBar}
      <h1 className="mt-0.5 mb-3.5 px-1 text-[34px] leading-[1.12] font-bold tracking-[-0.025em]">{t('tabs.balance')}</h1>
      <div role="group" aria-label={t('balance.mode')} className="flex rounded-full bg-[var(--segment-track)] p-0.5">
        {(['with', 'without'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`h-[30px] flex-1 rounded-full text-center text-[14px] font-semibold tracking-[-0.01em] transition-colors ${
              view === v ? 'bg-[var(--segment-on)] shadow-[0_3px_8px_rgb(0_0_0/0.12),0_1px_1px_rgb(0_0_0/0.04)]' : ''
            }`}
          >
            {v === 'with' ? t('balance.withIncome') : t('balance.withoutIncome')}
          </button>
        ))}
      </div>
      {body}
      {month && data && (
        <PushScreen title={formatMonth(month.month, locale)} onClose={() => setOpenMonth(null)} escape={!openOccurrence}>
          <MonthDetail month={month} first={openMonth === 0} withIncome={withIncome} prefs={prefs} data={data} onOpenOccurrence={openOccurrenceOf} />
        </PushScreen>
      )}
      {openOccurrence && (
        <OccurrenceDetail
          occurrence={openOccurrence.occurrence}
          commitment={openOccurrence.commitment}
          category={categories?.find((c) => c.id === openOccurrence.commitment.categoryId)}
          account={data?.accounts.find((a) => a.id === openOccurrence.commitment.accountId)}
          onEdit={() => {
            setEditing(openOccurrence.commitment)
            setOpenOccurrence(null)
          }}
          onClose={() => setOpenOccurrence(null)}
        />
      )}
      {editing && <CommitmentSheet commitment={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** Botão de calendário com a janela; abre um menu de vidro com 1, 3, 6 e 12 meses. */
function WindowMenu({ months, onChange }: { months: number; onChange: (months: number) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const label = (n: number) => (n === 1 ? t('balance.oneMonth') : t('balance.months', { count: n }))

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('balance.window')}: ${label(months)}`}
        onClick={() => setOpen(!open)}
        className="glass glass-press flex h-[46px] items-center gap-[7px] rounded-full pr-4 pl-3.5 font-semibold tracking-[-0.02em] whitespace-nowrap text-ink"
      >
        <CalendarIcon />
        {label(months)}
      </button>
      {open && (
        <div role="menu" className="glass-menu absolute top-[52px] left-0 z-30 w-[214px] rounded-[24px] py-1.5 text-ink">
          <p className="pt-1.5 pr-[18px] pb-1.5 pl-[46px] text-[13px] tracking-normal text-ink-2">{t('balance.show')}</p>
          {BALANCE_WINDOWS.map((n) => (
            <button
              key={n}
              type="button"
              role="menuitemradio"
              aria-checked={n === months}
              onClick={() => {
                onChange(n)
                setOpen(false)
              }}
              className="relative flex min-h-11 w-full items-center pr-[18px] pl-[46px] text-left active:bg-[var(--tab-sel)]"
            >
              {n === months && (
                <span className="absolute top-1/2 left-4 -translate-y-1/2">
                  <CheckIcon />
                </span>
              )}
              {label(n)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Um mês na barra do Armazenamento: o total é a conta + a receber, as partes são as faturas e os
 * compromissos, e o espaço escuro é o saldo previsto, com o valor dentro.
 */
function MonthCard({ month, withIncome, onOpen }: { month: BalanceMonth; withIncome: boolean; onOpen: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const money = (cents: number) => formatMoney(cents, locale)
  const total = withIncome ? month.start.withIncome + month.receivable : month.start.withoutIncome
  const end = withIncome ? month.end.withIncome : month.end.withoutIncome
  const bills = month.bills.reduce((s, b) => s + b.amount, 0)
  const commitments = month.committed - bills
  const base = Math.max(total, month.committed, 1)
  const free = Math.max(0, end)
  const width = (cents: number) => `${((cents / base) * 100).toFixed(2)}%`
  const freeFits = free / base >= 0.28

  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-block bg-card px-4 pt-3.5 pb-[15px] text-left active:bg-card-pressed">
      <div className="flex items-start gap-2">
        <span className="flex-1 font-semibold tracking-[-0.02em]">{formatMonth(month.month, locale)}</span>
        <span className="tabular-nums">{money(end)}</span>
        <Disclosure />
      </div>
      <p className="mt-0.5 text-[15px] tracking-[-0.012em] text-ink-2 tabular-nums">
        {withIncome ? t('balance.accountPlusReceivable', { amount: money(total) }) : t('balance.accountOnly', { amount: money(total) })}
      </p>
      <div aria-hidden="true" className="mt-2.5 flex h-[22px] gap-[1.5px] overflow-hidden rounded-[5px] bg-bar-free">
        {bills > 0 && <span className="h-full min-w-[2px]" style={{ width: width(bills), background: 'var(--cat-indigo)' }} />}
        {commitments > 0 && <span className="h-full min-w-[2px]" style={{ width: width(commitments), background: 'var(--cat-teal)' }} />}
        {free > 0 && (
          <span className="flex h-full min-w-0 items-center justify-center" style={{ width: width(free) }}>
            {freeFits && <b className="text-[15px] font-medium whitespace-nowrap tabular-nums">{money(free)}</b>}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[15px] leading-snug tabular-nums">
        {bills > 0 && <Legend color="var(--cat-indigo)">{`${t('balance.bills')} ${money(bills)}`}</Legend>}
        {commitments > 0 && <Legend color="var(--cat-teal)">{`${t('balance.commitments')} ${money(commitments)}`}</Legend>}
        <Legend>{t('balance.balanceAmount', { amount: money(end) })}</Legend>
      </div>
    </button>
  )
}

function Legend({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      <i
        className={`mr-1.5 inline-block size-[9px] rounded-full align-[1px] ${color ? '' : 'bg-bar-free shadow-[inset_0_0_0_1px_var(--separator)]'}`}
        style={color ? { background: color } : undefined}
      />
      {children}
    </span>
  )
}

/** "Hoje": cada conta corrente, os investimentos e o saldo atual. */
function TodayBlock({ data, investments }: { data: BalanceView; investments: boolean }) {
  const { t, i18n } = useTranslation()
  const money = (cents: number) => formatMoney(cents, i18n.language)
  const invested = data.investments.reduce((s, i) => s + i.balance, 0)
  return (
    <Block>
      {data.accounts
        .filter((a) => a.kind === 'checking')
        .map((account) => (
          <AccountRow
            key={account.id}
            color={bankColor(account, data.itemOrder)}
            title={account.name}
            lines={[account.last4 ? `${t('balance.checking')} •${account.last4}` : t('balance.checking')]}
            amount={money(account.balance)}
          />
        ))}
      {data.investments.length > 0 && (
        <AccountRow
          icon={<GrowthIcon />}
          title={t('balance.investments')}
          tag={investments ? undefined : t('balance.outOfBalance')}
          lines={[t('balance.activeInvestments', { count: data.investments.length })]}
          amount={money(invested)}
          struck={!investments}
        />
      )}
      <div className="flex items-center justify-between gap-3 px-4 py-[13px]">
        <span className="font-semibold tracking-[-0.02em]">{t('balance.currentBalance')}</span>
        <span className="font-semibold tabular-nums">{money(data.current)}</span>
      </div>
    </Block>
  )
}

/** Linha de conta com o cartãozinho na cor do banco (ou um ícone), como as miniaturas da Carteira. */
function AccountRow({
  color,
  icon,
  title,
  tag,
  lines,
  amount,
  struck = false,
}: {
  color?: string
  icon?: ReactNode
  title: string
  tag?: string | undefined
  lines: string[]
  amount: string
  struck?: boolean
}) {
  return (
    <div className="flex w-full items-start gap-3 px-4 py-[13px]">
      <span
        className="relative mt-px grid h-[23px] w-[34px] shrink-0 place-items-center overflow-hidden rounded-[5px] text-ink-2"
        style={{ background: color ?? 'var(--card-pressed)' }}
      >
        {icon}
        {color && <span className="absolute inset-0 bg-[linear-gradient(135deg,rgb(255_255_255/0.28),transparent_55%)]" />}
      </span>
      <div className="min-w-0 flex-1 leading-[1.3]">
        <p className="flex min-w-0 items-baseline font-semibold tracking-[-0.02em]">
          <span className="truncate">{title}</span>
          {tag && (
            <span className="shrink-0">
              <Tag>{tag}</Tag>
            </span>
          )}
        </p>
        {lines.map((line, i) => (
          <p key={i} className={`truncate text-[15px] tracking-[-0.012em] text-ink-2 ${i === 0 ? 'mt-0.5' : ''}`}>
            {line}
          </p>
        ))}
      </div>
      <p className={`shrink-0 pt-0.5 text-[15px] tracking-[-0.012em] text-ink-2 tabular-nums ${struck ? 'line-through' : ''}`}>{amount}</p>
    </div>
  )
}

/** Detalhe de um mês: de onde parte, o que entra, as faturas e os compromissos. */
function MonthDetail({
  month,
  first,
  withIncome,
  prefs,
  data,
  onOpenOccurrence,
}: {
  month: BalanceMonth
  first: boolean
  withIncome: boolean
  prefs: BalancePrefs
  data: BalanceView
  onOpenOccurrence: (occurrence: ReconciledOccurrence) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const money = (cents: number, signed = false) => formatMoney(cents, locale, { signed })
  const start = withIncome ? month.start.withIncome : month.start.withoutIncome
  const end = withIncome ? month.end.withIncome : month.end.withoutIncome
  const name = (o: ReconciledOccurrence) => data.commitments.get(o.commitmentId)?.name ?? ''
  const byDate = (list: ReconciledOccurrence[]) => [...list].sort((a, b) => a.date.localeCompare(b.date))
  const tags = (o: ReconciledOccurrence) => (
    <>
      {o.installment && <Tag>{t('commitments.installmentOf', o.installment)}</Tag>}
      {o.status === 'late' && <Tag tone="warning">{t('link.late')}</Tag>}
    </>
  )

  return (
    <>
      <DetailHero
        amount={money(end)}
        positive={false}
        title={t('balance.forecastOn', { date: formatShortDate(lastDay(month.month), locale) })}
        subtitle={withIncome ? t('balance.withIncomeNote') : t('balance.withoutIncomeNote')}
      />
      <Block>
        <ListRow
          title={first ? t('balance.currentBalance') : t('balance.previousBalance')}
          line1={
            first
              ? prefs.investments
                ? t('balance.accountsAndInvestments')
                : t('balance.accountsOnly')
              : t('balance.previousOn', { date: formatShortDate(lastDay(addMonths(month.month, -1)), locale) })
          }
          amount={money(start)}
          positive={false}
        />
      </Block>
      {withIncome && month.inflows.length > 0 && (
        <DetailSection title={t('balance.receivable')}>
          <Block>
            {byDate(month.inflows).map((o) => (
              <ListRow
                key={o.key}
                title={name(o)}
                line1={
                  <>
                    {t('balance.expectedOn', { date: dayMonth(o.date, locale) })}
                    {tags(o)}
                  </>
                }
                amount={money(o.amount, true)}
                positive
                onClick={() => onOpenOccurrence(o)}
              />
            ))}
          </Block>
        </DetailSection>
      )}
      {month.bills.length > 0 && (
        <DetailSection title={t('balance.bills')}>
          <Block>
            {month.bills.map((bill) => {
              const account = data.accounts.find((a) => a.id === bill.accountId)
              return (
                <ListRow
                  key={`${bill.accountId}-${bill.date}`}
                  title={account?.name ?? ''}
                  line1={t('balance.dueOn', { date: dayMonth(bill.date, locale) })}
                  amount={money(bill.amount)}
                  positive={false}
                />
              )
            })}
          </Block>
        </DetailSection>
      )}
      {month.outflows.length > 0 && (
        <DetailSection title={t('balance.commitments')}>
          <Block>
            {byDate(month.outflows).map((o) => (
              <ListRow
                key={o.key}
                title={name(o)}
                line1={
                  <>
                    {dayMonth(o.date, locale)}
                    {tags(o)}
                  </>
                }
                amount={money(-o.amount)}
                positive={false}
                onClick={() => onOpenOccurrence(o)}
              />
            ))}
          </Block>
        </DetailSection>
      )}
      <Foot>
        {withIncome
          ? t('balance.formulaWithIncome', { start: first ? t('balance.startCurrent') : t('balance.startPrevious') })
          : t('balance.formulaWithoutIncome', { start: first ? t('balance.startCurrent') : t('balance.startPrevious') })}
      </Foot>
    </>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mx-4 mt-[30px] mb-3 text-[22px] leading-tight font-bold tracking-[-0.02em]">{children}</h2>
}

function Foot({ children }: { children: ReactNode }) {
  return <p className="px-4 pt-2 text-[13px] leading-[1.38] tracking-[-0.006em] text-ink-2">{children}</p>
}

function bankColor(account: BankAccount, itemOrder: string[]): string {
  const i = itemOrder.indexOf(account.itemId)
  return i >= 0 ? BANK_COLORS[i % BANK_COLORS.length]! : 'var(--cat-gray)'
}

/** Último dia do mês (o saldo previsto é desse dia). */
function lastDay(month: YearMonth): string {
  return dateInMonth(month, 31)
}

/** "10/12" (ou "12/10" em inglês). */
function dayMonth(date: string, locale: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1))
}
