import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** Quanto a bolinha anda de um lado ao outro, em px (trilho de 64 px, bolinha de 39 px, 2 px de borda). */
const TRAVEL = 21
/** Tempo da lente ao tocar: ela desliza grande e só então volta a ser a bolinha branca. */
const LENS_MS = 280

/**
 * Botão liga/desliga do iOS 26 (vídeo em evidencias/botao/): ao tocar, a bolinha vira uma lente de
 * vidro maior que o trilho, com borda de arco-íris, desliza enquanto o trilho muda de cor e volta a
 * ser branca com um quique. Segurando, a lente fica grande e acompanha o dedo; ao soltar, vai para o
 * lado mais perto.
 */
export function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (checked: boolean) => void; labelledBy: string }) {
  const [pressing, setPressing] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const gesture = useRef<{ id: number; x0: number; moved: boolean } | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /** Muda o estado; com a lente, ela continua grande enquanto desliza. */
  function settle(next: boolean, lens: boolean) {
    window.clearTimeout(timer.current)
    if (lens && !reduceMotion()) {
      setPressing(true)
      timer.current = window.setTimeout(() => setPressing(false), LENS_MS)
    } else {
      setPressing(false)
    }
    if (next !== checked) onChange(next)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    gesture.current = { id: event.pointerId, x0: event.clientX, moved: false }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Sem captura, segue só com o toque.
    }
    window.clearTimeout(timer.current)
    setPressing(true)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const g = gesture.current
    const el = ref.current
    if (!g || g.id !== event.pointerId || !el) return
    // O botão pode estar dentro de algo que cresce ao toque: converte para a escala dele.
    const dx = ((event.clientX - g.x0) * el.offsetWidth) / el.getBoundingClientRect().width
    if (!g.moved && Math.abs(dx) < 3) return
    g.moved = true
    setDrag(Math.max(0, Math.min(TRAVEL, (checked ? TRAVEL : 0) + dx)))
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    gesture.current = null
    const next = cancelled ? checked : g.moved ? (drag ?? 0) > TRAVEL / 2 : !checked
    setDrag(null)
    settle(next, !g.moved && !cancelled)
  }

  const on = drag !== null ? drag > TRAVEL / 2 : checked
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      className={`switch ${on ? 'on' : ''} ${pressing ? 'pressing' : ''} ${drag !== null ? 'dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerEnd(e, false)}
      onPointerCancel={(e) => onPointerEnd(e, true)}
      // Toque e mouse são tratados acima; aqui, só o teclado (espaço ou Enter).
      onClick={(e) => {
        if (e.detail === 0) settle(!checked, true)
      }}
    >
      <span className="switch-knob" style={drag !== null ? { translate: `${drag}px 0` } : undefined} />
    </button>
  )
}
