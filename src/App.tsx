import { useState, type ReactElement } from 'react'
import { QuickAddSheet } from './components/QuickAddSheet'
import { TabBar, type Tab } from './components/TabBar'
import { currentMonth, type YearMonth } from './lib/month'
import { Balance } from './screens/Balance'
import { Commitments } from './screens/Commitments'
import { Settings } from './screens/Settings'
import { Statement } from './screens/Statement'

export function App() {
  const [tab, setTab] = useState<Tab>('statement')
  // O mês escolhido vale para Extrato, Compromissos e Saldo ao mesmo tempo.
  const [month, setMonth] = useState<YearMonth>(() => currentMonth())
  const [adding, setAdding] = useState(false)

  const screens: Record<Tab, ReactElement> = {
    statement: <Statement month={month} onMonthChange={setMonth} />,
    commitments: <Commitments month={month} onMonthChange={setMonth} />,
    balance: <Balance month={month} onMonthChange={setMonth} />,
    settings: <Settings />,
  }

  return (
    <div className="min-h-dvh pb-[calc(env(safe-area-inset-bottom)+6rem)]">
      <main className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)]">{screens[tab]}</main>
      <TabBar active={tab} onSelect={setTab} onAdd={() => setAdding(true)} />
      {adding && <QuickAddSheet onClose={() => setAdding(false)} />}
    </div>
  )
}
