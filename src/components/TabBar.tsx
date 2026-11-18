import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChartIcon, ListIcon, PlusIcon, RepeatIcon, SlidersIcon } from './icons'

export type Tab = 'statement' | 'commitments' | 'balance' | 'settings'

interface TabBarProps {
  active: Tab
  onSelect: (tab: Tab) => void
  onAdd: () => void
}

export function TabBar({ active, onSelect, onAdd }: TabBarProps) {
  const { t } = useTranslation()

  const item = (tab: Tab, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => onSelect(tab)}
      aria-current={active === tab ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 pt-2 text-[10px] font-medium tracking-normal ${
        active === tab ? 'text-accent' : 'text-ink-2'
      }`}
    >
      {icon}
      {t(`tabs.${tab}`)}
    </button>
  )

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t-[0.5px] border-separator bg-bar pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-180">
      <div className="mx-auto flex max-w-xl items-start px-2 pb-1">
        {item('statement', <ListIcon />)}
        {item('commitments', <RepeatIcon />)}
        <div className="flex flex-1 justify-center pt-1.5">
          <button
            type="button"
            onClick={onAdd}
            aria-label={t('tabs.add')}
            className="grid size-11 place-items-center rounded-full bg-accent text-on-accent active:opacity-80"
          >
            <PlusIcon />
          </button>
        </div>
        {item('balance', <ChartIcon />)}
        {item('settings', <SlidersIcon />)}
      </div>
    </nav>
  )
}
