import { useEffect, useState, type ReactElement } from 'react'
import { QuickAddSheet } from './components/QuickAddSheet'
import { TabBar, type Tab } from './components/TabBar'
import { currentMonth, type YearMonth } from './lib/month'
import { BankSettings } from './screens/BankSettings'
import { CategoriesSettings } from './screens/CategoriesSettings'
import { Balance } from './screens/Balance'
import { Commitments } from './screens/Commitments'
import { Settings } from './screens/Settings'
import { Statement } from './screens/Statement'
import { syncNow } from './sync/runSync'

export function App() {
  const [tab, setTab] = useState<Tab>('statement')
  // O mês escolhido vale para Extrato, Compromissos e Saldo ao mesmo tempo.
  const [month, setMonth] = useState<YearMonth>(() => currentMonth())
  const [settingsPage, setSettingsPage] = useState<'main' | 'banks' | 'categories'>('main')
  const [adding, setAdding] = useState(false)

  // Atualiza ao abrir o app (o Meu Pluggy lê os bancos a cada 24 h).
  useEffect(() => {
    void syncNow()
  }, [])

  const openBanks = () => {
    setSettingsPage('banks')
    setTab('settings')
  }

  const selectTab = (next: Tab) => {
    if (next === 'settings' && tab === 'settings') setSettingsPage('main')
    setTab(next)
  }

  const screens: Record<Tab, ReactElement> = {
    statement: <Statement month={month} onMonthChange={setMonth} onOpenBanks={openBanks} />,
    commitments: <Commitments />,
    balance: <Balance month={month} onMonthChange={setMonth} />,
    settings:
      settingsPage === 'banks' ? (
        <BankSettings onBack={() => setSettingsPage('main')} />
      ) : settingsPage === 'categories' ? (
        <CategoriesSettings onBack={() => setSettingsPage('main')} />
      ) : (
        <Settings onOpenBanks={() => setSettingsPage('banks')} onOpenCategories={() => setSettingsPage('categories')} />
      ),
  }

  return (
    <div className="min-h-dvh pb-[calc(env(safe-area-inset-bottom)+6rem)]">
      <main className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)]">{screens[tab]}</main>
      <TabBar active={tab} onSelect={selectTab} onAdd={() => setAdding(true)} />
      {adding && <QuickAddSheet onClose={() => setAdding(false)} />}
    </div>
  )
}
