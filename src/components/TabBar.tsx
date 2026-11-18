import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChartIcon, ListIcon, PlusIcon, RepeatIcon, SlidersIcon } from './icons'

export type Tab = 'statement' | 'commitments' | 'balance' | 'settings'

const TABS: { tab: Tab; icon: ReactNode }[] = [
  { tab: 'statement', icon: <ListIcon /> },
  { tab: 'commitments', icon: <RepeatIcon /> },
  { tab: 'balance', icon: <ChartIcon /> },
  { tab: 'settings', icon: <SlidersIcon /> },
]

/** Tamanho da lente enquanto o dedo está na barra. */
const LENS = '1.14 1.32'

interface TabBarProps {
  active: Tab
  onSelect: (tab: Tab) => void
  onAdd: () => void
}

/**
 * Barra de abas de vidro, como a do app Arquivos no iOS 26 (docs/design.md, "Visual"): a seleção é
 * uma pílula; ao tocar, a barra cresce e a pílula vira uma lente que desliza até a aba, esticando
 * no caminho e quicando no fim; dá para segurar e arrastar. O lançamento rápido (+) fica num
 * círculo de vidro ao lado.
 */
export function TabBar({ active, onSelect, onAdd }: TabBarProps) {
  const { t } = useTranslation()
  const navRef = useRef<HTMLElement>(null)
  const lensRef = useRef<HTMLSpanElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  // Estado da animação fora do React: muda a cada movimento do dedo.
  const motion = useRef({ at: -1, x: 0, travelling: false, gesture: null as { id: number; x0: number; moved: boolean } | null })
  const activeIndex = Math.max(0, TABS.findIndex((item) => item.tab === active))

  const setX = useCallback((x: number, width?: number) => {
    const lens = lensRef.current
    if (!lens) return
    motion.current.x = x
    lens.style.translate = `${x}px 0`
    if (width !== undefined) lens.style.width = `${width}px`
  }, [])

  const box = useCallback((i: number) => {
    const tab = tabRefs.current[i]
    return { x: tab?.offsetLeft ?? 0, width: tab?.offsetWidth ?? 0 }
  }, [])

  const nearest = useCallback((center: number) => {
    let best = 0
    let distance = Infinity
    tabRefs.current.forEach((tab, i) => {
      if (!tab) return
      const d = Math.abs(tab.offsetLeft + tab.offsetWidth / 2 - center)
      if (d < distance) {
        distance = d
        best = i
      }
    })
    return best
  }, [])

  const markUnder = useCallback((i: number) => {
    tabRefs.current.forEach((tab, k) => tab?.classList.toggle('under', k === i))
  }, [])

  /** A seleção desliza até a aba `i`; com lente, volta a ser pílula ao chegar. */
  const travel = useCallback(
    (i: number, withLens: boolean) => {
      const lens = lensRef.current
      if (!lens) return
      const from = motion.current.x
      const { x: to, width } = box(i)
      lens.style.width = `${width}px`
      const far = Math.abs(to - from) > 4
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const duration = reduce ? 1 : far ? 560 : 380
      lens.getAnimations().forEach((a) => a.cancel())
      if (withLens) lens.classList.add('lens')
      motion.current.travelling = true
      const animation = lens.animate(
        [
          { translate: `${from}px 0`, scale: withLens ? LENS : '1 1' },
          { translate: `${from + (to - from) * 0.6}px 0`, scale: far ? (withLens ? '1.5 1.18' : '1.22 0.92') : withLens ? LENS : '1 1', offset: 0.4 },
          { translate: `${to}px 0`, scale: withLens ? LENS : '1.03 0.97', offset: 0.72 },
          { translate: `${to}px 0`, scale: '0.96 1.04', offset: 0.88 },
          { translate: `${to}px 0`, scale: '1 1' },
        ],
        { duration, easing: 'cubic-bezier(.25,.75,.3,1)' },
      )
      setX(to)
      motion.current.at = i
      if (withLens) window.setTimeout(() => lens.classList.remove('lens'), duration * 0.7)
      const done = () => {
        motion.current.travelling = false
      }
      animation.onfinish = done
      animation.oncancel = done
    },
    [box, setX],
  )

  // Aba trocada por fora (outra tela, link): a seleção desliza sem lente.
  useLayoutEffect(() => {
    const m = motion.current
    if (m.gesture) return
    if (m.at < 0 || !navRef.current?.offsetWidth) {
      const { x, width } = box(activeIndex)
      setX(x, width)
      m.at = activeIndex
    } else if (m.at !== activeIndex) {
      travel(activeIndex, false)
    }
  }, [activeIndex, box, setX, travel])

  // Mudou a largura (rotação, teclado): reposiciona.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const observer = new ResizeObserver(() => {
      const m = motion.current
      if (m.gesture || m.travelling || m.at < 0) return
      const { x, width } = box(m.at)
      setX(x, width)
    })
    observer.observe(nav)
    return () => observer.disconnect()
  }, [box, setX])

  /** Ponto da tela → coordenada dentro da barra (que cresce ao ser tocada). */
  const toLocalX = (clientX: number) => {
    const nav = navRef.current
    if (!nav) return 0
    const rect = nav.getBoundingClientRect()
    return (clientX - rect.left) * (nav.offsetWidth / rect.width)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    lensRef.current?.getAnimations().forEach((a) => a.finish())
    motion.current.gesture = { id: event.pointerId, x0: event.clientX, moved: false }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Sem captura, segue só com o toque.
    }
    event.currentTarget.classList.add('pressing')
    lensRef.current?.classList.add('lens', 'pop')
    markUnder(motion.current.at)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = motion.current.gesture
    const lens = lensRef.current
    const nav = navRef.current
    if (!gesture || gesture.id !== event.pointerId || !lens || !nav) return
    if (!gesture.moved && Math.abs(event.clientX - gesture.x0) < 8) return
    gesture.moved = true
    const width = lens.offsetWidth
    const x = Math.max(4, Math.min(nav.offsetWidth - 4 - width, toLocalX(event.clientX) - width / 2))
    setX(x)
    markUnder(nearest(x + width / 2))
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLElement>, cancelled: boolean) {
    const gesture = motion.current.gesture
    if (!gesture || gesture.id !== event.pointerId) return
    const lens = lensRef.current
    const target = cancelled
      ? motion.current.at
      : gesture.moved
        ? nearest(motion.current.x + (lens?.offsetWidth ?? 0) / 2)
        : nearest(toLocalX(event.clientX))
    motion.current.gesture = null
    event.currentTarget.classList.remove('pressing')
    lens?.classList.remove('pop')
    markUnder(-1)
    travel(target, true)
    const tab = TABS[target]?.tab
    // Tocar na aba em que já está também conta: em Ajustes, volta para o começo.
    if (!cancelled && tab) onSelect(tab)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
      <div className="tabbar-fade absolute inset-x-0 bottom-0 h-32" />
      <div className="pointer-events-auto relative mx-auto flex max-w-xl items-center gap-2.5 px-3.5 pb-[max(calc(env(safe-area-inset-bottom)-0.5rem),0.75rem)]">
        <nav
          ref={navRef}
          aria-label={t('tabs.label')}
          className="tabbar glass relative flex h-16 flex-1 rounded-full p-1"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => onPointerEnd(e, false)}
          onPointerCancel={(e) => onPointerEnd(e, true)}
        >
          <span ref={lensRef} aria-hidden="true" className="tab-lens" />
          {TABS.map(({ tab, icon }, i) => (
            <button
              key={tab}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              aria-current={active === tab ? 'page' : undefined}
              // Toque e mouse são tratados acima (onPointerUp); aqui, só o teclado.
              onClick={(e) => {
                if (e.detail === 0) onSelect(tab)
              }}
              className="tab-item flex flex-1 flex-col items-center justify-center gap-px rounded-[28px] text-[10px] leading-[1.15] font-semibold tracking-normal text-ink"
            >
              {icon}
              <span>{t(`tabs.${tab}`)}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={onAdd}
          aria-label={t('tabs.add')}
          className="glass glass-press grid size-16 shrink-0 place-items-center rounded-full text-ink"
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  )
}
