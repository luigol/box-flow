import type { ReactNode, SVGProps } from 'react'

/** Ícones de traço fino, no estilo dos SF Symbols. Herdam a cor do texto. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const ListIcon = () => (
  <Icon>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <circle cx="4" cy="6" r="0.8" fill="currentColor" />
    <circle cx="4" cy="12" r="0.8" fill="currentColor" />
    <circle cx="4" cy="18" r="0.8" fill="currentColor" />
  </Icon>
)

export const RepeatIcon = () => (
  <Icon>
    <path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3" />
  </Icon>
)

export const ChartIcon = () => (
  <Icon>
    <path d="M4 4v16h16" />
    <path d="m7 15 4-4 3 3 5-6" />
  </Icon>
)

export const SlidersIcon = () => (
  <Icon>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Icon>
)

export const CalendarIcon = () => (
  <Icon width={22} height={22}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    <circle cx="8.5" cy="13.5" r="0.7" fill="currentColor" />
    <circle cx="12" cy="13.5" r="0.7" fill="currentColor" />
    <circle cx="15.5" cy="13.5" r="0.7" fill="currentColor" />
    <circle cx="8.5" cy="17" r="0.7" fill="currentColor" />
    <circle cx="12" cy="17" r="0.7" fill="currentColor" />
  </Icon>
)

/** Investimento: a linha que sobe. */
export const GrowthIcon = () => (
  <Icon strokeWidth={2} width={16} height={16}>
    <path d="m4 16 5-5 3 3 7-7" />
    <path d="M15 7h4v4" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const ChevronLeftIcon = () => (
  <Icon strokeWidth={2}>
    <path d="m15 5-7 7 7 7" />
  </Icon>
)

export const ChevronRightIcon = () => (
  <Icon strokeWidth={2}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
)

/** Seta das linhas que abrem detalhe: pequena e de traço grosso, como no iPhone. */
export const DisclosureIcon = () => (
  <Icon strokeWidth={3} width={13} height={13}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon strokeWidth={2.4} width={20} height={20}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
)

export const RefreshIcon =({ spinning = false }: { spinning?: boolean }) => (
  <Icon strokeWidth={2} width={22} height={22} className={spinning ? 'animate-spin' : undefined}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </Icon>
)
